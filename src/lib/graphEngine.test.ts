import { describe, expect, it } from 'vitest';
import {
  computeConceptStates,
  detectCycleOnAddEdge,
  evaluateQuizSubmission,
  generatePersonalizedLearningPath,
  getMissingPrerequisites,
  getNextRecommendedConceptForLearner,
  validateGraphAcyclic,
} from './graphEngine.ts';
import type { Concept, PrerequisiteEdge } from '../types/learnpath.ts';

function makeConcept(id: string, title: string, orderIndex: number, estimatedMinutes = 25): Concept {
  return {
    id,
    course_id: 'course-1',
    title,
    description: `${title} description`,
    learning_objectives: [`Understand ${title}`],
    difficulty: 'beginner',
    estimated_minutes: estimatedMinutes,
    passing_score: 75,
    order_index: orderIndex,
    pos_x: 0,
    pos_y: 0,
    status: 'active',
    split_from_concept_id: null,
    split_into_concept_ids: [],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function makeEdge(prereqId: string, depId: string): PrerequisiteEdge {
  return {
    id: `${prereqId}->${depId}`,
    course_id: 'course-1',
    prerequisite_concept_id: prereqId,
    dependent_concept_id: depId,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('DAG Cycle Detection & Graph Validation', () => {
  const concepts = [
    makeConcept('intro', 'Python Basics', 1),
    makeConcept('vars', 'Variables', 2),
    makeConcept('loops', 'Loops', 3),
    makeConcept('funcs', 'Functions', 4),
  ];

  const edges = [
    makeEdge('intro', 'loops'),
    makeEdge('loops', 'funcs'),
  ];

  it('allows valid acyclic prerequisite edges', () => {
    const res = detectCycleOnAddEdge(concepts, edges, 'vars', 'funcs');
    expect(res.hasCycle).toBe(false);
    expect(res.explanation).toBeNull();
  });

  it('rejects direct self-loops', () => {
    const res = detectCycleOnAddEdge(concepts, edges, 'loops', 'loops');
    expect(res.hasCycle).toBe(true);
    expect(res.explanation).toContain('Loops');
    expect(res.cyclePathIds).toEqual(['loops', 'loops']);
  });

  it('rejects transitive cycle and formats exact learning cycle path', () => {
    // Existing: Python Basics -> Loops -> Functions. Trying to add Functions -> Python Basics.
    const res = detectCycleOnAddEdge(concepts, edges, 'funcs', 'intro');
    expect(res.hasCycle).toBe(true);
    expect(res.cyclePathIds).toEqual(['funcs', 'intro', 'loops', 'funcs']);
    expect(res.explanation).toBe(
      'Cannot add this prerequisite because it creates a learning cycle: Functions → Python Basics → Loops → Functions.',
    );
  });

  it('validates entire graph for acyclicity', () => {
    expect(validateGraphAcyclic(concepts, edges).valid).toBe(true);
    const cyclicEdges = [...edges, makeEdge('funcs', 'intro')];
    const invalid = validateGraphAcyclic(concepts, cyclicEdges);
    expect(invalid.valid).toBe(false);
    expect(invalid.explanation).toContain('learning cycle');
  });
});

describe('Mastery-Based Unlocking & Missing Prerequisites', () => {
  const concepts = [
    makeConcept('vars', 'Variables', 1),
    makeConcept('loops', 'Loops', 2),
    makeConcept('funcs', 'Functions', 3),
  ];

  const edges = [
    makeEdge('vars', 'funcs'),
    makeEdge('loops', 'funcs'),
  ];

  it('explains exactly which prerequisite is missing when partially mastered', () => {
    const mastered = new Set<string>(['vars']);
    const missing = getMissingPrerequisites('funcs', concepts, edges, mastered);
    expect(missing).toEqual([{ id: 'loops', title: 'Loops' }]);

    const states = computeConceptStates(concepts, edges, mastered);
    expect(states.get('vars')?.lockState).toBe('mastered');
    expect(states.get('loops')?.lockState).toBe('unlocked');
    expect(states.get('funcs')?.lockState).toBe('locked');
    expect(states.get('funcs')?.lockReason).toBe(
      'Locked: Complete and pass the Loops quiz first.',
    );
  });

  it('unlocks dependent concept once all prerequisites are mastered', () => {
    const mastered = new Set<string>(['vars', 'loops']);
    const states = computeConceptStates(concepts, edges, mastered);
    expect(states.get('funcs')?.lockState).toBe('unlocked');
    expect(states.get('funcs')?.lockReason).toBeNull();
  });
});

describe('Personalized Learning Path Generator', () => {
  const concepts = [
    makeConcept('intro', 'Introduction to Python', 1, 20),
    makeConcept('vars', 'Variables and Data Types', 2, 30),
    makeConcept('cond', 'Conditional Statements', 3, 25),
    makeConcept('loops', 'Loops', 4, 35),
    makeConcept('funcs', 'Functions', 5, 40),
    makeConcept('oop', 'Object-Oriented Programming', 6, 50),
  ];

  const edges = [
    makeEdge('intro', 'vars'),
    makeEdge('vars', 'cond'),
    makeEdge('cond', 'loops'),
    makeEdge('vars', 'funcs'),
    makeEdge('loops', 'funcs'),
    makeEdge('funcs', 'oop'),
  ];

  it('excludes already mastered concepts and orders remaining steps topologically', () => {
    const mastered = new Set<string>(['intro', 'vars']);
    const lessonDurations = new Map<string, number>([
      ['cond', 20],
      ['loops', 30],
      ['funcs', 45],
    ]);

    const path = generatePersonalizedLearningPath(
      'course-1',
      'funcs',
      concepts,
      edges,
      mastered,
      lessonDurations,
    );

    expect(path.completed_prerequisites.map((s) => s.concept_id)).toEqual(['intro', 'vars']);
    expect(path.ordered_remaining_steps.map((s) => s.concept_id)).toEqual([
      'cond',
      'loops',
      'funcs',
    ]);
    expect(path.next_recommended_concept?.concept_id).toBe('cond');
    expect(path.estimated_remaining_minutes).toBe(95);
    expect(path.completion_percentage).toBe(40);
  });

  it('updates automatically when curriculum splits a concept into two smaller concepts', () => {
    // Suppose Loops is split into 'loops-for' and 'loops-while' (with loops-for -> loops-while -> funcs)
    const splitConcepts = [
      ...concepts.map((c) => (c.id === 'loops' ? { ...c, status: 'split' as const } : c)),
      makeConcept('loops-for', 'For Loops', 4, 18),
      makeConcept('loops-while', 'While Loops', 5, 18),
    ];

    const updatedEdges = [
      makeEdge('intro', 'vars'),
      makeEdge('vars', 'cond'),
      makeEdge('cond', 'loops-for'),
      makeEdge('loops-for', 'loops-while'),
      makeEdge('vars', 'funcs'),
      makeEdge('loops-while', 'funcs'),
    ];

    const mastered = new Set<string>(['intro', 'vars', 'cond', 'loops']);
    const path = generatePersonalizedLearningPath(
      'course-1',
      'funcs',
      splitConcepts,
      updatedEdges,
      mastered,
      new Map(),
    );

    // Mastered 'loops' does NOT silently grant mastery to 'loops-for' or 'loops-while'
    expect(path.ordered_remaining_steps.map((s) => s.concept_id)).toEqual([
      'loops-for',
      'loops-while',
      'funcs',
    ]);
    expect(path.next_recommended_concept?.concept_id).toBe('loops-for');

    const nextGlobal = getNextRecommendedConceptForLearner(splitConcepts, updatedEdges, mastered);
    expect(nextGlobal?.id).toBe('loops-for');
  });
});

describe('Quiz Evaluation & Mastery Threshold', () => {
  const questions = [
    { id: 'q1', question_text: 'Q1', correct_option: 'A' as const, explanation: 'E1' },
    { id: 'q2', question_text: 'Q2', correct_option: 'B' as const, explanation: 'E2' },
    { id: 'q3', question_text: 'Q3', correct_option: 'C' as const, explanation: 'E3' },
    { id: 'q4', question_text: 'Q4', correct_option: 'D' as const, explanation: 'E4' },
  ];

  it('passes when score meets or exceeds threshold', () => {
    const res = evaluateQuizSubmission(
      questions,
      { q1: 'A', q2: 'B', q3: 'C', q4: 'A' },
      75,
    );
    expect(res.score).toBe(75);
    expect(res.correctCount).toBe(3);
    expect(res.passed).toBe(true);
  });

  it('fails when score is below threshold', () => {
    const res = evaluateQuizSubmission(
      questions,
      { q1: 'A', q2: 'B', q3: 'A', q4: 'A' },
      75,
    );
    expect(res.score).toBe(50);
    expect(res.passed).toBe(false);
  });
});
