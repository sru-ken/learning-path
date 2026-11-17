import crypto from 'node:crypto';
import { db, nowIso, withTransaction } from './db.ts';
import {
  computeConceptStates,
  detectCycleOnAddEdge,
  generatePersonalizedLearningPath,
  getNextRecommendedConceptForLearner,
  validateGraphAcyclic,
} from '../src/lib/graphEngine.ts';
import type {
  Concept,
  ConceptWithProgress,
  CourseDetailResponse,
  CourseStatus,
  CourseSummary,
  CurriculumChangeLog,
  CurriculumVersion,
  DifficultyLevel,
  InstructorCourseAnalytics,
  LearnerNotification,
  Lesson,
  PersonalizedLearningPath,
  PrerequisiteEdge,
  Profile,
  QuizAttempt,
  QuizOptionKey,
  QuizQuestion,
} from '../src/types/learnpath.ts';

function parseJsonArray<T>(raw: unknown): T[] {
  if (typeof raw !== 'string' || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObj(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function loadCourseConcepts(courseId: string): Concept[] {
  const rows = db
    .prepare(
      `SELECT id, course_id, title, description, learning_objectives_json, difficulty,
              estimated_minutes, passing_score, order_index, pos_x, pos_y, status,
              split_from_concept_id, split_into_concept_ids_json, created_at, updated_at
       FROM concepts
       WHERE course_id = ?
       ORDER BY order_index ASC, created_at ASC`,
    )
    .all(courseId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    course_id: String(r.course_id),
    title: String(r.title),
    description: String(r.description),
    learning_objectives: parseJsonArray<string>(r.learning_objectives_json),
    difficulty: r.difficulty as DifficultyLevel,
    estimated_minutes: Number(r.estimated_minutes),
    passing_score: Number(r.passing_score),
    order_index: Number(r.order_index),
    pos_x: Number(r.pos_x),
    pos_y: Number(r.pos_y),
    status: r.status as Concept['status'],
    split_from_concept_id: r.split_from_concept_id ? String(r.split_from_concept_id) : null,
    split_into_concept_ids: parseJsonArray<string>(r.split_into_concept_ids_json),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }));
}

export function loadCoursePrerequisites(courseId: string): PrerequisiteEdge[] {
  const rows = db
    .prepare(
      `SELECT id, course_id, prerequisite_concept_id, dependent_concept_id, created_at
       FROM prerequisites
       WHERE course_id = ?
       ORDER BY created_at ASC`,
    )
    .all(courseId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    course_id: String(r.course_id),
    prerequisite_concept_id: String(r.prerequisite_concept_id),
    dependent_concept_id: String(r.dependent_concept_id),
    created_at: String(r.created_at),
  }));
}

export function getMasteredConceptIds(courseId: string, learnerId: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT concept_id FROM concept_mastery
       WHERE course_id = ? AND learner_id = ? AND mastered = 1`,
    )
    .all(courseId, learnerId) as Array<{ concept_id: string }>;

  return new Set(rows.map((r) => r.concept_id));
}

export function getCourseSummariesForUser(user: Profile): CourseSummary[] {
  const query =
    user.role === 'instructor'
      ? `SELECT c.*, p.full_name AS instructor_name
         FROM courses c
         JOIN profiles p ON p.id = c.instructor_id
         ORDER BY c.updated_at DESC`
      : `SELECT c.*, p.full_name AS instructor_name
         FROM courses c
         JOIN profiles p ON p.id = c.instructor_id
         WHERE c.status = 'published'
            OR EXISTS (
              SELECT 1 FROM course_enrollments e
              WHERE e.course_id = c.id AND e.learner_id = ?
            )
         ORDER BY c.updated_at DESC`;

  const rows = (
    user.role === 'instructor' ? db.prepare(query).all() : db.prepare(query).all(user.id)
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const courseId = String(row.id);
    const activeCountRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM concepts WHERE course_id = ? AND status = 'active'`)
      .get(courseId) as { cnt: number };
    const enrolledCountRow = db
      .prepare(`SELECT COUNT(*) AS cnt FROM course_enrollments WHERE course_id = ?`)
      .get(courseId) as { cnt: number };

    const activeCount = Number(activeCountRow.cnt);
    const enrolledCount = Number(enrolledCountRow.cnt);

    let isEnrolled = false;
    let completionPercentage = 0;
    let masteredCount = 0;
    let lastActiveConceptId: string | null = null;

    if (user.role === 'learner') {
      const enrollment = db
        .prepare(
          `SELECT id, last_active_concept_id FROM course_enrollments
           WHERE course_id = ? AND learner_id = ?`,
        )
        .get(courseId, user.id) as { id: string; last_active_concept_id: string | null } | undefined;

      if (enrollment) {
        isEnrolled = true;
        lastActiveConceptId = enrollment.last_active_concept_id;
        const masteredRow = db
          .prepare(
            `SELECT COUNT(*) AS cnt
             FROM concept_mastery cm
             JOIN concepts con ON con.id = cm.concept_id
             WHERE cm.course_id = ? AND cm.learner_id = ? AND cm.mastered = 1 AND con.status = 'active'`,
          )
          .get(courseId, user.id) as { cnt: number };
        masteredCount = Number(masteredRow.cnt);
        completionPercentage =
          activeCount === 0 ? 0 : Math.round((masteredCount / activeCount) * 100);
      }
    }

    return {
      id: courseId,
      instructor_id: String(row.instructor_id),
      instructor_name: String(row.instructor_name),
      title: String(row.title),
      description: String(row.description),
      category: String(row.category),
      difficulty: row.difficulty as DifficultyLevel,
      thumbnail_url: row.thumbnail_url ? String(row.thumbnail_url) : null,
      estimated_duration_minutes: Number(row.estimated_duration_minutes),
      default_passing_score: Number(row.default_passing_score),
      status: row.status as CourseStatus,
      current_version: Number(row.current_version),
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      concept_count: activeCount,
      enrolled_count: enrolledCount,
      is_enrolled: isEnrolled,
      completion_percentage: completionPercentage,
      mastered_count: masteredCount,
      last_active_concept_id: lastActiveConceptId,
    };
  });
}

