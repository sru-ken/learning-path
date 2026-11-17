import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { db, initializeSchema, nowIso, withTransaction } from './server/db.ts';
import { seedDemoDatabase } from './server/seed.ts';
import {
  hashPassword,
  mapProfileRow,
  requireAuth,
  requireInstructor,
  signAuthToken,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth.ts';
import {
  addPrerequisiteEdgeWithValidation,
  buildLearningPathForLearner,
  getCourseDetailForUser,
  getCourseSummariesForUser,
  getInstructorCourseAnalytics,
  getMasteredConceptIds,
  getNotificationsForLearner,
  loadCourseConcepts,
  loadCoursePrerequisites,
  recordCurriculumVersionAndNotify,
  snapshotCourseStructure,
  splitConceptTransactional,
} from './server/curriculumService.ts';
import {
  computeConceptStates,
  evaluateQuizSubmission,
  type QuizQuestionForEval,
} from './src/lib/graphEngine.ts';
import type {
  CourseStatus,
  DifficultyLevel,
  QuizOptionKey,
  UserRole,
} from './src/types/learnpath.ts';

initializeSchema();
seedDemoDatabase();

const app = express();
app.use(express.json({ limit: '2mb' }));

// ---------------------------------------------------------------------------
// 1. AUTHENTICATION ROUTES
// ---------------------------------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, full_name, role } = req.body as {
      email?: string;
      password?: string;
      full_name?: string;
      role?: UserRole;
    };

    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Email, full name, and password are required.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const userRole: UserRole = role === 'instructor' ? 'instructor' : 'learner';

    const existing = db
      .prepare('SELECT id FROM profiles WHERE email = ?')
      .get(cleanEmail) as { id: string } | undefined;

    if (existing) {
      res.status(409).json({ error: 'An account with this email already exists.' });
      return;
    }

    const id = crypto.randomUUID();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO profiles (id, email, password_hash, full_name, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, cleanEmail, hashPassword(password), full_name.trim(), userRole, ts, ts);

    const row = db
      .prepare('SELECT id, email, full_name, role, avatar_url, created_at, updated_at FROM profiles WHERE id = ?')
      .get(id) as Record<string, unknown>;

    const profile = mapProfileRow(row);
    const token = signAuthToken(profile.id, profile.role);
    res.status(201).json({ token, user: profile });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const row = db
      .prepare('SELECT * FROM profiles WHERE email = ?')
      .get(cleanEmail) as Record<string, unknown> | undefined;

    if (!row || !verifyPassword(password, String(row.password_hash))) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const profile = mapProfileRow(row);
    const token = signAuthToken(profile.id, profile.role);
    res.json({ token, user: profile });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ success: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

app.post('/api/auth/forgot-password', (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email) {
      res.status(400).json({ error: 'Please enter your account email.' });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const user = db
      .prepare('SELECT id FROM profiles WHERE email = ?')
      .get(cleanEmail) as { id: string } | undefined;

    if (!user) {
      res.status(404).json({ error: 'No account found with that email address.' });
      return;
    }

    const resetToken = crypto.randomBytes(4).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();
    db.prepare(
      `INSERT INTO password_reset_tokens (id, user_id, token, expires_at, used, created_at)
       VALUES (?, ?, ?, ?, 0, ?)`,
    ).run(crypto.randomUUID(), user.id, resetToken, expiresAt, nowIso());

    res.json({
      message: 'Verification code generated. Enter this reset code to set a new password.',
      reset_code: resetToken,
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to initiate password reset.' });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { email, reset_code, new_password } = req.body as {
      email?: string;
      reset_code?: string;
      new_password?: string;
    };
    if (!email || !reset_code || !new_password) {
      res.status(400).json({ error: 'Email, reset code, and new password are required.' });
      return;
    }
    if (new_password.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters.' });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db
      .prepare('SELECT id FROM profiles WHERE email = ?')
      .get(cleanEmail) as { id: string } | undefined;

    if (!user) {
      res.status(404).json({ error: 'Account not found.' });
      return;
    }

    const tokenRow = db
      .prepare(
        `SELECT id, expires_at, used FROM password_reset_tokens
         WHERE user_id = ? AND token = ?
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(user.id, reset_code.trim().toUpperCase()) as
      | { id: string; expires_at: string; used: number }
      | undefined;

    if (!tokenRow || tokenRow.used === 1 || new Date(tokenRow.expires_at).getTime() < Date.now()) {
      res.status(400).json({ error: 'Invalid or expired reset code.' });
      return;
    }

    withTransaction(() => {
      db.prepare('UPDATE profiles SET password_hash = ?, updated_at = ? WHERE id = ?').run(
        hashPassword(new_password),
        nowIso(),
        user.id,
      );
      db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE id = ?').run(tokenRow.id);
    });

    res.json({ message: 'Password updated successfully. You can now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
});

// ---------------------------------------------------------------------------
// 2. COURSES & CONCEPTS CRUD
// ---------------------------------------------------------------------------

app.get('/api/courses', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const courses = getCourseSummariesForUser(req.user!);
    res.json({ courses });
  } catch (err) {
    console.error('List courses error:', err);
    res.status(500).json({ error: 'Failed to load courses.' });
  }
});

app.post('/api/courses', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const {
      title,
      description,
      category,
      difficulty,
      thumbnail_url,
      estimated_duration_minutes,
      default_passing_score,
      status,
    } = req.body as {
      title?: string;
      description?: string;
      category?: string;
      difficulty?: DifficultyLevel;
      thumbnail_url?: string;
      estimated_duration_minutes?: number;
      default_passing_score?: number;
      status?: CourseStatus;
    };

    if (!title?.trim() || !description?.trim()) {
      res.status(400).json({ error: 'Course title and description are required.' });
      return;
    }

    const courseId = crypto.randomUUID();
    const ts = nowIso();
    const courseStatus: CourseStatus =
      status === 'published' || status === 'archived' ? status : 'draft';

    withTransaction(() => {
      db.prepare(
        `INSERT INTO courses (
           id, instructor_id, title, description, category, difficulty,
           thumbnail_url, estimated_duration_minutes, default_passing_score,
           status, current_version, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        courseId,
        req.user!.id,
        title.trim(),
        description.trim(),
        category?.trim() || 'General',
        difficulty || 'beginner',
        thumbnail_url?.trim() || '/src/assets/images/course_python_programming_1794943596042.jpg',
        Math.max(10, Number(estimated_duration_minutes) || 60),
        Math.min(100, Math.max(1, Number(default_passing_score) || 75)),
        courseStatus,
        ts,
        ts,
      );

      const versionId = crypto.randomUUID();
      const emptySnap = snapshotCourseStructure(courseId);
      db.prepare(
        `INSERT INTO curriculum_versions (id, course_id, version_number, summary, snapshot_json, created_by, created_at)
         VALUES (?, ?, 1, 'Course created.', ?, ?, ?)`,
      ).run(versionId, courseId, JSON.stringify(emptySnap), req.user!.id, ts);
    });

    const detail = getCourseDetailForUser(courseId, req.user!);
    res.status(201).json(detail);
  } catch (err) {
    console.error('Create course error:', err);
    res.status(500).json({ error: 'Failed to create course.' });
  }
});

