import type {
  Concept,
  ConceptLockState,
  DifficultyLevel,
  LearningPathStep,
  PersonalizedLearningPath,
  PrerequisiteEdge,
  QuizOptionKey,
} from '../types/learnpath.ts';

export interface GraphNodeRef {
  id: string;
  title: string;
  status?: string;
  order_index?: number;
  difficulty?: DifficultyLevel;
  description?: string;
  estimated_minutes?: number;
}

export interface GraphEdgeRef {
  prerequisite_concept_id: string;
  dependent_concept_id: string;
}

export interface CycleCheckResult {
  hasCycle: boolean;
  cyclePathIds: string[];
  cyclePathTitles: string[];
  explanation: string | null;
}

/**
 * Checks whether adding directed edge (prerequisiteId -> dependentId)
 * creates a cycle in the Directed Acyclic Graph (DAG).
 *
 * Adding edge A -> B creates a cycle iff:
 * 1) A === B (self-loop), OR
 * 2) B can already reach A via existing directed edges.
 */
export function detectCycleOnAddEdge(
  nodes: GraphNodeRef[],
  existingEdges: GraphEdgeRef[],
  prerequisiteId: string,
  dependentId: string,
): CycleCheckResult {
  const titleMap = new Map<string, string>();
  for (const n of nodes) {
    titleMap.set(n.id, n.title);
  }

  const prereqTitle = titleMap.get(prerequisiteId) ?? prerequisiteId;
  const depTitle = titleMap.get(dependentId) ?? dependentId;

  if (prerequisiteId === dependentId) {
    const cyclePathTitles = [prereqTitle, prereqTitle];
    return {
      hasCycle: true,
      cyclePathIds: [prerequisiteId, prerequisiteId],
      cyclePathTitles,
      explanation: `Cannot add this prerequisite because a concept cannot require itself: ${cyclePathTitles.join(' → ')}.`,
    };
  }

  const duplicate = existingEdges.some(
    (e) =>
      e.prerequisite_concept_id === prerequisiteId &&
      e.dependent_concept_id === dependentId,
  );
  if (duplicate) {
    return {
      hasCycle: false,
      cyclePathIds: [],
      cyclePathTitles: [],
      explanation: null,
    };
  }

  // Build adjacency list: prerequisite -> dependent[]
  const adj = new Map<string, string[]>();
  for (const e of existingEdges) {
    const list = adj.get(e.prerequisite_concept_id) ?? [];
    list.push(e.dependent_concept_id);
    adj.set(e.prerequisite_concept_id, list);
  }

  // BFS/DFS from dependentId to see if it can reach prerequisiteId
  const visited = new Set<string>();
  const parent = new Map<string, string | null>();
  const queue: string[] = [dependentId];
  visited.add(dependentId);
  parent.set(dependentId, null);

  let found = false;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === prerequisiteId) {
      found = true;
      break;
    }
    const neighbors = adj.get(current) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next);
        parent.set(next, current);
        queue.push(next);
      }
    }
  }

  if (!found) {
    return {
      hasCycle: false,
      cyclePathIds: [],
      cyclePathTitles: [],
      explanation: null,
    };
  }

  // Reconstruct path from dependentId -> ... -> prerequisiteId
  const pathFromDepToPrereq: string[] = [];
  let cursor: string | null = prerequisiteId;
  while (cursor !== null) {
    pathFromDepToPrereq.push(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  pathFromDepToPrereq.reverse();

  // Full cycle starting at prerequisiteId -> dependentId -> ... -> prerequisiteId
  const cyclePathIds = [prerequisiteId, ...pathFromDepToPrereq];
  const cyclePathTitles = cyclePathIds.map((id) => titleMap.get(id) ?? id);

  return {
    hasCycle: true,
    cyclePathIds,
    cyclePathTitles,
    explanation: `Cannot add this prerequisite because it creates a learning cycle: ${cyclePathTitles.join(' → ')}.`,
  };
}

/**
 * Validates an entire set of nodes and edges to guarantee the graph is a strict DAG.
 */
export function validateGraphAcyclic(
  nodes: GraphNodeRef[],
  edges: GraphEdgeRef[],
): { valid: boolean; cyclePathTitles: string[]; explanation: string | null } {
  const checkedEdges: GraphEdgeRef[] = [];
  for (const edge of edges) {
    const result = detectCycleOnAddEdge(
      nodes,
      checkedEdges,
      edge.prerequisite_concept_id,
      edge.dependent_concept_id,
    );
    if (result.hasCycle) {
      return {
        valid: false,
        cyclePathTitles: result.cyclePathTitles,
        explanation: result.explanation,
      };
    }
    checkedEdges.push(edge);
  }
  return { valid: true, cyclePathTitles: [], explanation: null };
}

/**
 * Computes direct active prerequisites that have NOT yet been mastered for a given concept.
 */
export function getMissingPrerequisites(
  conceptId: string,
  concepts: GraphNodeRef[],
  edges: GraphEdgeRef[],
  masteredConceptIds: Set<string>,
): Array<{ id: string; title: string }> {
  const activeMap = new Map<string, GraphNodeRef>();
  for (const c of concepts) {
    if (!c.status || c.status === 'active') {
      activeMap.set(c.id, c);
    }
  }

  const missing: Array<{ id: string; title: string }> = [];
  for (const edge of edges) {
    if (edge.dependent_concept_id !== conceptId) continue;
    const prereq = activeMap.get(edge.prerequisite_concept_id);
    if (!prereq) continue;
    if (!masteredConceptIds.has(prereq.id)) {
      missing.push({ id: prereq.id, title: prereq.title });
    }
  }

  missing.sort((a, b) => a.title.localeCompare(b.title));
  return missing;
}

export function formatLockExplanation(
  missingPrerequisites: Array<{ id: string; title: string }>,
): string | null {
  if (missingPrerequisites.length === 0) return null;
  if (missingPrerequisites.length === 1) {
    return `Locked: Complete and pass the ${missingPrerequisites[0].title} quiz first.`;
  }
  const names = missingPrerequisites.map((p) => p.title);
  const last = names.pop()!;
  return `Locked: Complete and pass the ${names.join(', ')} and ${last} quizzes first.`;
}

/**
 * Computes lock state ('mastered' | 'unlocked' | 'locked' | 'retired') for every concept.
 */
export function computeConceptStates(
  concepts: GraphNodeRef[],
  edges: GraphEdgeRef[],
  masteredConceptIds: Set<string>,
): Map<
  string,
  {
    lockState: ConceptLockState;
    missingPrerequisites: Array<{ id: string; title: string }>;
    lockReason: string | null;
  }
> {
  const result = new Map<
    string,
    {
      lockState: ConceptLockState;
      missingPrerequisites: Array<{ id: string; title: string }>;
      lockReason: string | null;
    }
  >();

  for (const concept of concepts) {
    if (concept.status && concept.status !== 'active') {
      result.set(concept.id, {
        lockState: 'retired',
        missingPrerequisites: [],
        lockReason:
          concept.status === 'split'
            ? 'Concept was split into granular child concepts; historical progress is preserved.'
            : 'Concept has been retired from active curriculum; historical progress is preserved.',
      });
      continue;
    }

    if (masteredConceptIds.has(concept.id)) {
      result.set(concept.id, {
        lockState: 'mastered',
        missingPrerequisites: [],
        lockReason: null,
      });
      continue;
    }

    const missing = getMissingPrerequisites(
      concept.id,
      concepts,
      edges,
      masteredConceptIds,
    );

    if (missing.length === 0) {
      result.set(concept.id, {
        lockState: 'unlocked',
        missingPrerequisites: [],
        lockReason: null,
      });
    } else {
      result.set(concept.id, {
        lockState: 'locked',
        missingPrerequisites: missing,
        lockReason: formatLockExplanation(missing),
      });
    }
  }

  return result;
}

/**
 * Generates a deterministic personalized learning path to reach `targetConceptId`.
 * - Finds full prerequisite closure (all ancestor prerequisites + target).
 * - Excludes already-mastered concepts from `ordered_remaining_steps`.
 * - Uses deterministic Kahn's topological sort (breaking ties by order_index, then title).
 * - Computes estimated remaining time from lesson durations (fallback to concept estimated_minutes).
 */
export function generatePersonalizedLearningPath(
  courseId: string,
  targetConceptId: string,
  concepts: Concept[],
  edges: PrerequisiteEdge[],
  masteredConceptIds: Set<string>,
  lessonDurationsByConcept: Map<string, number>,
): PersonalizedLearningPath {
  const activeConcepts = concepts.filter((c) => c.status === 'active');
  const conceptMap = new Map<string, Concept>();
  for (const c of activeConcepts) {
    conceptMap.set(c.id, c);
  }

  const target = conceptMap.get(targetConceptId);
  if (!target) {
    throw new Error('Target concept not found or is no longer active.');
  }

  // Reverse adjacency list: dependent -> prerequisite[]
  const prereqsOf = new Map<string, string[]>();
  const dependentsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!conceptMap.has(e.prerequisite_concept_id) || !conceptMap.has(e.dependent_concept_id)) {
      continue;
    }
    const pList = prereqsOf.get(e.dependent_concept_id) ?? [];
    pList.push(e.prerequisite_concept_id);
    prereqsOf.set(e.dependent_concept_id, pList);

    const dList = dependentsOf.get(e.prerequisite_concept_id) ?? [];
    dList.push(e.dependent_concept_id);
    dependentsOf.set(e.prerequisite_concept_id, dList);
  }

  // 1. Collect complete prerequisite dependency closure via reverse BFS
  const closureIds = new Set<string>([targetConceptId]);
  const stack = [targetConceptId];
  while (stack.length > 0) {
    const curr = stack.pop()!;
    for (const pId of prereqsOf.get(curr) ?? []) {
      if (!closureIds.has(pId)) {
        closureIds.add(pId);
        stack.push(pId);
      }
    }
  }

  // 2. Deterministic topological sort over closureIds (Kahn's algorithm)
  const inDegree = new Map<string, number>();
  for (const id of closureIds) {
    const prereqsInClosure = (prereqsOf.get(id) ?? []).filter((pid) => closureIds.has(pid));
    inDegree.set(id, prereqsInClosure.length);
  }

  const sortCandidates = (aId: string, bId: string): number => {
    const a = conceptMap.get(aId)!;
    const b = conceptMap.get(bId)!;
    if (a.order_index !== b.order_index) return a.order_index - b.order_index;
    return a.title.localeCompare(b.title);
  };

  const available: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) available.push(id);
  }
  available.sort(sortCandidates);

  const fullOrderedIds: string[] = [];
  while (available.length > 0) {
    const curr = available.shift()!;
    fullOrderedIds.push(curr);
    for (const depId of dependentsOf.get(curr) ?? []) {
      if (!closureIds.has(depId)) continue;
      const nextDeg = (inDegree.get(depId) ?? 0) - 1;
      inDegree.set(depId, nextDeg);
      if (nextDeg === 0) {
        available.push(depId);
        available.sort(sortCandidates);
      }
    }
  }

  const states = computeConceptStates(activeConcepts, edges, masteredConceptIds);

  const durationForConcept = (c: Concept): number => {
    const lessonTotal = lessonDurationsByConcept.get(c.id);
    if (lessonTotal !== undefined && lessonTotal > 0) return lessonTotal;
    return c.estimated_minutes;
  };

  let remainingStepCounter = 1;
  let nextRecommendedAssigned = false;

  const allDependencySteps: LearningPathStep[] = fullOrderedIds.map((id) => {
    const c = conceptMap.get(id)!;
    const state = states.get(id)!;
    const estMinutes = durationForConcept(c);
    const prereqIds = (prereqsOf.get(id) ?? []).filter((pid) => closureIds.has(pid));

    let stepStatus: LearningPathStep['status'];
    let stepNumber: number | null = null;

    if (state.lockState === 'mastered') {
      stepStatus = 'mastered';
    } else {
      stepNumber = remainingStepCounter++;
      if (!nextRecommendedAssigned && state.lockState === 'unlocked') {
        stepStatus = 'next_recommended';
        nextRecommendedAssigned = true;
      } else if (state.lockState === 'unlocked') {
        stepStatus = 'unlocked';
      } else {
        stepStatus = 'locked';
      }
    }

    return {
      concept_id: c.id,
      title: c.title,
      description: c.description,
      difficulty: c.difficulty,
      estimated_minutes: estMinutes,
      status: stepStatus,
      prerequisite_ids: prereqIds,
      missing_prerequisite_titles: state.missingPrerequisites.map((p) => p.title),
      is_target: c.id === targetConceptId,
      step_number: stepNumber,
    };
  });

  const completedPrerequisites = allDependencySteps.filter((s) => s.status === 'mastered');
  const orderedRemainingSteps = allDependencySteps.filter((s) => s.status !== 'mastered');

  const nextRecommendedConcept =
    orderedRemainingSteps.find((s) => s.status === 'next_recommended') ??
    orderedRemainingSteps.find((s) => s.status === 'unlocked') ??
    null;

  const estimatedRemainingMinutes = orderedRemainingSteps.reduce(
    (sum, s) => sum + s.estimated_minutes,
    0,
  );
  const totalDependencyMinutes = allDependencySteps.reduce(
    (sum, s) => sum + s.estimated_minutes,
    0,
  );
  const completionPercentage =
    allDependencySteps.length === 0
      ? 0
      : Math.round((completedPrerequisites.length / allDependencySteps.length) * 100);

  return {
    course_id: courseId,
    target_concept_id: targetConceptId,
    target_concept_title: target.title,
    ordered_remaining_steps: orderedRemainingSteps,
    completed_prerequisites: completedPrerequisites,
    all_dependency_steps: allDependencySteps,
    next_recommended_concept: nextRecommendedConcept,
    estimated_remaining_minutes: estimatedRemainingMinutes,
    total_dependency_minutes: totalDependencyMinutes,
    completion_percentage: completionPercentage,
  };
}

