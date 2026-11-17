import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  BarChart3,
  Globe,
  Network,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api.ts';
import { formatMinutes } from '../lib/utils.ts';
import type {
  CourseSummary,
  InstructorCourseAnalytics,
  Profile,
} from '../types/learnpath.ts';
import { CourseThumbnail } from './CourseThumbnail.tsx';
import { CourseFormModal } from './InstructorStudioModals.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';

interface InstructorDashboardProps {
  user: Profile;
  onOpenCourse: (
    courseId: string,
    conceptId?: string | null,
    tab?: 'graph' | 'learn' | 'path' | 'history' | 'analytics',
  ) => void;
}

export function InstructorDashboard({ user, onOpenCourse }: InstructorDashboardProps) {
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [analyticsMap, setAnalyticsMap] = useState<Record<string, InstructorCourseAnalytics>>({});
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const { courses: list } = await api.listCourses();
      setCourses(list);

      const analyticsEntries = await Promise.all(
        list.map(async (c) => {
          try {
            const st = await api.getCourseAnalytics(c.id);
            return [c.id, st] as const;
          } catch {
            return null;
          }
        }),
      );
      const map: Record<string, InstructorCourseAnalytics> = {};
      for (const entry of analyticsEntries) {
        if (entry) map[entry[0]] = entry[1];
      }
      setAnalyticsMap(map);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to load instructor courses.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const totalLearners = courses.reduce((s, c) => s + c.enrolled_count, 0);
  const totalConcepts = courses.reduce((s, c) => s + c.concept_count, 0);
  const publishedCount = courses.filter((c) => c.status === 'published').length;

  const avgCompletionAcrossCourses = (() => {
    const vals = Object.values(analyticsMap).filter((a) => a.enrolled_learners > 0);
    if (vals.length === 0) return 0;
    return Math.round(
      vals.reduce((s, a) => s + a.average_completion_percentage, 0) / vals.length,
    );
  })();

  async function handleStatusChange(courseId: string, status: 'published' | 'archived' | 'draft') {
    try {
      await api.updateCourseStatus(courseId, status);
      toast.success(`Course status updated to ${status}.`);
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update status.');
    }
  }

  async function handleDeleteCourse(courseId: string, title: string) {
    try {
      const res = await api.deleteCourse(courseId);
      toast.success(
        res.archived
          ? `"${title}" has enrolled learners and was archived to preserve history.`
          : `"${title}" deleted.`,
      );
      await loadData();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete course.');
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-white border border-slate-200" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-white border border-slate-200" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[#7C3AED]">Instructor Curriculum Studio</p>
          <h1 className="font-display text-2xl font-bold text-[#0F172A]">
            Welcome, {user.full_name}
          </h1>
          <p className="text-sm text-slate-600">
            Design DAG prerequisite graphs, manage quizzes, split concepts cleanly, and monitor
            learner mastery.
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4" />
          <span>New Course</span>
        </Button>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Total Courses</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#0F172A] mt-1">
              {courses.length}{' '}
              <span className="text-xs font-sans font-normal text-slate-500">
                ({publishedCount} published)
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Total Enrolled Learners</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#2563EB] mt-1">
              {totalLearners}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Active Graph Concepts</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#7C3AED] mt-1">
              {totalConcepts}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">Avg Cohort Completion</p>
            <p className="font-mono text-2xl font-bold tabular-nums text-[#059669] mt-1">
              {avgCompletionAcrossCourses}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Course Completion Analytics Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#2563EB]" />
            <span>Course Completion & Quiz Performance</span>
          </CardTitle>
          <CardDescription>
            Live mastery completion rate and average quiz scores across your active courses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {courses.length === 0 ? (
            <p className="text-sm text-slate-500">Create a course to view analytics.</p>
          ) : (
            courses.map((c) => {
              const st = analyticsMap[c.id];
              const completion = st?.average_completion_percentage ?? 0;
              const avgScore = st?.average_quiz_score ?? 0;
              return (
                <div key={c.id} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-[#0F172A]">{c.title}</span>
                    <div className="flex items-center gap-4 text-slate-500 tabular-nums">
                      <span>{c.enrolled_count} enrolled</span>
                      <span>Avg quiz {avgScore}%</span>
                      <span className="font-mono font-bold text-[#2563EB]">{completion}%</span>
                    </div>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#2563EB] to-[#7C3AED] transition-all duration-300"
                      style={{ width: `${Math.max(completion, c.enrolled_count > 0 ? 4 : 0)}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Courses Grid */}
      <section className="space-y-4">
        <h2 className="font-display text-lg font-bold text-[#0F172A]">Manage Courses</h2>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id} className="overflow-hidden flex flex-col">
              <div className="h-40 w-full">
                <CourseThumbnail src={course.thumbnail_url} alt={course.title} />
              </div>
              <CardContent className="pt-5 flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500 tabular-nums">
                    <span>
                      {course.category} · <span className="capitalize">{course.status}</span>
                    </span>
                    <span className="font-mono font-semibold text-[#2563EB]">
                      v{course.current_version}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-[#0F172A]">
                    {course.title}
                  </h3>
                  <p className="text-xs text-slate-600 line-clamp-2">{course.description}</p>
                  <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums pt-1">
                    <span>{course.concept_count} concepts</span>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      {course.enrolled_count}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatMinutes(course.estimated_duration_minutes)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      onClick={() => onOpenCourse(course.id, null, 'graph')}
                    >
                      <Network className="h-3.5 w-3.5" />
                      <span>Graph Editor</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onOpenCourse(course.id, null, 'analytics')}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      <span>Analytics</span>
                    </Button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                    {course.status !== 'published' ? (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(course.id, 'published')}
                        className="inline-flex items-center gap-1 font-medium text-[#059669] hover:underline cursor-pointer"
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Publish</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(course.id, 'archived')}
                        className="inline-flex items-center gap-1 font-medium text-slate-500 hover:underline cursor-pointer"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        <span>Archive</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleDeleteCourse(course.id, course.title)}
                      className="inline-flex items-center gap-1 font-medium text-red-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <CourseFormModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onSaved={async (courseId) => {
          await loadData();
          onOpenCourse(courseId, null, 'graph');
        }}
      />
    </div>
  );
}