app.get('/api/courses/:courseId', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const detail = getCourseDetailForUser(req.params.courseId, req.user!);
    if (!detail) {
      res.status(404).json({ error: 'Course not found or not published yet.' });
      return;
    }
    res.json(detail);
  } catch (err) {
    console.error('Get course detail error:', err);
    res.status(500).json({ error: 'Failed to load course details.' });
  }
});

app.put('/api/courses/:courseId', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const {
      title,
      description,
      category,
      difficulty,
      thumbnail_url,
      estimated_duration_minutes,
      default_passing_score,
      status,
    } = req.body as Partial<{
      title: string;
      description: string;
      category: string;
      difficulty: DifficultyLevel;
      thumbnail_url: string;
      estimated_duration_minutes: number;
      default_passing_score: number;
      status: CourseStatus;
    }>;

    const existing = db
      .prepare('SELECT * FROM courses WHERE id = ?')
      .get(courseId) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    db.prepare(
      `UPDATE courses
       SET title = ?, description = ?, category = ?, difficulty = ?,
           thumbnail_url = ?, estimated_duration_minutes = ?, default_passing_score = ?,
           status = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      title?.trim() || String(existing.title),
      description?.trim() || String(existing.description),
      category?.trim() || String(existing.category),
      difficulty || (existing.difficulty as DifficultyLevel),
      thumbnail_url !== undefined
        ? thumbnail_url
        : existing.thumbnail_url
          ? String(existing.thumbnail_url)
          : null,
      estimated_duration_minutes !== undefined
        ? Math.max(5, Number(estimated_duration_minutes))
        : Number(existing.estimated_duration_minutes),
      default_passing_score !== undefined
        ? Math.min(100, Math.max(1, Number(default_passing_score)))
        : Number(existing.default_passing_score),
      status || (existing.status as CourseStatus),
      nowIso(),
      courseId,
    );

    const detail = getCourseDetailForUser(courseId, req.user!);
    res.json(detail);
  } catch (err) {
    console.error('Update course error:', err);
    res.status(500).json({ error: 'Failed to update course.' });
  }
});

app.patch('/api/courses/:courseId/status', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const { status } = req.body as { status?: CourseStatus };
    if (!status || !['draft', 'published', 'archived'].includes(status)) {
      res.status(400).json({ error: 'Invalid course status.' });
      return;
    }
    const existing = db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId);
    if (!existing) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }
    db.prepare('UPDATE courses SET status = ?, updated_at = ? WHERE id = ?').run(
      status,
      nowIso(),
      courseId,
    );
    const detail = getCourseDetailForUser(courseId, req.user!);
    res.json(detail);
  } catch (err) {
    console.error('Update course status error:', err);
    res.status(500).json({ error: 'Failed to update course status.' });
  }
});

app.delete('/api/courses/:courseId', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const enrolled = db
      .prepare('SELECT COUNT(*) AS cnt FROM course_enrollments WHERE course_id = ?')
      .get(courseId) as { cnt: number };

    if (Number(enrolled.cnt) > 0) {
      // Preserve historical learner data by archiving if learners are enrolled
      db.prepare(`UPDATE courses SET status = 'archived', updated_at = ? WHERE id = ?`).run(
        nowIso(),
        courseId,
      );
      res.json({
        archived: true,
        message: 'Course has enrolled learners and was archived to preserve learner history.',
      });
      return;
    }

    db.prepare('DELETE FROM courses WHERE id = ?').run(courseId);
    res.json({ deleted: true });
  } catch (err) {
    console.error('Delete course error:', err);
    res.status(500).json({ error: 'Failed to delete course.' });
  }
});

// ---------------------------------------------------------------------------
// 3. CONCEPTS, LESSONS, QUIZZES, & PREREQUISITE DAG EDITOR
// ---------------------------------------------------------------------------

app.post('/api/courses/:courseId/concepts', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const {
      title,
      description,
      learning_objectives,
      difficulty,
      estimated_minutes,
      passing_score,
      pos_x,
      pos_y,
      lesson_title,
      lesson_content,
      lesson_video_url,
    } = req.body as {
      title?: string;
      description?: string;
      learning_objectives?: string[];
      difficulty?: DifficultyLevel;
      estimated_minutes?: number;
      passing_score?: number;
      pos_x?: number;
      pos_y?: number;
      lesson_title?: string;
      lesson_content?: string;
      lesson_video_url?: string;
    };

    if (!title?.trim()) {
      res.status(400).json({ error: 'Concept title is required.' });
      return;
    }

    const course = db
      .prepare('SELECT id, default_passing_score, status FROM courses WHERE id = ?')
      .get(courseId) as { id: string; default_passing_score: number; status: string } | undefined;

    if (!course) {
      res.status(404).json({ error: 'Course not found.' });
      return;
    }

    const result = withTransaction(() => {
      const prevSnap = snapshotCourseStructure(courseId);
      const prevConcepts = loadCourseConcepts(courseId);
      const prevEdges = loadCoursePrerequisites(courseId);

      const maxOrderRow = db
        .prepare('SELECT COALESCE(MAX(order_index), 0) AS mx FROM concepts WHERE course_id = ?')
        .get(courseId) as { mx: number };

      const conceptId = crypto.randomUUID();
      const ts = nowIso();
      const passing = Math.min(
        100,
        Math.max(1, Number(passing_score) || Number(course.default_passing_score) || 75),
      );
      const orderIdx = Number(maxOrderRow.mx) + 1;
      const defaultX = pos_x ?? 120 + ((orderIdx - 1) % 4) * 280;
      const defaultY = pos_y ?? 100 + Math.floor((orderIdx - 1) / 4) * 180;

      db.prepare(
        `INSERT INTO concepts (
           id, course_id, title, description, learning_objectives_json, difficulty,
           estimated_minutes, passing_score, order_index, pos_x, pos_y, status,
           split_from_concept_id, split_into_concept_ids_json, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, '[]', ?, ?)`,
      ).run(
        conceptId,
        courseId,
        title.trim(),
        description?.trim() || `Core fundamentals for ${title.trim()}.`,
        JSON.stringify(
          learning_objectives && learning_objectives.length > 0
            ? learning_objectives
            : [`Understand and apply ${title.trim()}`],
        ),
        difficulty || 'beginner',
        Math.max(5, Number(estimated_minutes) || 25),
        passing,
        orderIdx,
        defaultX,
        defaultY,
        ts,
        ts,
      );

      db.prepare(
        `INSERT INTO lessons (id, concept_id, title, content, video_url, duration_minutes, order_index, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        conceptId,
        lesson_title?.trim() || `${title.trim()} Overview`,
        lesson_content?.trim() || `Study the core principles and practical examples for ${title.trim()}.`,
        lesson_video_url?.trim() || null,
        Math.max(5, Number(estimated_minutes) || 20),
        ts,
        ts,
      );

      const quizId = crypto.randomUUID();
      db.prepare(
        `INSERT INTO quizzes (id, concept_id, title, passing_score, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(quizId, conceptId, `${title.trim()} Mastery Check`, passing, ts, ts);

      db.prepare(
        `INSERT INTO quiz_questions (id, quiz_id, question_text, option_a, option_b, option_c, option_d, correct_option, explanation, order_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'A', ?, 1)`,
      ).run(
        crypto.randomUUID(),
        quizId,
        `Which statement best reflects mastery of ${title.trim()}?`,
        `Demonstrating accurate practical application of ${title.trim()}.`,
        'Skipping foundational definitions completely.',
        'Memorizing unrelated syntax rules.',
        'Ignoring prerequisite concepts.',
        `Mastery of ${title.trim()} requires understanding and applying its core concepts.`,
      );

      const meta = recordCurriculumVersionAndNotify({
        courseId,
        instructorId: req.user!.id,
        changeType: 'concept_added',
        description: `Added new concept "${title.trim()}".`,
        affectedConceptIds: [conceptId],
        previousSnapshot: prevSnap,
        previousConcepts: prevConcepts,
        previousEdges: prevEdges,
        changeSummary: {
          added_concepts: [title.trim()],
        },
        notificationTitle: `New Concept Added: "${title.trim()}"`,
        notificationMessage: `The instructor added "${title.trim()}" to the curriculum.`,
      });

      return { conceptId, ...meta };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Add concept error:', err);
    res.status(500).json({ error: 'Failed to add concept.' });
  }
});

app.put('/api/concepts/:conceptId', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { conceptId } = req.params;
    const {
      title,
      description,
      learning_objectives,
      difficulty,
      estimated_minutes,
      passing_score,
      order_index,
      pos_x,
      pos_y,
    } = req.body as Partial<{
      title: string;
      description: string;
      learning_objectives: string[];
      difficulty: DifficultyLevel;
      estimated_minutes: number;
      passing_score: number;
      order_index: number;
      pos_x: number;
      pos_y: number;
    }>;

    const existing = db
      .prepare('SELECT * FROM concepts WHERE id = ?')
      .get(conceptId) as Record<string, unknown> | undefined;

    if (!existing) {
      res.status(404).json({ error: 'Concept not found.' });
      return;
    }

    const ts = nowIso();
    const nextPassing =
      passing_score !== undefined
        ? Math.min(100, Math.max(1, Number(passing_score)))
        : Number(existing.passing_score);

    withTransaction(() => {
      db.prepare(
        `UPDATE concepts
         SET title = ?, description = ?, learning_objectives_json = ?, difficulty = ?,
             estimated_minutes = ?, passing_score = ?, order_index = ?,
             pos_x = ?, pos_y = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        title?.trim() || String(existing.title),
        description?.trim() || String(existing.description),
        learning_objectives !== undefined
          ? JSON.stringify(learning_objectives)
          : String(existing.learning_objectives_json),
        difficulty || (existing.difficulty as DifficultyLevel),
        estimated_minutes !== undefined
          ? Math.max(5, Number(estimated_minutes))
          : Number(existing.estimated_minutes),
        nextPassing,
        order_index !== undefined ? Number(order_index) : Number(existing.order_index),
        pos_x !== undefined ? Number(pos_x) : Number(existing.pos_x),
        pos_y !== undefined ? Number(pos_y) : Number(existing.pos_y),
        ts,
        conceptId,
      );

      db.prepare('UPDATE quizzes SET passing_score = ?, updated_at = ? WHERE concept_id = ?').run(
        nextPassing,
        ts,
        conceptId,
      );
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update concept error:', err);
    res.status(500).json({ error: 'Failed to update concept.' });
  }
});

