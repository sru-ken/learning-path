export type UserRole = 'instructor' | 'learner';

export type CourseStatus = 'draft' | 'published' | 'archived';

export type ConceptStatus = 'active' | 'split' | 'retired';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';

export type QuizOptionKey = 'A' | 'B' | 'C' | 'D';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  instructor_id: string;
  instructor_name?: string;
  title: string;
  description: string;
  category: string;
  difficulty: DifficultyLevel;
  thumbnail_url: string | null;
  estimated_duration_minutes: number;
  default_passing_score: number;
  status: CourseStatus;
  current_version: number;
  created_at: string;
  updated_at: string;
}

export interface CourseSummary extends Course {
  concept_count: number;
  enrolled_count: number;
  is_enrolled?: boolean;
  completion_percentage?: number;
  mastered_count?: number;
  last_active_concept_id?: string | null;
}

export interface Concept {
  id: string;
  course_id: string;
  title: string;
  description: string;
  learning_objectives: string[];
  difficulty: DifficultyLevel;
  estimated_minutes: number;
  passing_score: number;
  order_index: number;
  pos_x: number;
  pos_y: number;
  status: ConceptStatus;
  split_from_concept_id: string | null;
  split_into_concept_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface Lesson {
  id: string;
  concept_id: string;
  title: string;
  content: string;
  video_url: string | null;
  duration_minutes: number;
  order_index: number;
  created_at: string;
  updated_at: string;
  completed?: boolean;
  completed_at?: string | null;
}

export interface PrerequisiteEdge {
  id: string;
  course_id: string;
  prerequisite_concept_id: string;
  dependent_concept_id: string;
  created_at: string;
}

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_option?: QuizOptionKey;
  explanation?: string;
  order_index: number;
}

export interface Quiz {
  id: string;
  concept_id: string;
  title: string;
  passing_score: number;
  questions: QuizQuestion[];
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  concept_id: string;
  concept_title?: string;
  course_id: string;
  course_title?: string;
  learner_id: string;
  answers: Record<string, QuizOptionKey>;
  score: number;
  correct_count: number;
  total_count: number;
  passed: boolean;
  attempted_at: string;
}

export interface ConceptMasteryRecord {
  id: string;
  concept_id: string;
  course_id: string;
  learner_id: string;
  mastered: boolean;
  best_score: number;
  mastered_at: string | null;
  updated_at: string;
}

export type ConceptLockState = 'mastered' | 'unlocked' | 'locked' | 'retired';

export interface ConceptWithProgress extends Concept {
  lessons: Lesson[];
  quiz: Quiz | null;
  lock_state: ConceptLockState;
  mastered: boolean;
  best_score: number | null;
  mastered_at: string | null;
  missing_prerequisites: Array<{ id: string; title: string }>;
  lock_reason: string | null;
  attempts: QuizAttempt[];
  completed_lessons_count: number;
  total_lessons_count: number;
}

export interface CurriculumVersion {
  id: string;
  course_id: string;
  version_number: number;
  summary: string;
  snapshot: {
    concepts: Array<{ id: string; title: string; status: ConceptStatus; order_index: number }>;
    prerequisites: Array<{ prerequisite_concept_id: string; dependent_concept_id: string }>;
  };
  created_by: string;
  created_by_name?: string;
  created_at: string;
}

export interface CurriculumChangeLog {
  id: string;
  course_id: string;
  version_id: string;
  version_number?: number;
  change_type:
    | 'concept_added'
    | 'concept_updated'
    | 'concept_retired'
    | 'concept_split'
    | 'prerequisite_added'
    | 'prerequisite_removed'
    | 'curriculum_reordered'
    | 'course_published';
  description: string;
  affected_concept_ids: string[];
  affected_concept_titles?: string[];
  affected_learner_count: number;
  previous_structure: Record<string, unknown>;
  new_structure: Record<string, unknown>;
  changed_by: string;
  changed_by_name?: string;
  created_at: string;
}

export interface LearnerNotification {
  id: string;
  learner_id: string;
  course_id: string;
  course_title?: string;
  change_log_id: string | null;
  title: string;
  message: string;
  change_summary: {
    added_concepts?: string[];
    removed_prerequisites?: string[];
    new_prerequisites?: string[];
    split_concepts?: Array<{ original: string; children: string[] }>;
    retired_concepts?: string[];
  };
  next_topic_changed: boolean;
  previous_next_concept_id: string | null;
  previous_next_concept_title?: string | null;
  new_next_concept_id: string | null;
  new_next_concept_title?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface LearningPathStep {
  concept_id: string;
  title: string;
  description: string;
  difficulty: DifficultyLevel;
  estimated_minutes: number;
  status: 'mastered' | 'next_recommended' | 'unlocked' | 'locked';
  prerequisite_ids: string[];
  missing_prerequisite_titles: string[];
  is_target: boolean;
  step_number: number | null;
}

export interface PersonalizedLearningPath {
  course_id: string;
  target_concept_id: string;
  target_concept_title: string;
  ordered_remaining_steps: LearningPathStep[];
  completed_prerequisites: LearningPathStep[];
  all_dependency_steps: LearningPathStep[];
  next_recommended_concept: LearningPathStep | null;
  estimated_remaining_minutes: number;
  total_dependency_minutes: number;
  completion_percentage: number;
}

export interface CourseDetailResponse {
  course: CourseSummary;
  concepts: ConceptWithProgress[];
  prerequisites: PrerequisiteEdge[];
  enrollment: {
    id: string;
    enrolled_at: string;
    last_active_concept_id: string | null;
  } | null;
  versions: CurriculumVersion[];
  change_logs: CurriculumChangeLog[];
}

export interface InstructorCourseAnalytics {
  course_id: string;
  enrolled_learners: number;
  average_completion_percentage: number;
  average_quiz_score: number;
  total_quiz_attempts: number;
  pass_rate: number;
  concept_stats: Array<{
    concept_id: string;
    title: string;
    status: ConceptStatus;
    mastered_learners: number;
    attempt_count: number;
    average_score: number;
    pass_rate: number;
  }>;
  learner_progress_rows: Array<{
    learner_id: string;
    full_name: string;
    email: string;
    enrolled_at: string;
    mastered_count: number;
    total_active_concepts: number;
    completion_percentage: number;
    average_score: number | null;
    last_active_concept_title: string | null;
  }>;
}
