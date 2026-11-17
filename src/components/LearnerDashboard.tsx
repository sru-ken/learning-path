import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  Clock,
  PlayCircle,
  Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type LearnerDashboardPayload } from '../lib/api.ts';
import { cn, formatDateTime, formatMinutes } from '../lib/utils.ts';
import type { Profile } from '../types/learnpath.ts';
import { CourseThumbnail } from './CourseThumbnail.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import { Progress } from './ui/tabs.tsx';

interface LearnerDashboardProps {
  user: Profile;
  onOpenCourse: (
    courseId: string,
    conceptId?: string | null,
    tab?: 'graph' | 'learn' | 'path' | 'history',
  ) => void;
  onOpenNotifications: () => void;
}

export function LearnerDashboard({
  user,
  onOpenCourse,
  onOpenNotifications,
}: LearnerDashboardProps) {
  const [data, setData] = useState<LearnerDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    try {
      const payload = await api.getLearnerDashboard();
      setData(payload);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load dashboard.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  async function handleEnroll(courseId: string) {
    setEnrollingId(courseId);
    try {
      await api.enrollCourse(courseId);
      toast.success('Enrolled successfully.');
      onOpenCourse(courseId, null, 'graph');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not enroll.');
    } finally {
      setEnrollingId(null);
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <div className="h-32 animate-pulse rounded-xl bg-white border border-slate-200" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white border border-slate-200" />
          ))}
        </div>
      </div>
    );
  }

  const primaryEnrolled = data.enrolled_courses[0] ?? null;
  const unreadNotifications = data.notifications.filter((n) => !n.is_read);
  const unEnrolledCatalog = data.catalog_courses.filter((c) => !c.is_enrolled);

  return (
    <div className="space-y-8">
      {/* Welcome & Continue Learning Hero */}
      <Card className="bg-gradient-to-r from-[#FFFFFF] via-[#F8FAFF] to-[#EFF4FF] border-slate-200">
        <CardContent className="pt-6 flex flex-wrap items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-2xl">
            <p className="text-xs font-semibold text-[#2563EB]">Learner Workspace</p>
            <h1 className="font-display text-2xl font-bold text-[#0F172A]">
              Welcome back, {user.full_name}
            </h1>
            <p className="text-sm text-slate-600">
              {primaryEnrolled
                ? `Continue building mastery in ${primaryEnrolled.title} or generate a personalized path to any advanced concept.`
                : 'Enroll in a course below to explore its prerequisite knowledge graph and start earning concept mastery.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {primaryEnrolled ? (
              <>
                <Button
                  onClick={() =>
                    onOpenCourse(
                      primaryEnrolled.id,
                      primaryEnrolled.last_active_concept_id,
                      'learn',
                    )
                  }
                >
                  <PlayCircle className="h-4 w-4" />
                  <span>Continue Learning</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={() => onOpenCourse(primaryEnrolled.id, null, 'path')}
                >
                  <Target className="h-4 w-4" />
                  <span>Learning Path</span>
                </Button>
              </>
            ) : (
              data.catalog_courses[0] && (
                <Button
                  disabled={enrollingId === data.catalog_courses[0].id}
                  onClick={() => handleEnroll(data.catalog_courses[0].id)}
                >
                  <span>Enroll in {data.catalog_courses[0].title}</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* 4-Column Summary KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Enrolled Courses</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#0F172A] mt-1">
              {data.summary.enrolled_count}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Concepts Mastered</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#059669] mt-1">
              {data.summary.total_mastered}
              <span className="text-sm font-normal text-slate-400">
                /{data.summary.total_active_concepts}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Overall Mastery</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#2563EB] mt-1">
              {data.summary.overall_completion_percentage}%
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Estimated Time Remaining</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#7C3AED] mt-1">
              {formatMinutes(data.summary.estimated_remaining_minutes)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Unread Curriculum Update Alert Banner */}
      {unreadNotifications.length > 0 && (
        <Card className="border-blue-200 bg-[#F5F8FF]">
          <CardContent className="pt-5 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Bell className="h-5 w-5 text-[#2563EB] shrink-0 mt-0.5" />
              <div>
                <p className="font-display text-sm font-semibold text-[#0F172A]">
                  {unreadNotifications.length} Curriculum Update
                  {unreadNotifications.length > 1 ? 's' : ''} Available
                </p>
                <p className="text-xs text-slate-600 mt-0.5">
                  {unreadNotifications[0].title} — {unreadNotifications[0].message}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={onOpenNotifications}>
              View Notifications
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Enrolled Courses */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-[#0F172A]">
            My Enrolled Courses
          </h2>
        </div>

        {data.enrolled_courses.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center space-y-2">
              <BookOpen className="h-8 w-8 text-slate-300 mx-auto" />
              <p className="font-display text-sm font-semibold text-[#0F172A]">
                You haven’t enrolled in any courses yet
              </p>
              <p className="text-xs text-slate-500">
                Choose a course from the catalog below to begin your prerequisite-guided learning
                journey.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {data.enrolled_courses.map((course) => (
              <Card key={course.id} className="overflow-hidden flex flex-col">
                <div className="h-40 w-full">
                  <CourseThumbnail src={course.thumbnail_url} alt={course.title} />
                </div>
                <CardContent className="pt-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span>{course.category}</span>
                      <span aria-hidden="true">·</span>
                      <span className="capitalize">{course.difficulty}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">v{course.current_version}</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-[#0F172A]">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2">{course.description}</p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs tabular-nums">
                        <span className="text-slate-500">
                          {course.mastered_count}/{course.concept_count} mastered
                        </span>
                        <span className="font-mono font-bold text-[#2563EB]">
                          {course.completion_percentage}%
                        </span>
                      </div>
                      <Progress value={course.completion_percentage} />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        onClick={() =>
                          onOpenCourse(course.id, course.last_active_concept_id, 'learn')
                        }
                      >
                        Resume
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenCourse(course.id, null, 'graph')}
                      >
                        Graph & Path
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Course Catalog */}
      {unEnrolledCatalog.length > 0 && (
        <section className="space-y-4">
          <h2 className="font-display text-lg font-bold text-[#0F172A]">
            Available Course Catalog
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {unEnrolledCatalog.map((course) => (
              <Card key={course.id} className="overflow-hidden flex flex-col">
                <div className="h-40 w-full">
                  <CourseThumbnail src={course.thumbnail_url} alt={course.title} />
                </div>
                <CardContent className="pt-5 flex-1 flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span>{course.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>{course.concept_count} concepts</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatMinutes(course.estimated_duration_minutes)}</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-[#0F172A]">
                      {course.title}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-2">{course.description}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={enrollingId === course.id}
                      onClick={() => handleEnroll(course.id)}
                    >
                      {enrollingId === course.id ? 'Enrolling...' : 'Enroll & Start'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenCourse(course.id, null, 'graph')}
                    >
                      Preview
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Recent Quiz Results & Activity History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Recent Quiz Attempts</CardTitle>
            <CardDescription>
              Historical quiz scores remain preserved even when courses restructure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.recent_attempts.length === 0 ? (
              <p className="text-sm text-slate-500">
                No quiz attempts recorded yet. Pass a concept quiz to verify mastery.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 pr-4 font-semibold">Concept</th>
                      <th className="py-2 pr-4 font-semibold">Course</th>
                      <th className="py-2 pr-4 font-semibold text-right">Score</th>
                      <th className="py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.recent_attempts.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2.5 pr-4 font-semibold text-[#0F172A]">
                          {a.concept_title}
                        </td>
                        <td className="py-2.5 pr-4 text-slate-600">{a.course_title}</td>
                        <td className="py-2.5 pr-4 text-right font-mono font-semibold tabular-nums">
                          {a.score}%
                        </td>
                        <td className="py-2.5">
                          <span
                            className={cn(
                              'font-semibold',
                              a.passed ? 'text-[#059669]' : 'text-amber-700',
                            )}
                          >
                            {a.passed ? 'Mastered' : 'Retry'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Learning Activity History</CardTitle>
            <CardDescription>Completed lessons across your enrolled courses.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.lesson_history.length === 0 ? (
              <p className="text-sm text-slate-500">
                Complete lessons inside any unlocked concept to log activity here.
              </p>
            ) : (
              <div className="space-y-3">
                {data.lesson_history.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-2.5 text-xs border-b border-slate-100 pb-2.5 last:border-0"
                  >
                    <CheckCircle2 className="h-4 w-4 text-[#059669] shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-[#0F172A] truncate">
                        {item.lesson_title}
                      </p>
                      <p className="text-slate-500 truncate">
                        {item.concept_title} · {item.course_title}
                      </p>
                      <p className="text-[11px] text-slate-400 tabular-nums mt-0.5 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDateTime(item.completed_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