app.post('/api/courses/:courseId/positions', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const { positions } = req.body as {
      positions?: Array<{ id: string; pos_x: number; pos_y: number }>;
    };
    if (!Array.isArray(positions)) {
      res.status(400).json({ error: 'Positions array is required.' });
      return;
    }

    withTransaction(() => {
      const stmt = db.prepare(
        'UPDATE concepts SET pos_x = ?, pos_y = ?, updated_at = ? WHERE id = ? AND course_id = ?',
      );
      const ts = nowIso();
      for (const p of positions) {
        stmt.run(Number(p.pos_x), Number(p.pos_y), ts, p.id, courseId);
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Save positions error:', err);
    res.status(500).json({ error: 'Failed to save node layout.' });
  }
});

app.post('/api/courses/:courseId/reorder', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const { ordered_concept_ids } = req.body as { ordered_concept_ids?: string[] };
    if (!Array.isArray(ordered_concept_ids) || ordered_concept_ids.length === 0) {
      res.status(400).json({ error: 'ordered_concept_ids is required.' });
      return;
    }

    const result = withTransaction(() => {
      const prevSnap = snapshotCourseStructure(courseId);
      const prevConcepts = loadCourseConcepts(courseId);
      const prevEdges = loadCoursePrerequisites(courseId);
      const ts = nowIso();

      const stmt = db.prepare(
        'UPDATE concepts SET order_index = ?, updated_at = ? WHERE id = ? AND course_id = ?',
      );
      ordered_concept_ids.forEach((cid, idx) => {
        stmt.run(idx + 1, ts, cid, courseId);
      });

      return recordCurriculumVersionAndNotify({
        courseId,
        instructorId: req.user!.id,
        changeType: 'curriculum_reordered',
        description: 'Reordered concept sequence in curriculum.',
        affectedConceptIds: ordered_concept_ids,
        previousSnapshot: prevSnap,
        previousConcepts: prevConcepts,
        previousEdges: prevEdges,
        changeSummary: {},
        notificationTitle: 'Curriculum Ordering Updated',
        notificationMessage: 'The instructor adjusted the recommended sequence of concepts.',
      });
    });

    res.json(result);
  } catch (err) {
    console.error('Reorder error:', err);
    res.status(500).json({ error: 'Failed to reorder curriculum.' });
  }
});

