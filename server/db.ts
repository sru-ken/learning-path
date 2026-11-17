import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'learnpath.db');

export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

export function initializeSchema(): void {
  db.exec(`
    -- 1. Profiles
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('instructor', 'learner')) DEFAULT 'learner',
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Password reset tokens for forgot-password flow
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. Courses
    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      instructor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
      thumbnail_url TEXT,
      estimated_duration_minutes INTEGER NOT NULL DEFAULT 60,
      default_passing_score INTEGER NOT NULL DEFAULT 75 CHECK (default_passing_score BETWEEN 1 AND 100),
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
      current_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 3. Course Enrollments
    CREATE TABLE IF NOT EXISTS course_enrollments (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      learner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_active_concept_id TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (course_id, learner_id)
    );

    -- 4. Concepts
    CREATE TABLE IF NOT EXISTS concepts (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      learning_objectives_json TEXT NOT NULL DEFAULT '[]',
      difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
      estimated_minutes INTEGER NOT NULL DEFAULT 20,
      passing_score INTEGER NOT NULL DEFAULT 75 CHECK (passing_score BETWEEN 1 AND 100),
      order_index INTEGER NOT NULL DEFAULT 1,
      pos_x REAL NOT NULL DEFAULT 0,
      pos_y REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('active', 'split', 'retired')) DEFAULT 'active',
      split_from_concept_id TEXT REFERENCES concepts(id) ON DELETE SET NULL,
      split_into_concept_ids_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 5. Lessons
    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      video_url TEXT,
      duration_minutes INTEGER NOT NULL DEFAULT 10,
      order_index INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. Prerequisites (Directed Acyclic Graph edges)
    CREATE TABLE IF NOT EXISTS prerequisites (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      prerequisite_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      dependent_concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (prerequisite_concept_id, dependent_concept_id),
      CHECK (prerequisite_concept_id <> dependent_concept_id)
    );

    -- 7. Quizzes
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL UNIQUE REFERENCES concepts(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      passing_score INTEGER NOT NULL DEFAULT 75 CHECK (passing_score BETWEEN 1 AND 100),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. Quiz Questions
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
      question_text TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL CHECK (correct_option IN ('A', 'B', 'C', 'D')),
      explanation TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 1
    );

    -- 9. Quiz Attempts (immutable historical log)
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id TEXT PRIMARY KEY,
      quiz_id TEXT NOT NULL REFERENCES quizzes(id) ON DELETE RESTRICT,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      learner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      answers_json TEXT NOT NULL,
      score INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
      attempted_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. Lesson Progress
    CREATE TABLE IF NOT EXISTS lesson_progress (
      id TEXT PRIMARY KEY,
      lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      learner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      completed INTEGER NOT NULL DEFAULT 1 CHECK (completed IN (0, 1)),
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (lesson_id, learner_id)
    );

    -- 11. Concept Mastery
    CREATE TABLE IF NOT EXISTS concept_mastery (
      id TEXT PRIMARY KEY,
      concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE RESTRICT,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      learner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      mastered INTEGER NOT NULL DEFAULT 0 CHECK (mastered IN (0, 1)),
      best_score INTEGER NOT NULL DEFAULT 0,
      mastered_at TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (concept_id, learner_id)
    );

    -- 12. Curriculum Versions
    CREATE TABLE IF NOT EXISTS curriculum_versions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      summary TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 13. Curriculum Change Logs
    CREATE TABLE IF NOT EXISTS curriculum_change_logs (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      version_id TEXT NOT NULL REFERENCES curriculum_versions(id) ON DELETE CASCADE,
      change_type TEXT NOT NULL,
      description TEXT NOT NULL,
      affected_concept_ids_json TEXT NOT NULL DEFAULT '[]',
      affected_learner_count INTEGER NOT NULL DEFAULT 0,
      previous_structure_json TEXT NOT NULL DEFAULT '{}',
      new_structure_json TEXT NOT NULL DEFAULT '{}',
      changed_by TEXT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 14. Learner Notifications
    CREATE TABLE IF NOT EXISTS learner_notifications (
      id TEXT PRIMARY KEY,
      learner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      change_log_id TEXT REFERENCES curriculum_change_logs(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      change_summary_json TEXT NOT NULL DEFAULT '{}',
      next_topic_changed INTEGER NOT NULL DEFAULT 0 CHECK (next_topic_changed IN (0, 1)),
      previous_next_concept_id TEXT,
      new_next_concept_id TEXT,
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_concepts_course ON concepts(course_id);
    CREATE INDEX IF NOT EXISTS idx_prerequisites_course ON prerequisites(course_id);
    CREATE INDEX IF NOT EXISTS idx_quiz_attempts_learner_concept ON quiz_attempts(learner_id, concept_id);
    CREATE INDEX IF NOT EXISTS idx_concept_mastery_learner_course ON concept_mastery(learner_id, course_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_learner_unread ON learner_notifications(learner_id, is_read);
  `);
}

export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE;');
  try {
    const result = fn();
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}
