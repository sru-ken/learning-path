-- LearnPath: Supabase PostgreSQL Reference Schema & Row Level Security Policies
-- Apply this migration when connecting an external Supabase project.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('instructor', 'learner')) DEFAULT 'learner',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Courses
CREATE TABLE IF NOT EXISTS public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
  thumbnail_url TEXT,
  estimated_duration_minutes INTEGER NOT NULL DEFAULT 60,
  default_passing_score INTEGER NOT NULL DEFAULT 75 CHECK (default_passing_score BETWEEN 1 AND 100),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
  current_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Course Enrollments
CREATE TABLE IF NOT EXISTS public.course_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_concept_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, learner_id)
);

-- 4. Concepts
CREATE TABLE IF NOT EXISTS public.concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  learning_objectives JSONB NOT NULL DEFAULT '[]'::jsonb,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')) DEFAULT 'beginner',
  estimated_minutes INTEGER NOT NULL DEFAULT 20,
  passing_score INTEGER NOT NULL DEFAULT 75 CHECK (passing_score BETWEEN 1 AND 100),
  order_index INTEGER NOT NULL DEFAULT 1,
  pos_x DOUBLE PRECISION NOT NULL DEFAULT 0,
  pos_y DOUBLE PRECISION NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'split', 'retired')) DEFAULT 'active',
  split_from_concept_id UUID REFERENCES public.concepts(id) ON DELETE SET NULL,
  split_into_concept_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Lessons
CREATE TABLE IF NOT EXISTS public.lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  video_url TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 10,
  order_index INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Prerequisites (Directed Acyclic Graph edges)
CREATE TABLE IF NOT EXISTS public.prerequisites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  prerequisite_concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  dependent_concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prerequisite_concept_id, dependent_concept_id),
  CHECK (prerequisite_concept_id <> dependent_concept_id)
);

-- Database-level DAG Cycle Prevention Trigger
CREATE OR REPLACE FUNCTION public.prevent_prerequisite_cycle()
RETURNS TRIGGER AS $$
DECLARE
  has_cycle BOOLEAN;
BEGIN
  WITH RECURSIVE reachable(node_id) AS (
    SELECT NEW.dependent_concept_id
    UNION
    SELECT p.dependent_concept_id
    FROM public.prerequisites p
    INNER JOIN reachable r ON p.prerequisite_concept_id = r.node_id
    WHERE p.course_id = NEW.course_id
  )
  SELECT EXISTS (
    SELECT 1 FROM reachable WHERE node_id = NEW.prerequisite_concept_id
  ) INTO has_cycle;

  IF has_cycle THEN
    RAISE EXCEPTION 'Cannot add prerequisite: creating this edge introduces a learning cycle.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_prerequisite_cycle ON public.prerequisites;
CREATE TRIGGER trg_prevent_prerequisite_cycle
BEFORE INSERT OR UPDATE ON public.prerequisites
FOR EACH ROW EXECUTE FUNCTION public.prevent_prerequisite_cycle();

-- 7. Quizzes
CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL UNIQUE REFERENCES public.concepts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  passing_score INTEGER NOT NULL DEFAULT 75 CHECK (passing_score BETWEEN 1 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Quiz Questions
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
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
CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE RESTRICT,
  concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  answers_json JSONB NOT NULL,
  score INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  total_count INTEGER NOT NULL,
  passed BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Lesson Progress
CREATE TABLE IF NOT EXISTS public.lesson_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_id, learner_id)
);

-- 11. Concept Mastery
CREATE TABLE IF NOT EXISTS public.concept_mastery (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id UUID NOT NULL REFERENCES public.concepts(id) ON DELETE RESTRICT,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mastered BOOLEAN NOT NULL DEFAULT FALSE,
  best_score INTEGER NOT NULL DEFAULT 0,
  mastered_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (concept_id, learner_id)
);

-- 12. Curriculum Versions
CREATE TABLE IF NOT EXISTS public.curriculum_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  summary TEXT NOT NULL,
  snapshot_json JSONB NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. Curriculum Change Logs
CREATE TABLE IF NOT EXISTS public.curriculum_change_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.curriculum_versions(id) ON DELETE CASCADE,
  change_type TEXT NOT NULL,
  description TEXT NOT NULL,
  affected_concept_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  affected_learner_count INTEGER NOT NULL DEFAULT 0,
  previous_structure_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_structure_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  changed_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. Learner Notifications
CREATE TABLE IF NOT EXISTS public.learner_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  change_log_id UUID REFERENCES public.curriculum_change_logs(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  change_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  next_topic_changed BOOLEAN NOT NULL DEFAULT FALSE,
  previous_next_concept_id UUID,
  new_next_concept_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_concepts_course ON public.concepts(course_id);
CREATE INDEX IF NOT EXISTS idx_prerequisites_course ON public.prerequisites(course_id);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_learner_concept ON public.quiz_attempts(learner_id, concept_id);
CREATE INDEX IF NOT EXISTS idx_concept_mastery_learner_course ON public.concept_mastery(learner_id, course_id);
CREATE INDEX IF NOT EXISTS idx_notifications_learner_unread ON public.learner_notifications(learner_id, is_read);

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prerequisites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_mastery ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_change_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learner_notifications ENABLE ROW LEVEL SECURITY;

-- Example RLS Policies
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Published courses readable by all authenticated users" ON public.courses
  FOR SELECT USING (status = 'published' OR instructor_id = auth.uid());

CREATE POLICY "Instructors manage own courses" ON public.courses
  FOR ALL USING (instructor_id = auth.uid());

CREATE POLICY "Learners access own enrollments" ON public.course_enrollments
  FOR ALL USING (learner_id = auth.uid());

CREATE POLICY "Learners read own quiz attempts" ON public.quiz_attempts
  FOR SELECT USING (learner_id = auth.uid());

CREATE POLICY "Learners read own notifications" ON public.learner_notifications
  FOR ALL USING (learner_id = auth.uid());