app.delete('/api/concepts/:conceptId', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { conceptId } = req.params;
    const concept = db
      .prepare('SELECT * FROM concepts WHERE id = ?')
      .get(conceptId) as Record<string, unknown> | undefined;

    if (!concept) {
      res.status(404).json({ error: 'Concept not found.' });
      return;
    }

    const courseId = String(concept.course_id);
    const title = String(concept.title);

    const historyCounts = db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM quiz_attempts WHERE concept_id = ?) AS qa_cnt,
           (SELECT COUNT(*) FROM lesson_progress WHERE concept_id = ?) AS lp_cnt,
           (SELECT COUNT(*) FROM concept_mastery WHERE concept_id = ?) AS cm_cnt`,
      )
      .get(conceptId, conceptId, conceptId) as { qa_cnt: number; lp_cnt: number; cm_cnt: number };

    const hasHistory =
      Number(historyCounts.qa_cnt) > 0 ||
      Number(historyCounts.lp_cnt) > 0 ||
      Number(historyCounts.cm_cnt) > 0;

    const result = withTransaction(() => {
      const prevSnap = snapshotCourseStructure(courseId);
      const prevConcepts = loadCourseConcepts(courseId);
      const prevEdges = loadCoursePrerequisites(courseId);

      // Remove graph edges involving this concept
      db.prepare(
        'DELETE FROM prerequisites WHERE course_id = ? AND (prerequisite_concept_id = ? OR dependent_concept_id = ?)',
      ).run(courseId, conceptId, conceptId);

      if (hasHistory) {
        // Soft-retire so historical learner attempts & progress remain intact!
        db.prepare(`UPDATE concepts SET status = 'retired', updated_at = ? WHERE id = ?`).run(
          nowIso(),
          conceptId,
        );
      } else {
        db.prepare('DELETE FROM concepts WHERE id = ?').run(conceptId);
      }

      const meta = recordCurriculumVersionAndNotify({
        courseId,
        instructorId: req.user!.id,
        changeType: 'concept_retired',
        description: hasHistory
          ? `Retired concept "${title}" while preserving existing learner quiz attempts and progress.`
          : `Removed concept "${title}" from course.`,
        affectedConceptIds: [conceptId],
        previousSnapshot: prevSnap,
        previousConcepts: prevConcepts,
        previousEdges: prevEdges,
        changeSummary: {
          retired_concepts: [title],
        },
        notificationTitle: `Concept Retired: "${title}"`,
        notificationMessage: `"${title}" was retired from the active curriculum. Any prior quiz history remains preserved.`,
      });

      return { retired: hasHistory, deleted: !hasHistory, ...meta };
    });

    res.json(result);
  } catch (err) {
    console.error('Delete/retire concept error:', err);
    res.status(500).json({ error: 'Failed to remove concept.' });
  }
});

// Prerequisites (DAG validated!)
app.post('/api/courses/:courseId/prerequisites', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const { prerequisite_concept_id, dependent_concept_id } = req.body as {
      prerequisite_concept_id?: string;
      dependent_concept_id?: string;
    };

    if (!prerequisite_concept_id || !dependent_concept_id) {
      res.status(400).json({ error: 'Both prerequisite_concept_id and dependent_concept_id are required.' });
      return;
    }

    const result = addPrerequisiteEdgeWithValidation(
      courseId,
      req.user!.id,
      prerequisite_concept_id,
      dependent_concept_id,
    );
    res.status(201).json(result);
  } catch (err) {
    const error = err as Error & { code?: string; cyclePath?: string[] };
    if (error.code === 'CYCLE_DETECTED') {
      res.status(400).json({
        error: error.message,
        code: 'CYCLE_DETECTED',
        cycle_path: error.cyclePath ?? [],
      });
      return;
    }
    res.status(400).json({ error: error.message || 'Failed to add prerequisite link.' });
  }
});

app.delete(
  '/api/courses/:courseId/prerequisites/:edgeId',
  requireAuth,
  requireInstructor,
  (req: AuthenticatedRequest, res) => {
    try {
      const { courseId, edgeId } = req.params;
      const edgeRow = db
        .prepare('SELECT * FROM prerequisites WHERE id = ? AND course_id = ?')
        .get(edgeId, courseId) as
        | { id: string; prerequisite_concept_id: string; dependent_concept_id: string }
        | undefined;

      if (!edgeRow) {
        res.status(404).json({ error: 'Prerequisite link not found.' });
        return;
      }

      const result = withTransaction(() => {
        const prevSnap = snapshotCourseStructure(courseId);
        const prevConcepts = loadCourseConcepts(courseId);
        const prevEdges = loadCoursePrerequisites(courseId);

        const prereq = prevConcepts.find((c) => c.id === edgeRow.prerequisite_concept_id);
        const dep = prevConcepts.find((c) => c.id === edgeRow.dependent_concept_id);

        db.prepare('DELETE FROM prerequisites WHERE id = ?').run(edgeId);

        const label = `${prereq?.title ?? 'Prerequisite'} → ${dep?.title ?? 'Dependent'}`;
        return recordCurriculumVersionAndNotify({
          courseId,
          instructorId: req.user!.id,
          changeType: 'prerequisite_removed',
          description: `Removed prerequisite link "${label}".`,
          affectedConceptIds: [edgeRow.prerequisite_concept_id, edgeRow.dependent_concept_id],
          previousSnapshot: prevSnap,
          previousConcepts: prevConcepts,
          previousEdges: prevEdges,
          changeSummary: {
            removed_prerequisites: [label],
          },
          notificationTitle: `Prerequisite Removed for "${dep?.title ?? 'Concept'}"`,
          notificationMessage: `The prerequisite link "${label}" was removed.`,
        });
      });

      res.json(result);
    } catch (err) {
      console.error('Remove prerequisite error:', err);
      res.status(500).json({ error: 'Failed to remove prerequisite link.' });
    }
  },
);

// Live Concept Splitting (Transactional + History Preserving)
app.post('/api/concepts/:conceptId/split', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { conceptId } = req.params;
    const { child_concepts, chain_sequentially, change_description } = req.body as {
      child_concepts?: Parameters<typeof splitConceptTransactional>[0]['childConcepts'];
      chain_sequentially?: boolean;
      change_description?: string;
    };

    if (!Array.isArray(child_concepts) || child_concepts.length < 2) {
      res.status(400).json({ error: 'Provide at least 2 child concepts to split into.' });
      return;
    }

    const result = splitConceptTransactional({
      conceptId,
      instructorId: req.user!.id,
      childConcepts: child_concepts,
      chainSequentially: chain_sequentially !== false,
      changeDescription: change_description,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Split concept error:', err);
    res.status(400).json({ error: (err as Error).message || 'Failed to split concept.' });
  }
});

// Lessons CRUD
app.post('/api/concepts/:conceptId/lessons', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { conceptId } = req.params;
    const { title, content, video_url, duration_minutes } = req.body as {
      title?: string;
      content?: string;
      video_url?: string;
      duration_minutes?: number;
    };
    if (!title?.trim() || !content?.trim()) {
      res.status(400).json({ error: 'Lesson title and content are required.' });
      return;
    }
    const maxOrder = db
      .prepare('SELECT COALESCE(MAX(order_index), 0) AS mx FROM lessons WHERE concept_id = ?')
      .get(conceptId) as { mx: number };

    const id = crypto.randomUUID();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO lessons (id, concept_id, title, content, video_url, duration_minutes, order_index, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      conceptId,
      title.trim(),
      content.trim(),
      video_url?.trim() || null,
      Math.max(1, Number(duration_minutes) || 10),
      Number(maxOrder.mx) + 1,
      ts,
      ts,
    );

    res.status(201).json({ id });
  } catch (err) {
    console.error('Create lesson error:', err);
    res.status(500).json({ error: 'Failed to create lesson.' });
  }
});

app.put('/api/lessons/:lessonId', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { lessonId } = req.params;
    const { title, content, video_url, duration_minutes } = req.body as {
      title?: string;
      content?: string;
      video_url?: string | null;
      duration_minutes?: number;
    };

    const existing = db
      .prepare('SELECT * FROM lessons WHERE id = ?')
      .get(lessonId) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Lesson not found.' });
      return;
    }

    db.prepare(
      `UPDATE lessons
       SET title = ?, content = ?, video_url = ?, duration_minutes = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      title?.trim() || String(existing.title),
      content?.trim() || String(existing.content),
      video_url !== undefined
        ? video_url
          ? video_url.trim()
          : null
        : existing.video_url
          ? String(existing.video_url)
          : null,
      duration_minutes !== undefined
        ? Math.max(1, Number(duration_minutes))
        : Number(existing.duration_minutes),
      nowIso(),
      lessonId,
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Update lesson error:', err);
    res.status(500).json({ error: 'Failed to update lesson.' });
  }
});