export interface QuizQuestionForEval {
  id: string;
  question_text: string;
  correct_option: QuizOptionKey;
  explanation: string;
}

export interface QuizEvaluationResult {
  score: number;
  correctCount: number;
  totalCount: number;
  passed: boolean;
  questionFeedback: Array<{
    question_id: string;
    selected_option: QuizOptionKey | null;
    correct_option: QuizOptionKey;
    is_correct: boolean;
    explanation: string;
  }>;
}

export function evaluateQuizSubmission(
  questions: QuizQuestionForEval[],
  submittedAnswers: Record<string, QuizOptionKey>,
  passingScore: number,
): QuizEvaluationResult {
  if (questions.length === 0) {
    throw new Error('Quiz has no questions configured.');
  }

  let correctCount = 0;
  const questionFeedback = questions.map((q) => {
    const selected = submittedAnswers[q.id] ?? null;
    const isCorrect = selected === q.correct_option;
    if (isCorrect) correctCount += 1;
    return {
      question_id: q.id,
      selected_option: selected,
      correct_option: q.correct_option,
      is_correct: isCorrect,
      explanation: q.explanation,
    };
  });

  const score = Math.round((correctCount / questions.length) * 100);
  const passed = score >= passingScore;

  return {
    score,
    correctCount,
    totalCount: questions.length,
    passed,
    questionFeedback,
  };
}

/**
 * Picks a deterministic default next recommended concept for a learner in a course
 * (lowest order_index active concept that is currently unlocked and not yet mastered).
 */
export function getNextRecommendedConceptForLearner(
  concepts: Concept[],
  edges: PrerequisiteEdge[],
  masteredConceptIds: Set<string>,
): Concept | null {
  const active = [...concepts]
    .filter((c) => c.status === 'active')
    .sort((a, b) => a.order_index - b.order_index || a.title.localeCompare(b.title));

  const states = computeConceptStates(active, edges, masteredConceptIds);
  for (const c of active) {
    const st = states.get(c.id);
    if (st?.lockState === 'unlocked') {
      return c;
    }
  }
  return null;
}
