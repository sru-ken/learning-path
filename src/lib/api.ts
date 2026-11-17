import type {
  CourseDetailResponse,
  CourseStatus,
  CourseSummary,
  DifficultyLevel,
  InstructorCourseAnalytics,
  LearnerNotification,
  PersonalizedLearningPath,
  Profile,
  QuizAttempt,
  QuizOptionKey,
  UserRole,
} from '../types/learnpath.ts';

const SESSION_TOKEN_KEY = 'learnpath_session_token';

let inMemoryToken: string | null =
  typeof window !== 'undefined' ? window.sessionStorage.getItem(SESSION_TOKEN_KEY) : null;

export function setSessionToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      window.sessionStorage.setItem(SESSION_TOKEN_KEY, token);
    } else {
      window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
    }
  }
}

export function getSessionToken(): string | null {
  return inMemoryToken;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  cyclePath?: string[];

  constructor(message: string, status: number, code?: string, cyclePath?: string[]) {
    super(message);
    this.status = status;
    this.code = code;
    this.cyclePath = cyclePath;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (inMemoryToken) {
    headers.Authorization = `Bearer ${inMemoryToken}`;
  }

  const res = await fetch(path, {
    ...options,
    headers,
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(
      String(data.error || `Request failed (${res.status})`),
      res.status,
      typeof data.code === 'string' ? data.code : undefined,
      Array.isArray(data.cycle_path) ? (data.cycle_path as string[]) : undefined,
    );
  }

  return data as T;
}

export interface LearnerDashboardPayload {
  enrolled_courses: CourseSummary[];
  catalog_courses: CourseSummary[];
  summary: {
    enrolled_count: number;
    total_mastered: number;
    total_active_concepts: number;
    overall_completion_percentage: number;
    estimated_remaining_minutes: number;
  };
  recent_attempts: Array<
    Omit<QuizAttempt, 'answers'> & { concept_title: string; course_title: string }
  >;
  lesson_history: Array<{
    id: string;
    completed_at: string;
    lesson_title: string;
    concept_title: string;
    course_title: string;
  }>;
  notifications: LearnerNotification[];
}

export interface QuizSubmitResponse {
  attempt_id: string;
  score: number;
  correct_count: number;
  total_count: number;
  passing_score: number;
  passed: boolean;
  question_feedback: Array<{
    question_id: string;
    selected_option: QuizOptionKey | null;
    correct_option: QuizOptionKey;
    is_correct: boolean;
    explanation: string;
  }>;
  newly_unlocked_concepts: Array<{ id: string; title: string }>;
  recommendation: string;
}

export const api = {
  // Auth
  register: (payload: {
    email: string;
    password: string;
    full_name: string;
    role: UserRole;
  }) => request<{ token: string; user: Profile }>('/api/auth/register', { method: 'POST', body: JSON.stringify(payload) }),

  login: (payload: { email: string; password: string }) =>
    request<{ token: string; user: Profile }>('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) }),

  logout: () => request<{ success: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: Profile }>('/api/auth/me'),

  forgotPassword: (email: string) =>
    request<{ message: string; reset_code: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (payload: { email: string; reset_code: string; new_password: string }) =>
    request<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Courses
  listCourses: () => request<{ courses: CourseSummary[] }>('/api/courses'),

  getCourse: (courseId: string) => request<CourseDetailResponse>(`/api/courses/${courseId}`),

  createCourse: (payload: {
    title: string;
    description: string;
    category: string;
    difficulty: DifficultyLevel;
    thumbnail_url?: string;
    estimated_duration_minutes: number;
    default_passing_score: number;
    status: CourseStatus;
  }) =>
    request<CourseDetailResponse>('/api/courses', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateCourse: (
    courseId: string,
    payload: Partial<{
      title: string;
      description: string;
      category: string;
      difficulty: DifficultyLevel;
      thumbnail_url: string;
      estimated_duration_minutes: number;
      default_passing_score: number;
      status: CourseStatus;
    }>,
  ) =>
    request<CourseDetailResponse>(`/api/courses/${courseId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  updateCourseStatus: (courseId: string, status: CourseStatus) =>
    request<CourseDetailResponse>(`/api/courses/${courseId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  deleteCourse: (courseId: string) =>
    request<{ deleted?: boolean; archived?: boolean; message?: string }>(`/api/courses/${courseId}`, {
      method: 'DELETE',
    }),

  // Concepts & Graph
  createConcept: (
    courseId: string,
    payload: {
      title: string;
      description: string;
      learning_objectives?: string[];
      difficulty?: DifficultyLevel;
      estimated_minutes?: number;
      passing_score?: number;
      pos_x?: number;
      pos_y?: number;
      lesson_title?: string;
      lesson_content?: string;
      lesson_video_url?: string;
    },
  ) =>
    request<{ conceptId: string; versionNumber: number; affectedLearnerCount: number }>(
      `/api/courses/${courseId}/concepts`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  updateConcept: (
    conceptId: string,
    payload: Partial<{
      title: string;
      description: string;
      learning_objectives: string[];
      difficulty: DifficultyLevel;
      estimated_minutes: number;
      passing_score: number;
      order_index: number;
      pos_x: number;
      pos_y: number;
    }>,
  ) =>
    request<{ success: boolean }>(`/api/concepts/${conceptId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  saveNodePositions: (
    courseId: string,
    positions: Array<{ id: string; pos_x: number; pos_y: number }>,
  ) =>
    request<{ success: boolean }>(`/api/courses/${courseId}/positions`, {
      method: 'POST',
      body: JSON.stringify({ positions }),
    }),

  reorderConcepts: (courseId: string, ordered_concept_ids: string[]) =>
    request<{ versionNumber: number; affectedLearnerCount: number }>(
      `/api/courses/${courseId}/reorder`,
      { method: 'POST', body: JSON.stringify({ ordered_concept_ids }) },
    ),

  deleteConcept: (conceptId: string) =>
    request<{ retired: boolean; deleted: boolean; versionNumber: number }>(
      `/api/concepts/${conceptId}`,
      { method: 'DELETE' },
    ),

  addPrerequisite: (
    courseId: string,
    prerequisite_concept_id: string,
    dependent_concept_id: string,
  ) =>
    request<{ edge: { id: string }; versionNumber: number; affectedLearnerCount: number }>(
      `/api/courses/${courseId}/prerequisites`,
      {
        method: 'POST',
        body: JSON.stringify({ prerequisite_concept_id, dependent_concept_id }),
      },
    ),

  removePrerequisite: (courseId: string, edgeId: string) =>
    request<{ versionNumber: number; affectedLearnerCount: number }>(
      `/api/courses/${courseId}/prerequisites/${edgeId}`,
      { method: 'DELETE' },
    ),

  splitConcept: (
    conceptId: string,
    payload: {
      chain_sequentially: boolean;
      change_description?: string;
      child_concepts: Array<{
        title: string;
        description: string;
        learning_objectives: string[];
        difficulty: DifficultyLevel;
        estimated_minutes: number;
        passing_score: number;
        lesson_title: string;
        lesson_content: string;
        lesson_video_url?: string;
        questions?: Array<{
          question_text: string;
          option_a: string;
          option_b: string;
          option_c: string;
          option_d: string;
          correct_option: QuizOptionKey;
          explanation: string;
        }>;
      }>;
    },
  ) =>
    request<{ splitConceptIds: string[]; versionNumber: number; affectedLearnerCount: number }>(
      `/api/concepts/${conceptId}/split`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  // Lessons & Quizzes (Instructor)
  createLesson: (
    conceptId: string,
    payload: { title: string; content: string; video_url?: string; duration_minutes: number },
  ) =>
    request<{ id: string }>(`/api/concepts/${conceptId}/lessons`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateLesson: (
    lessonId: string,
    payload: { title?: string; content?: string; video_url?: string | null; duration_minutes?: number },
  ) =>
    request<{ success: boolean }>(`/api/lessons/${lessonId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteLesson: (lessonId: string) =>
    request<{ success: boolean }>(`/api/lessons/${lessonId}`, { method: 'DELETE' }),

  updateQuiz: (
    quizId: string,
    payload: {
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
    },
  ) =>
    request<{ success: boolean }>(`/api/quizzes/${quizId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getCourseAnalytics: (courseId: string) =>
    request<InstructorCourseAnalytics>(`/api/courses/${courseId}/analytics`),

  // Learner Actions
  enrollCourse: (courseId: string) =>
    request<CourseDetailResponse>(`/api/courses/${courseId}/enroll`, { method: 'POST' }),

  setActiveConcept: (courseId: string, concept_id: string) =>
    request<{ success: boolean }>(`/api/courses/${courseId}/active-concept`, {
      method: 'POST',
      body: JSON.stringify({ concept_id }),
    }),

  toggleLessonComplete: (lessonId: string) =>
    request<{ lesson_id: string; completed: boolean; note: string }>(
      `/api/lessons/${lessonId}/toggle-complete`,
      { method: 'POST' },
    ),

  submitQuiz: (conceptId: string, answers: Record<string, QuizOptionKey>) =>
    request<QuizSubmitResponse>(`/api/concepts/${conceptId}/quiz/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  getLearningPath: (courseId: string, targetConceptId: string) =>
    request<PersonalizedLearningPath>(
      `/api/courses/${courseId}/learning-path?targetConceptId=${encodeURIComponent(targetConceptId)}`,
    ),

  getLearnerDashboard: () => request<LearnerDashboardPayload>('/api/learner/dashboard'),

  getNotifications: () => request<{ notifications: LearnerNotification[] }>('/api/notifications'),

  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/api/notifications/${id}/read`, { method: 'PATCH' }),

  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/api/notifications/mark-all-read', { method: 'POST' }),
};