app.delete('/api/lessons/:lessonId', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    db.prepare('DELETE FROM lessons WHERE id = ?').run(req.params.lessonId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete lesson error:', err);
    res.status(500).json({ error: 'Failed to delete lesson.' });
  }
});

// Quiz configuration (Instructor)
app.put('/api/quizzes/:quizId', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const { quizId } = req.params;
    const { title, passing_score, questions } = req.body as {
      title?: string;
      passing_score?: number;
      questions?: Array<{
        id?: string;
        question_text: string;
        option_a: string;
        option_b: string;
        option_c: string;
        option_d: string;
        correct_option: QuizOptionKey;
        explanation: string;
      }>;
    };

    const quizRow = db
      .prepare('SELECT id, concept_id FROM quizzes WHERE id = ?')
      .get(quizId) as { id: string; concept_id: string } | undefined;

    if (!quizRow) {
      res.status(404).json({ error: 'Quiz not found.' });
      return;
    }

    withTransaction(() => {
      const ts = nowIso();
      if (passing_score !== undefined) {
        const clamped = Math.min(100, Math.max(1, Number(passing_score)));
        db.prepare('UPDATE quizzes SET passing_score = ?, updated_at = ? WHERE id = ?').run(
          clamped,
          ts,
          quizId,
        );
        db.prepare('UPDATE concepts SET passing_score = ?, updated_at = ? WHERE id = ?').run(
          clamped,
          ts,
          quizRow.concept_id,
        );
      }
      if (title?.trim()) {
        db.prepare('UPDATE quizzes SET title = ?, updated_at = ? WHERE id = ?').run(
          title.trim(),
          ts,
          quizId,
        );
      }
      if (Array.isArray(questions) && questions.length > 0) {
        db.prepare('DELETE FROM quiz_questions WHERE quiz_id = ?').run(quizId);
        questions.forEach((q, idx) => {
          db.prepare(
            `INSERT INTO quiz_questions (
               id, quiz_id, question_text, option_a, option_b, option_c, option_d,
               correct_option, explanation, order_index
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            q.id || crypto.randomUUID(),
            quizId,
            q.question_text.trim(),
            q.option_a.trim(),
            q.option_b.trim(),
            q.option_c.trim(),
            q.option_d.trim(),
            q.correct_option,
            q.explanation?.trim() ?? '',
            idx + 1,
          );
        });
      }
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Update quiz error:', err);
    res.status(500).json({ error: 'Failed to update quiz.' });
  }
});

// Instructor Analytics
app.get('/api/courses/:courseId/analytics', requireAuth, requireInstructor, (req: AuthenticatedRequest, res) => {
  try {
    const analytics = getInstructorCourseAnalytics(req.params.courseId);
    res.json(analytics);
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ error: 'Failed to compute course analytics.' });
  }
});

// ---------------------------------------------------------------------------
// 4. LEARNER ENROLLMENT, LESSONS, QUIZZES, LEARNING PATH & NOTIFICATIONS
// ---------------------------------------------------------------------------

app.post('/api/courses/:courseId/enroll', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const course = db
      .prepare(`SELECT id, status FROM courses WHERE id = ?`)
      .get(courseId) as { id: string; status: string } | undefined;

    if (!course || course.status !== 'published') {
      res.status(404).json({ error: 'Course is not available for enrollment.' });
      return;
    }

    const existing = db
      .prepare('SELECT id FROM course_enrollments WHERE course_id = ? AND learner_id = ?')
      .get(courseId, req.user!.id);

    if (!existing) {
      const firstConcept = db
        .prepare(
          `SELECT id FROM concepts WHERE course_id = ? AND status = 'active' ORDER BY order_index ASC LIMIT 1`,
        )
        .get(courseId) as { id: string } | undefined;

      const ts = nowIso();
      db.prepare(
        `INSERT INTO course_enrollments (id, course_id, learner_id, enrolled_at, last_active_concept_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(
        crypto.randomUUID(),
        courseId,
        req.user!.id,
        ts,
        firstConcept?.id ?? null,
        ts,
      );
    }

    const detail = getCourseDetailForUser(courseId, req.user!);
    res.status(201).json(detail);
  } catch (err) {
    console.error('Enroll error:', err);
    res.status(500).json({ error: 'Failed to enroll in course.' });
  }
});

app.post('/api/courses/:courseId/active-concept', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const { concept_id } = req.body as { concept_id?: string };
    if (!concept_id) {
      res.status(400).json({ error: 'concept_id is required.' });
      return;
    }

    db.prepare(
      `UPDATE course_enrollments
       SET last_active_concept_id = ?, updated_at = ?
       WHERE course_id = ? AND learner_id = ?`,
    ).run(concept_id, nowIso(), courseId, req.user!.id);

    res.json({ success: true });
  } catch (err) {
    console.error('Set active concept error:', err);
    res.status(500).json({ error: 'Failed to update active concept.' });
  }
});

app.post('/api/lessons/:lessonId/toggle-complete', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { lessonId } = req.params;
    const lessonRow = db
      .prepare(
        `SELECT l.id, l.concept_id, c.course_id
         FROM lessons l
         JOIN concepts c ON c.id = l.concept_id
         WHERE l.id = ?`,
      )
      .get(lessonId) as { id: string; concept_id: string; course_id: string } | undefined;

    if (!lessonRow) {
      res.status(404).json({ error: 'Lesson not found.' });
      return;
    }

    // Verify concept is unlocked before completing lesson
    const concepts = loadCourseConcepts(lessonRow.course_id);
    const edges = loadCoursePrerequisites(lessonRow.course_id);
    const masteredSet = getMasteredConceptIds(lessonRow.course_id, req.user!.id);
    const states = computeConceptStates(concepts, edges, masteredSet);
    const state = states.get(lessonRow.concept_id);

    if (state?.lockState === 'locked') {
      res.status(403).json({ error: state.lockReason || 'This concept is locked.' });
      return;
    }

    const existing = db
      .prepare('SELECT id, completed FROM lesson_progress WHERE lesson_id = ? AND learner_id = ?')
      .get(lessonId, req.user!.id) as { id: string; completed: number } | undefined;

    const ts = nowIso();
    let completedNow = true;
    if (existing) {
      completedNow = existing.completed === 0;
      db.prepare('UPDATE lesson_progress SET completed = ?, completed_at = ? WHERE id = ?').run(
        completedNow ? 1 : 0,
        ts,
        existing.id,
      );
    } else {
      db.prepare(
        `INSERT INTO lesson_progress (id, lesson_id, concept_id, course_id, learner_id, completed, completed_at)
         VALUES (?, ?, ?, ?, ?, 1, ?)`,
      ).run(
        crypto.randomUUID(),
        lessonId,
        lessonRow.concept_id,
        lessonRow.course_id,
        req.user!.id,
        ts,
      );
    }

    res.json({
      lesson_id: lessonId,
      completed: completedNow,
      note: 'Lesson progress updated. Pass the concept quiz to earn mastery and unlock dependent concepts.',
    });
  } catch (err) {
    console.error('Toggle lesson complete error:', err);
    res.status(500).json({ error: 'Failed to update lesson progress.' });
  }
});