export function getCourseDetailForUser(
  courseId: string,
  user: Profile,
): CourseDetailResponse | null {
  const courseRow = db
    .prepare(
      `SELECT c.*, p.full_name AS instructor_name
       FROM courses c
       JOIN profiles p ON p.id = c.instructor_id
       WHERE c.id = ?`,
    )
    .get(courseId) as Record<string, unknown> | undefined;

  if (!courseRow) return null;

  const enrollmentRow = db
    .prepare(
      `SELECT id, enrolled_at, last_active_concept_id
       FROM course_enrollments
       WHERE course_id = ? AND learner_id = ?`,
    )
    .get(courseId, user.id) as
    | { id: string; enrolled_at: string; last_active_concept_id: string | null }
    | undefined;

  if (user.role === 'learner' && courseRow.status !== 'published' && !enrollmentRow) {
    return null;
  }

  const concepts = loadCourseConcepts(courseId);
  const prerequisites = loadCoursePrerequisites(courseId);
  const masteredSet = getMasteredConceptIds(courseId, user.id);
  const states = computeConceptStates(concepts, prerequisites, masteredSet);

  const includeAnswers = user.role === 'instructor';

  const conceptsWithProgress: ConceptWithProgress[] = concepts.map((concept) => {
    const lessonRows = db
      .prepare(
        `SELECT l.*,
                COALESCE(lp.completed, 0) AS completed,
                lp.completed_at AS completed_at
         FROM lessons l
         LEFT JOIN lesson_progress lp
           ON lp.lesson_id = l.id AND lp.learner_id = ?
         WHERE l.concept_id = ?
         ORDER BY l.order_index ASC, l.created_at ASC`,
      )
      .all(user.id, concept.id) as Array<Record<string, unknown>>;

    const lessons: Lesson[] = lessonRows.map((l) => ({
      id: String(l.id),
      concept_id: String(l.concept_id),
      title: String(l.title),
      content: String(l.content),
      video_url: l.video_url ? String(l.video_url) : null,
      duration_minutes: Number(l.duration_minutes),
      order_index: Number(l.order_index),
      created_at: String(l.created_at),
      updated_at: String(l.updated_at),
      completed: Number(l.completed) === 1,
      completed_at: l.completed_at ? String(l.completed_at) : null,
    }));

    const quizRow = db
      .prepare(`SELECT id, concept_id, title, passing_score FROM quizzes WHERE concept_id = ?`)
      .get(concept.id) as
      | { id: string; concept_id: string; title: string; passing_score: number }
      | undefined;

    let quiz: ConceptWithProgress['quiz'] = null;
    if (quizRow) {
      const qRows = db
        .prepare(
          `SELECT id, quiz_id, question_text, option_a, option_b, option_c, option_d,
                  correct_option, explanation, order_index
           FROM quiz_questions
           WHERE quiz_id = ?
           ORDER BY order_index ASC`,
        )
        .all(quizRow.id) as Array<Record<string, unknown>>;

      const questions: QuizQuestion[] = qRows.map((q) => ({
        id: String(q.id),
        quiz_id: String(q.quiz_id),
        question_text: String(q.question_text),
        option_a: String(q.option_a),
        option_b: String(q.option_b),
        option_c: String(q.option_c),
        option_d: String(q.option_d),
        ...(includeAnswers
          ? {
              correct_option: q.correct_option as QuizOptionKey,
              explanation: String(q.explanation ?? ''),
            }
          : {}),
        order_index: Number(q.order_index),
      }));

      quiz = {
        id: quizRow.id,
        concept_id: quizRow.concept_id,
        title: quizRow.title,
        passing_score: Number(quizRow.passing_score),
        questions,
      };
    }

    const masteryRow = db
      .prepare(
        `SELECT mastered, best_score, mastered_at
         FROM concept_mastery
         WHERE concept_id = ? AND learner_id = ?`,
      )
      .get(concept.id, user.id) as
      | { mastered: number; best_score: number; mastered_at: string | null }
      | undefined;

    const attemptRows = db
      .prepare(
        `SELECT * FROM quiz_attempts
         WHERE concept_id = ? AND learner_id = ?
         ORDER BY attempted_at DESC`,
      )
      .all(concept.id, user.id) as Array<Record<string, unknown>>;

    const attempts: QuizAttempt[] = attemptRows.map((a) => ({
      id: String(a.id),
      quiz_id: String(a.quiz_id),
      concept_id: String(a.concept_id),
      concept_title: concept.title,
      course_id: String(a.course_id),
      learner_id: String(a.learner_id),
      answers: parseJsonObj(a.answers_json) as Record<string, QuizOptionKey>,
      score: Number(a.score),
      correct_count: Number(a.correct_count),
      total_count: Number(a.total_count),
      passed: Number(a.passed) === 1,
      attempted_at: String(a.attempted_at),
    }));

    const st = states.get(concept.id)!;
    const completedLessons = lessons.filter((l) => l.completed).length;

    return {
      ...concept,
      lessons,
      quiz,
      lock_state: st.lockState,
      mastered: masteryRow ? masteryRow.mastered === 1 : false,
      best_score: masteryRow ? Number(masteryRow.best_score) : null,
      mastered_at: masteryRow?.mastered_at ?? null,
      missing_prerequisites: st.missingPrerequisites,
      lock_reason: st.lockReason,
      attempts,
      completed_lessons_count: completedLessons,
      total_lessons_count: lessons.length,
    };
  });

  const activeConcepts = concepts.filter((c) => c.status === 'active');
  const masteredActiveCount = activeConcepts.filter((c) => masteredSet.has(c.id)).length;
  const enrolledCountRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM course_enrollments WHERE course_id = ?`)
    .get(courseId) as { cnt: number };

  const versionRows = db
    .prepare(
      `SELECT v.*, p.full_name AS created_by_name
       FROM curriculum_versions v
       JOIN profiles p ON p.id = v.created_by
       WHERE v.course_id = ?
       ORDER BY v.version_number DESC`,
    )
    .all(courseId) as Array<Record<string, unknown>>;

  const versions: CurriculumVersion[] = versionRows.map((v) => ({
    id: String(v.id),
    course_id: String(v.course_id),
    version_number: Number(v.version_number),
    summary: String(v.summary),
    snapshot: parseJsonObj(v.snapshot_json) as CurriculumVersion['snapshot'],
    created_by: String(v.created_by),
    created_by_name: String(v.created_by_name),
    created_at: String(v.created_at),
  }));

  const logRows = db
    .prepare(
      `SELECT l.*, p.full_name AS changed_by_name, v.version_number
       FROM curriculum_change_logs l
       JOIN profiles p ON p.id = l.changed_by
       JOIN curriculum_versions v ON v.id = l.version_id
       WHERE l.course_id = ?
       ORDER BY l.created_at DESC`,
    )
    .all(courseId) as Array<Record<string, unknown>>;

  const titleLookup = new Map(concepts.map((c) => [c.id, c.title]));
  const changeLogs: CurriculumChangeLog[] = logRows.map((l) => {
    const affectedIds = parseJsonArray<string>(l.affected_concept_ids_json);
    return {
      id: String(l.id),
      course_id: String(l.course_id),
      version_id: String(l.version_id),
      version_number: Number(l.version_number),
      change_type: l.change_type as CurriculumChangeLog['change_type'],
      description: String(l.description),
      affected_concept_ids: affectedIds,
      affected_concept_titles: affectedIds.map((id) => titleLookup.get(id) ?? id),
      affected_learner_count: Number(l.affected_learner_count),
      previous_structure: parseJsonObj(l.previous_structure_json),
      new_structure: parseJsonObj(l.new_structure_json),
      changed_by: String(l.changed_by),
      changed_by_name: String(l.changed_by_name),
      created_at: String(l.created_at),
    };
  });

  const courseSummary: CourseSummary = {
    id: String(courseRow.id),
    instructor_id: String(courseRow.instructor_id),
    instructor_name: String(courseRow.instructor_name),
    title: String(courseRow.title),
    description: String(courseRow.description),
    category: String(courseRow.category),
    difficulty: courseRow.difficulty as DifficultyLevel,
    thumbnail_url: courseRow.thumbnail_url ? String(courseRow.thumbnail_url) : null,
    estimated_duration_minutes: Number(courseRow.estimated_duration_minutes),
    default_passing_score: Number(courseRow.default_passing_score),
    status: courseRow.status as CourseStatus,
    current_version: Number(courseRow.current_version),
    created_at: String(courseRow.created_at),
    updated_at: String(courseRow.updated_at),
    concept_count: activeConcepts.length,
    enrolled_count: Number(enrolledCountRow.cnt),
    is_enrolled: Boolean(enrollmentRow),
    mastered_count: masteredActiveCount,
    completion_percentage:
      activeConcepts.length === 0
        ? 0
        : Math.round((masteredActiveCount / activeConcepts.length) * 100),
    last_active_concept_id: enrollmentRow?.last_active_concept_id ?? null,
  };

  return {
    course: courseSummary,
    concepts: conceptsWithProgress,
    prerequisites,
    enrollment: enrollmentRow ?? null,
    versions,
    change_logs: changeLogs,
  };
}

export function buildLearningPathForLearner(
  courseId: string,
  learnerId: string,
  targetConceptId: string,
): PersonalizedLearningPath {
  const concepts = loadCourseConcepts(courseId);
  const edges = loadCoursePrerequisites(courseId);
  const masteredIds = getMasteredConceptIds(courseId, learnerId);

  const durationRows = db
    .prepare(
      `SELECT l.concept_id, SUM(l.duration_minutes) AS total_mins
       FROM lessons l
       JOIN concepts c ON c.id = l.concept_id
       WHERE c.course_id = ?
       GROUP BY l.concept_id`,
    )
    .all(courseId) as Array<{ concept_id: string; total_mins: number }>;

  const lessonDurationMap = new Map<string, number>();
  for (const row of durationRows) {
    lessonDurationMap.set(row.concept_id, Number(row.total_mins));
  }

  return generatePersonalizedLearningPath(
    courseId,
    targetConceptId,
    concepts,
    edges,
    masteredIds,
    lessonDurationMap,
  );
}

export function snapshotCourseStructure(courseId: string): {
  concepts: Array<{ id: string; title: string; status: Concept['status']; order_index: number }>;
  prerequisites: Array<{ prerequisite_concept_id: string; dependent_concept_id: string }>;
} {
  const concepts = loadCourseConcepts(courseId).map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    order_index: c.order_index,
  }));
  const prerequisites = loadCoursePrerequisites(courseId).map((e) => ({
    prerequisite_concept_id: e.prerequisite_concept_id,
    dependent_concept_id: e.dependent_concept_id,
  }));
  return { concepts, prerequisites };
}

interface CurriculumChangeMeta {
  courseId: string;
  instructorId: string;
  changeType: CurriculumChangeLog['change_type'];
  description: string;
  affectedConceptIds: string[];
  previousSnapshot: ReturnType<typeof snapshotCourseStructure>;
  previousConcepts: Concept[];
  previousEdges: PrerequisiteEdge[];
  changeSummary: LearnerNotification['change_summary'];
  notificationTitle: string;
  notificationMessage: string;
}

/**
 * Must be called inside a database transaction AFTER structural changes have been applied.
 * Captures the new snapshot, bumps course version, inserts version + change log,
 * recalculates every enrolled learner's next recommended concept, and generates notifications.
 */
export function recordCurriculumVersionAndNotify(meta: CurriculumChangeMeta): {
  versionNumber: number;
  affectedLearnerCount: number;
} {
  const ts = nowIso();
  const courseRow = db
    .prepare('SELECT id, title, current_version FROM courses WHERE id = ?')
    .get(meta.courseId) as { id: string; title: string; current_version: number } | undefined;

  if (!courseRow) {
    throw new Error('Course not found');
  }

  const nextVersion = Number(courseRow.current_version) + 1;
  db.prepare('UPDATE courses SET current_version = ?, updated_at = ? WHERE id = ?').run(
    nextVersion,
    ts,
    meta.courseId,
  );

  const newSnapshot = snapshotCourseStructure(meta.courseId);
  const newConcepts = loadCourseConcepts(meta.courseId);
  const newEdges = loadCoursePrerequisites(meta.courseId);

  const versionId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO curriculum_versions (id, course_id, version_number, summary, snapshot_json, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    versionId,
    meta.courseId,
    nextVersion,
    meta.description,
    JSON.stringify(newSnapshot),
    meta.instructorId,
    ts,
  );

  const enrolledLearners = db
    .prepare('SELECT learner_id FROM course_enrollments WHERE course_id = ?')
    .all(meta.courseId) as Array<{ learner_id: string }>;

  const changeLogId = crypto.randomUUID();
  db.prepare(
    `INSERT INTO curriculum_change_logs (
       id, course_id, version_id, change_type, description,
       affected_concept_ids_json, affected_learner_count,
       previous_structure_json, new_structure_json, changed_by, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    changeLogId,
    meta.courseId,
    versionId,
    meta.changeType,
    meta.description,
    JSON.stringify(meta.affectedConceptIds),
    enrolledLearners.length,
    JSON.stringify(meta.previousSnapshot),
    JSON.stringify(newSnapshot),
    meta.instructorId,
    ts,
  );

  for (const { learner_id } of enrolledLearners) {
    const masteredIds = getMasteredConceptIds(meta.courseId, learner_id);
    const prevNext = getNextRecommendedConceptForLearner(
      meta.previousConcepts,
      meta.previousEdges,
      masteredIds,
    );
    const currNext = getNextRecommendedConceptForLearner(
      newConcepts,
      newEdges,
      masteredIds,
    );

    const nextChanged = (prevNext?.id ?? null) !== (currNext?.id ?? null);
    const nextHint = nextChanged
      ? currNext
        ? ` Your next recommended concept is now "${currNext.title}"${prevNext ? ` (previously "${prevNext.title}")` : ''}.`
        : ' All active concepts in this course are now mastered.'
      : currNext
        ? ` Your next recommended concept remains "${currNext.title}".`
        : '';

    db.prepare(
      `INSERT INTO learner_notifications (
         id, learner_id, course_id, change_log_id, title, message,
         change_summary_json, next_topic_changed,
         previous_next_concept_id, new_next_concept_id, is_read, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      crypto.randomUUID(),
      learner_id,
      meta.courseId,
      changeLogId,
      meta.notificationTitle,
      `${meta.notificationMessage}${nextHint}`,
      JSON.stringify(meta.changeSummary),
      nextChanged ? 1 : 0,
      prevNext?.id ?? null,
      currNext?.id ?? null,
      ts,
    );
  }

  return {
    versionNumber: nextVersion,
    affectedLearnerCount: enrolledLearners.length,
  };
}

export interface SplitConceptChildInput {
  title: string;
  description: string;
  learning_objectives: string[];
  difficulty: DifficultyLevel;
  estimated_minutes: number;
  passing_score: number;
  lesson_title: string;
  lesson_content: string;
  lesson_video_url?: string;
  questions: Array<{
    question_text: string;
    option_a: string;
    option_b: string;
    option_c: string;
    option_d: string;
    correct_option: QuizOptionKey;
    explanation: string;
  }>;
}

export interface SplitConceptRequest {
  conceptId: string;
  instructorId: string;
  childConcepts: SplitConceptChildInput[];
  chainSequentially: boolean;
  changeDescription?: string;
}

export function splitConceptTransactional(input: SplitConceptRequest): {
  splitConceptIds: string[];
  versionNumber: number;
  affectedLearnerCount: number;
} {
  if (input.childConcepts.length < 2) {
    throw new Error('Splitting a concept requires at least 2 child concepts.');
  }

  return withTransaction(() => {
    const originalRow = db
      .prepare('SELECT * FROM concepts WHERE id = ?')
      .get(input.conceptId) as Record<string, unknown> | undefined;

    if (!originalRow) {
      throw new Error('Concept not found.');
    }
    if (originalRow.status !== 'active') {
      throw new Error('Only active concepts can be split.');
    }

    const courseId = String(originalRow.course_id);
    const originalTitle = String(originalRow.title);
    const baseOrder = Number(originalRow.order_index);
    const baseX = Number(originalRow.pos_x);
    const baseY = Number(originalRow.pos_y);
    const ts = nowIso();

    const prevSnapshot = snapshotCourseStructure(courseId);
    const prevConcepts = loadCourseConcepts(courseId);
    const prevEdges = loadCoursePrerequisites(courseId);

    // Collect incoming prerequisites (P -> original) and outgoing dependents (original -> D)
    const incomingPrereqs = prevEdges.filter((e) => e.dependent_concept_id === input.conceptId);
    const outgoingDeps = prevEdges.filter((e) => e.prerequisite_concept_id === input.conceptId);

    const createdChildIds: string[] = [];
    const createdChildTitles: string[] = [];

    input.childConcepts.forEach((child, idx) => {
      const childId = crypto.randomUUID();
      createdChildIds.push(childId);
      createdChildTitles.push(child.title.trim());

      const offsetY = (idx - (input.childConcepts.length - 1) / 2) * 140;
      const offsetX = input.chainSequentially ? idx * 270 : 0;

      db.prepare(
        `INSERT INTO concepts (
           id, course_id, title, description, learning_objectives_json, difficulty,
           estimated_minutes, passing_score, order_index, pos_x, pos_y, status,
           split_from_concept_id, split_into_concept_ids_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, '[]', ?, ?)`,
      ).run(
        childId,
        courseId,
        child.title.trim(),
        child.description.trim(),
        JSON.stringify(child.learning_objectives ?? []),
        child.difficulty || 'beginner',
        Math.max(5, Number(child.estimated_minutes) || 20),
        Math.min(100, Math.max(1, Number(child.passing_score) || 75)),
        baseOrder + idx,
        baseX + offsetX,
        baseY + offsetY,
        input.conceptId,
        ts,
        ts,
      );

      // Default lesson for child concept
      db.prepare(
        `INSERT INTO lessons (
           id, concept_id, title, content, video_url, duration_minutes, order_index, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        childId,
        child.lesson_title.trim() || `${child.title.trim()} Guide`,
        child.lesson_content.trim() || `Core concepts and worked examples for ${child.title.trim()}.`,
        child.lesson_video_url?.trim() || null,
        Math.max(5, Number(child.estimated_minutes) || 15),
        ts,
        ts,
      );

      // Quiz + questions for child concept (requires fresh mastery!)
      const quizId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO quizzes (id, concept_id, title, passing_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        quizId,
        childId,
        `${child.title.trim()} Mastery Check`,
        Math.min(100, Math.max(1, Number(child.passing_score) || 75)),
        ts,
        ts,
      );

      const questions =
        child.questions && child.questions.length > 0
          ? child.questions
          : [
              {
                question_text: `Which statement best describes the primary goal of ${child.title.trim()}?`,
                option_a: `Mastering ${child.title.trim()} enables structured problem solving in this topic.`,
                option_b: 'It skips foundational syntax rules entirely.',
                option_c: 'It is only used for hardware driver programming.',
                option_d: 'It replaces all conditional logic.',
                correct_option: 'A' as QuizOptionKey,
                explanation: `${child.title.trim()} builds structured mastery for downstream concepts.`,
              },
            ];

      questions.forEach((q, qIdx) => {
        db.prepare(
          `INSERT INTO quiz_questions (
             id, quiz_id, question_text, option_a, option_b, option_c, option_d,
             correct_option, explanation, order_index
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          crypto.randomUUID(),
          quizId,
          q.question_text,
          q.option_a,
          q.option_b,
          q.option_c,
          q.option_d,
          q.correct_option,
          q.explanation ?? '',
          qIdx + 1,
        );
      });
    });

    // Mark original concept as 'split' (NEVER delete historical quiz_attempts, lesson_progress, or concept_mastery!)
    db.prepare(
      `UPDATE concepts
       SET status = 'split', split_into_concept_ids_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(createdChildIds), ts, input.conceptId);

    // Remove prerequisite edges pointing to or from the retired split concept
    db.prepare(
      `DELETE FROM prerequisites
       WHERE course_id = ? AND (prerequisite_concept_id = ? OR dependent_concept_id = ?)`,
    ).run(courseId, input.conceptId, input.conceptId);

    // Rewire incoming prerequisites -> first child (if sequential) or all children (if parallel)
    const entryChildIds = input.chainSequentially ? [createdChildIds[0]] : createdChildIds;
    for (const inc of incomingPrereqs) {
      for (const targetChildId of entryChildIds) {
        db.prepare(
          `INSERT OR IGNORE INTO prerequisites (id, course_id, prerequisite_concept_id, dependent_concept_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), courseId, inc.prerequisite_concept_id, targetChildId, ts);
      }
    }

    // Internal chain among child concepts if chainSequentially
    if (input.chainSequentially) {
      for (let i = 0; i < createdChildIds.length - 1; i++) {
        db.prepare(
          `INSERT OR IGNORE INTO prerequisites (id, course_id, prerequisite_concept_id, dependent_concept_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), courseId, createdChildIds[i], createdChildIds[i + 1], ts);
      }
    }

    // Rewire outgoing dependents: last child (if sequential) or all children (if parallel) -> original dependents
    const exitChildIds = input.chainSequentially
      ? [createdChildIds[createdChildIds.length - 1]]
      : createdChildIds;
    for (const out of outgoingDeps) {
      for (const srcChildId of exitChildIds) {
        db.prepare(
          `INSERT OR IGNORE INTO prerequisites (id, course_id, prerequisite_concept_id, dependent_concept_id, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(crypto.randomUUID(), courseId, srcChildId, out.dependent_concept_id, ts);
      }
    }

    // Validate the resulting graph is still strictly acyclic
    const allConceptsAfter = loadCourseConcepts(courseId);
    const allEdgesAfter = loadCoursePrerequisites(courseId);
    const dagCheck = validateGraphAcyclic(allConceptsAfter, allEdgesAfter);
    if (!dagCheck.valid) {
      throw new Error(dagCheck.explanation || 'Split operation would introduce a prerequisite cycle.');
    }

    const desc =
      input.changeDescription?.trim() ||
      `Split concept "${originalTitle}" into ${createdChildTitles.join(' and ')} while preserving all historical learner attempts and progress.`;

    const { versionNumber, affectedLearnerCount } = recordCurriculumVersionAndNotify({
      courseId,
      instructorId: input.instructorId,
      changeType: 'concept_split',
      description: desc,
      affectedConceptIds: [input.conceptId, ...createdChildIds],
      previousSnapshot: prevSnapshot,
      previousConcepts: prevConcepts,
      previousEdges: prevEdges,
      changeSummary: {
        split_concepts: [{ original: originalTitle, children: createdChildTitles }],
        added_concepts: createdChildTitles,
      },
      notificationTitle: `Curriculum Updated: "${originalTitle}" Split into Focused Concepts`,
      notificationMessage: `"${originalTitle}" has been split into ${createdChildTitles.join(' and ')}. Your past quiz attempts and lesson completions remain preserved, and the new child concepts require fresh quiz mastery.`,
    });

    return {
      splitConceptIds: createdChildIds,
      versionNumber,
      affectedLearnerCount,
    };
  });
}

export function getInstructorCourseAnalytics(courseId: string): InstructorCourseAnalytics {
  const activeConcepts = loadCourseConcepts(courseId).filter((c) => c.status === 'active');
  const allConcepts = loadCourseConcepts(courseId);

  const enrollments = db
    .prepare(
      `SELECT e.learner_id, e.enrolled_at, e.last_active_concept_id, p.full_name, p.email
       FROM course_enrollments e
       JOIN profiles p ON p.id = e.learner_id
       WHERE e.course_id = ?
       ORDER BY e.enrolled_at DESC`,
    )
    .all(courseId) as Array<{
    learner_id: string;
    enrolled_at: string;
    last_active_concept_id: string | null;
    full_name: string;
    email: string;
  }>;

  const conceptTitleMap = new Map(allConcepts.map((c) => [c.id, c.title]));

  const learnerProgressRows = enrollments.map((en) => {
    const masteredRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM concept_mastery cm
         JOIN concepts c ON c.id = cm.concept_id
         WHERE cm.course_id = ? AND cm.learner_id = ? AND cm.mastered = 1 AND c.status = 'active'`,
      )
      .get(courseId, en.learner_id) as { cnt: number };

    const avgScoreRow = db
      .prepare(
        `SELECT AVG(score) AS avg_score FROM quiz_attempts
         WHERE course_id = ? AND learner_id = ?`,
      )
      .get(courseId, en.learner_id) as { avg_score: number | null };

    const masteredCount = Number(masteredRow.cnt);
    const completionPct =
      activeConcepts.length === 0
        ? 0
        : Math.round((masteredCount / activeConcepts.length) * 100);

    return {
      learner_id: en.learner_id,
      full_name: en.full_name,
      email: en.email,
      enrolled_at: en.enrolled_at,
      mastered_count: masteredCount,
      total_active_concepts: activeConcepts.length,
      completion_percentage: completionPct,
      average_score:
        avgScoreRow.avg_score !== null ? Math.round(Number(avgScoreRow.avg_score)) : null,
      last_active_concept_title: en.last_active_concept_id
        ? (conceptTitleMap.get(en.last_active_concept_id) ?? null)
        : null,
    };
  });

  const attemptsSummary = db
    .prepare(
      `SELECT COUNT(*) AS total, AVG(score) AS avg_score,
              SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed_cnt
       FROM quiz_attempts
       WHERE course_id = ?`,
    )
    .get(courseId) as { total: number; avg_score: number | null; passed_cnt: number | null };

  const conceptStats = allConcepts.map((c) => {
    const masteryRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM concept_mastery
         WHERE concept_id = ? AND mastered = 1`,
      )
      .get(c.id) as { cnt: number };

    const quizRow = db
      .prepare(
        `SELECT COUNT(*) AS cnt, AVG(score) AS avg_score,
                SUM(CASE WHEN passed = 1 THEN 1 ELSE 0 END) AS passed_cnt
         FROM quiz_attempts WHERE concept_id = ?`,
      )
      .get(c.id) as { cnt: number; avg_score: number | null; passed_cnt: number | null };

    const attemptCount = Number(quizRow.cnt);
    const passedCount = Number(quizRow.passed_cnt ?? 0);

    return {
      concept_id: c.id,
      title: c.title,
      status: c.status,
      mastered_learners: Number(masteryRow.cnt),
      attempt_count: attemptCount,
      average_score: quizRow.avg_score !== null ? Math.round(Number(quizRow.avg_score)) : 0,
      pass_rate: attemptCount === 0 ? 0 : Math.round((passedCount / attemptCount) * 100),
    };
  });

  const avgCompletion =
    learnerProgressRows.length === 0
      ? 0
      : Math.round(
          learnerProgressRows.reduce((s, r) => s + r.completion_percentage, 0) /
            learnerProgressRows.length,
        );

  const totalAttempts = Number(attemptsSummary.total);
  const passedTotal = Number(attemptsSummary.passed_cnt ?? 0);

  return {
    course_id: courseId,
    enrolled_learners: enrollments.length,
    average_completion_percentage: avgCompletion,
    average_quiz_score:
      attemptsSummary.avg_score !== null ? Math.round(Number(attemptsSummary.avg_score)) : 0,
    total_quiz_attempts: totalAttempts,
    pass_rate: totalAttempts === 0 ? 0 : Math.round((passedTotal / totalAttempts) * 100),
    concept_stats: conceptStats,
    learner_progress_rows: learnerProgressRows,
  };
}

export function getNotificationsForLearner(learnerId: string): LearnerNotification[] {
  const rows = db
    .prepare(
      `SELECT n.*, c.title AS course_title,
              p_prev.title AS prev_concept_title,
              p_new.title AS new_concept_title
       FROM learner_notifications n
       JOIN courses c ON c.id = n.course_id
       LEFT JOIN concepts p_prev ON p_prev.id = n.previous_next_concept_id
       LEFT JOIN concepts p_new ON p_new.id = n.new_next_concept_id
       WHERE n.learner_id = ?
       ORDER BY n.created_at DESC
       LIMIT 60`,
    )
    .all(learnerId) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: String(r.id),
    learner_id: String(r.learner_id),
    course_id: String(r.course_id),
    course_title: String(r.course_title),
    change_log_id: r.change_log_id ? String(r.change_log_id) : null,
    title: String(r.title),
    message: String(r.message),
    change_summary: parseJsonObj(r.change_summary_json) as LearnerNotification['change_summary'],
    next_topic_changed: Number(r.next_topic_changed) === 1,
    previous_next_concept_id: r.previous_next_concept_id
      ? String(r.previous_next_concept_id)
      : null,
    previous_next_concept_title: r.prev_concept_title ? String(r.prev_concept_title) : null,
    new_next_concept_id: r.new_next_concept_id ? String(r.new_next_concept_id) : null,
    new_next_concept_title: r.new_concept_title ? String(r.new_concept_title) : null,
    is_read: Number(r.is_read) === 1,
    created_at: String(r.created_at),
  }));
}

export function addPrerequisiteEdgeWithValidation(
  courseId: string,
  instructorId: string,
  prerequisiteConceptId: string,
  dependentConceptId: string,
): { edge: PrerequisiteEdge; versionNumber: number; affectedLearnerCount: number } {
  return withTransaction(() => {
    const concepts = loadCourseConcepts(courseId);
    const edges = loadCoursePrerequisites(courseId);

    const prereqExists = concepts.find(
      (c) => c.id === prerequisiteConceptId && c.status === 'active',
    );
    const depExists = concepts.find(
      (c) => c.id === dependentConceptId && c.status === 'active',
    );
    if (!prereqExists || !depExists) {
      throw new Error('Both prerequisite and dependent concepts must be active in this course.');
    }

    const alreadyExists = edges.some(
      (e) =>
        e.prerequisite_concept_id === prerequisiteConceptId &&
        e.dependent_concept_id === dependentConceptId,
    );
    if (alreadyExists) {
      throw new Error(
        `Prerequisite link "${prereqExists.title} → ${depExists.title}" already exists.`,
      );
    }

    const cycleCheck = detectCycleOnAddEdge(
      concepts,
      edges,
      prerequisiteConceptId,
      dependentConceptId,
    );
    if (cycleCheck.hasCycle) {
      const err = new Error(cycleCheck.explanation || 'Learning cycle detected.');
      (err as Error & { code?: string; cyclePath?: string[] }).code = 'CYCLE_DETECTED';
      (err as Error & { code?: string; cyclePath?: string[] }).cyclePath =
        cycleCheck.cyclePathTitles;
      throw err;
    }

    const prevSnapshot = snapshotCourseStructure(courseId);
    const ts = nowIso();
    const edgeId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO prerequisites (id, course_id, prerequisite_concept_id, dependent_concept_id, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(edgeId, courseId, prerequisiteConceptId, dependentConceptId, ts);

    const { versionNumber, affectedLearnerCount } = recordCurriculumVersionAndNotify({
      courseId,
      instructorId,
      changeType: 'prerequisite_added',
      description: `Added prerequisite "${prereqExists.title}" → "${depExists.title}".`,
      affectedConceptIds: [prerequisiteConceptId, dependentConceptId],
      previousSnapshot: prevSnapshot,
      previousConcepts: concepts,
      previousEdges: edges,
      changeSummary: {
        new_prerequisites: [`${prereqExists.title} → ${depExists.title}`],
      },
      notificationTitle: `New Prerequisite Added for "${depExists.title}"`,
      notificationMessage: `"${prereqExists.title}" is now required before unlocking "${depExists.title}".`,
    });

    return {
      edge: {
        id: edgeId,
        course_id: courseId,
        prerequisite_concept_id: prerequisiteConceptId,
        dependent_concept_id: dependentConceptId,
        created_at: ts,
      },
      versionNumber,
      affectedLearnerCount,
    };
  });
}