app.post('/api/concepts/:conceptId/quiz/submit', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { conceptId } = req.params;
    const { answers } = req.body as { answers?: Record<string, QuizOptionKey> };

    if (!answers || typeof answers !== 'object') {
      res.status(400).json({ error: 'Quiz answers are required.' });
      return;
    }

    const conceptRow = db
      .prepare('SELECT id, course_id, title, status, passing_score FROM concepts WHERE id = ?')
      .get(conceptId) as
      | { id: string; course_id: string; title: string; status: string; passing_score: number }
      | undefined;

    if (!conceptRow) {
      res.status(404).json({ error: 'Concept not found.' });
      return;
    }
    if (conceptRow.status !== 'active') {
      res.status(400).json({ error: 'Cannot submit quiz for a retired or split concept.' });
      return;
    }

    // Server-side prerequisite enforcement
    const concepts = loadCourseConcepts(conceptRow.course_id);
    const edges = loadCoursePrerequisites(conceptRow.course_id);
    const masteredSet = getMasteredConceptIds(conceptRow.course_id, req.user!.id);
    const statesBefore = computeConceptStates(concepts, edges, masteredSet);
    const currentState = statesBefore.get(conceptId);

    if (currentState?.lockState === 'locked') {
      res.status(403).json({
        error: currentState.lockReason || 'Concept is locked until prerequisites are mastered.',
        missing_prerequisites: currentState.missingPrerequisites,
      });
      return;
    }

    const quizRow = db
      .prepare('SELECT id, passing_score FROM quizzes WHERE concept_id = ?')
      .get(conceptId) as { id: string; passing_score: number } | undefined;

    if (!quizRow) {
      res.status(404).json({ error: 'Quiz not configured for this concept.' });
      return;
    }

    const qRows = db
      .prepare(
        `SELECT id, question_text, correct_option, explanation
         FROM quiz_questions
         WHERE quiz_id = ?
         ORDER BY order_index ASC`,
      )
      .all(quizRow.id) as Array<{
      id: string;
      question_text: string;
      correct_option: QuizOptionKey;
      explanation: string;
    }>;

    const evalQuestions: QuizQuestionForEval[] = qRows.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      correct_option: q.correct_option,
      explanation: q.explanation,
    }));

    const passingThreshold = Number(quizRow.passing_score || conceptRow.passing_score || 75);
    const evalResult = evaluateQuizSubmission(evalQuestions, answers, passingThreshold);

    const ts = nowIso();
    const attemptId = crypto.randomUUID();
    const newlyUnlocked: Array<{ id: string; title: string }> = [];

    withTransaction(() => {
      db.prepare(
        `INSERT INTO quiz_attempts (
           id, quiz_id, concept_id, course_id, learner_id, answers_json,
           score, correct_count, total_count, passed, attempted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        attemptId,
        quizRow.id,
        conceptId,
        conceptRow.course_id,
        req.user!.id,
        JSON.stringify(answers),
        evalResult.score,
        evalResult.correctCount,
        evalResult.totalCount,
        evalResult.passed ? 1 : 0,
        ts,
      );

      const existingMastery = db
        .prepare('SELECT id, mastered, best_score, mastered_at FROM concept_mastery WHERE concept_id = ? AND learner_id = ?')
        .get(conceptId, req.user!.id) as
        | { id: string; mastered: number; best_score: number; mastered_at: string | null }
        | undefined;

      const bestScore = Math.max(existingMastery?.best_score ?? 0, evalResult.score);
      const isMasteredNow = (existingMastery?.mastered === 1) || evalResult.passed;
      const masteredAt = existingMastery?.mastered_at ?? (evalResult.passed ? ts : null);

      if (existingMastery) {
        db.prepare(
          `UPDATE concept_mastery
           SET mastered = ?, best_score = ?, mastered_at = ?, updated_at = ?
           WHERE id = ?`,
        ).run(isMasteredNow ? 1 : 0, bestScore, masteredAt, ts, existingMastery.id);
      } else {
        db.prepare(
          `INSERT INTO concept_mastery (
             id, concept_id, course_id, learner_id, mastered, best_score, mastered_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          crypto.randomUUID(),
          conceptId,
          conceptRow.course_id,
          req.user!.id,
          isMasteredNow ? 1 : 0,
          bestScore,
          masteredAt,
          ts,
        );
      }

      // Compute newly unlocked concepts after mastery update
      if (evalResult.passed) {
        const updatedMastered = new Set(masteredSet);
        updatedMastered.add(conceptId);
        const statesAfter = computeConceptStates(concepts, edges, updatedMastered);
        for (const c of concepts) {
          if (
            c.status === 'active' &&
            statesBefore.get(c.id)?.lockState === 'locked' &&
            statesAfter.get(c.id)?.lockState === 'unlocked'
          ) {
            newlyUnlocked.push({ id: c.id, title: c.title });
          }
        }
      }
    });

    res.json({
      attempt_id: attemptId,
      score: evalResult.score,
      correct_count: evalResult.correctCount,
      total_count: evalResult.totalCount,
      passing_score: passingThreshold,
      passed: evalResult.passed,
      question_feedback: evalResult.questionFeedback,
      newly_unlocked_concepts: newlyUnlocked,
      recommendation: evalResult.passed
        ? newlyUnlocked.length > 0
          ? `Mastery verified! You unlocked: ${newlyUnlocked.map((c) => c.title).join(', ')}.`
          : 'Mastery verified for this concept.'
        : `Score ${evalResult.score}% is below the ${passingThreshold}% passing threshold. Review the concept lessons and retry the quiz.`,
    });
  } catch (err) {
    console.error('Submit quiz error:', err);
    res.status(500).json({ error: 'Failed to grade quiz submission.' });
  }
});

// Personalized Learning Path Generator
app.get('/api/courses/:courseId/learning-path', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { courseId } = req.params;
    const targetConceptId = String(req.query.targetConceptId || '');
    if (!targetConceptId) {
      res.status(400).json({ error: 'targetConceptId query parameter is required.' });
      return;
    }

    const pathResult = buildLearningPathForLearner(courseId, req.user!.id, targetConceptId);
    res.json(pathResult);
  } catch (err) {
    console.error('Learning path error:', err);
    res.status(400).json({ error: (err as Error).message || 'Failed to compute learning path.' });
  }
});

// Learner Dashboard Aggregation
app.get('/api/learner/dashboard', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const learnerId = req.user!.id;
    const allCourses = getCourseSummariesForUser(req.user!);
    const enrolledCourses = allCourses.filter((c) => c.is_enrolled);

    const recentAttemptsRows = db
      .prepare(
        `SELECT qa.*, c.title AS concept_title, co.title AS course_title
         FROM quiz_attempts qa
         JOIN concepts c ON c.id = qa.concept_id
         JOIN courses co ON co.id = qa.course_id
         WHERE qa.learner_id = ?
         ORDER BY qa.attempted_at DESC
         LIMIT 15`,
      )
      .all(learnerId) as Array<Record<string, unknown>>;

    const recentAttempts = recentAttemptsRows.map((a) => ({
      id: String(a.id),
      quiz_id: String(a.quiz_id),
      concept_id: String(a.concept_id),
      concept_title: String(a.concept_title),
      course_id: String(a.course_id),
      course_title: String(a.course_title),
      learner_id: String(a.learner_id),
      score: Number(a.score),
      correct_count: Number(a.correct_count),
      total_count: Number(a.total_count),
      passed: Number(a.passed) === 1,
      attempted_at: String(a.attempted_at),
    }));

    const lessonHistoryRows = db
      .prepare(
        `SELECT lp.id, lp.completed_at, l.title AS lesson_title, c.title AS concept_title, co.title AS course_title
         FROM lesson_progress lp
         JOIN lessons l ON l.id = lp.lesson_id
         JOIN concepts c ON c.id = lp.concept_id
         JOIN courses co ON co.id = lp.course_id
         WHERE lp.learner_id = ? AND lp.completed = 1
         ORDER BY lp.completed_at DESC
         LIMIT 12`,
      )
      .all(learnerId) as Array<Record<string, unknown>>;

    const notifications = getNotificationsForLearner(learnerId);

    // Compute aggregate remaining minutes and unlocked/locked counts across enrolled courses
    let totalMastered = 0;
    let totalActiveConcepts = 0;
    let totalRemainingMinutes = 0;

    for (const c of enrolledCourses) {
      const detail = getCourseDetailForUser(c.id, req.user!);
      if (!detail) continue;
      for (const con of detail.concepts) {
        if (con.status !== 'active') continue;
        totalActiveConcepts += 1;
        if (con.lock_state === 'mastered') {
          totalMastered += 1;
        } else {
          const lessonMins = con.lessons.reduce((s, l) => s + l.duration_minutes, 0);
          totalRemainingMinutes += lessonMins > 0 ? lessonMins : con.estimated_minutes;
        }
      }
    }

    res.json({
      enrolled_courses: enrolledCourses,
      catalog_courses: allCourses,
      summary: {
        enrolled_count: enrolledCourses.length,
        total_mastered: totalMastered,
        total_active_concepts: totalActiveConcepts,
        overall_completion_percentage:
          totalActiveConcepts === 0
            ? 0
            : Math.round((totalMastered / totalActiveConcepts) * 100),
        estimated_remaining_minutes: totalRemainingMinutes,
      },
      recent_attempts: recentAttempts,
      lesson_history: lessonHistoryRows.map((r) => ({
        id: String(r.id),
        completed_at: String(r.completed_at),
        lesson_title: String(r.lesson_title),
        concept_title: String(r.concept_title),
        course_title: String(r.course_title),
      })),
      notifications,
    });
  } catch (err) {
    console.error('Learner dashboard error:', err);
    res.status(500).json({ error: 'Failed to load learner dashboard.' });
  }
});

// Notifications
app.get('/api/notifications', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const notifications = getNotificationsForLearner(req.user!.id);
    res.json({ notifications });
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

app.patch('/api/notifications/:id/read', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    db.prepare(
      'UPDATE learner_notifications SET is_read = 1 WHERE id = ? AND learner_id = ?',
    ).run(req.params.id, req.user!.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark notification read error:', err);
    res.status(500).json({ error: 'Failed to mark notification as read.' });
  }
});

app.post('/api/notifications/mark-all-read', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    db.prepare('UPDATE learner_notifications SET is_read = 1 WHERE learner_id = ?').run(
      req.user!.id,
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all notifications as read.' });
  }
});

// ---------------------------------------------------------------------------
// 5. SERVER BOOTSTRAP (Vite Dev Middleware or Static Production)
// ---------------------------------------------------------------------------

async function startServer(): Promise<void> {
  const PORT = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LearnPath server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start LearnPath server:', err);
  process.exit(1);
});
