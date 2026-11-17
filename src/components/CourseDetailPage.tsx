import { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  BookOpen,
  CheckCircle2,
  GitBranch,
  History,
  Lock,
  Network,
  Plus,
  Settings,
  Target,
  Unlock,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError } from '../lib/api.ts';
import { cn, formatMinutes, formatShortDate } from '../lib/utils.ts';
import type {
  CourseDetailResponse,
  InstructorCourseAnalytics,
  Profile,
} from '../types/learnpath.ts';
import { ConceptWorkspace } from './ConceptWorkspace.tsx';
import { CourseThumbnail } from './CourseThumbnail.tsx';
import { CurriculumHistoryView } from './CurriculumHistoryView.tsx';
import { InstructorConceptInspector } from './InstructorConceptInspector.tsx';
import {
  AddConceptModal,
  CourseFormModal,
  SplitConceptModal,
} from './InstructorStudioModals.tsx';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas.tsx';
import { LearningPathView } from './LearningPathView.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import { Progress, Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';

interface CourseDetailPageProps {
  courseId: string;
  user: Profile;
  initialConceptId?: string | null;
  initialTab?: 'graph' | 'learn' | 'path' | 'history' | 'analytics';
  onBack: () => void;
}

export function CourseDetailPage({
  courseId,
  user,
  initialConceptId,
  initialTab = 'graph',
  onBack,
}: CourseDetailPageProps) {
  const [detail, setDetail] = useState<CourseDetailResponse | null>(null);
  const [analytics, setAnalytics] = useState<InstructorCourseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(
    initialConceptId ?? null,
  );
  const [learningPathTargetId, setLearningPathTargetId] = useState<string | null>(null);
  const [previewAsLearner, setPreviewAsLearner] = useState(false);

  // Modals
  const [showAddConcept, setShowAddConcept] = useState(false);
  const [showEditCourse, setShowEditCourse] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);

  const isInstructorMode = user.role === 'instructor' && !previewAsLearner;

  const loadCourse = useCallback(async () => {
    setError(null);
    try {
      const data = await api.getCourse(courseId);
      setDetail(data);

      // Select sensible default concept if none selected or selected no longer exists
      const activeConcepts = data.concepts.filter((c) => c.status === 'active');
      setSelectedConceptId((prev) => {
        if (prev && data.concepts.some((c) => c.id === prev)) return prev;
        if (data.enrollment?.last_active_concept_id) {
          const exists = data.concepts.some(
            (c) => c.id === data.enrollment?.last_active_concept_id,
          );
          if (exists) return data.enrollment.last_active_concept_id;
        }
        const firstUnlocked = activeConcepts.find((c) => c.lock_state === 'unlocked');
        return firstUnlocked?.id ?? activeConcepts[0]?.id ?? data.concepts[0]?.id ?? null;
      });

      if (user.role === 'instructor') {
        const stats = await api.getCourseAnalytics(courseId);
        setAnalytics(stats);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to load course.');
    } finally {
      setLoading(false);
    }
  }, [courseId, user.role]);

  useEffect(() => {
    setLoading(true);
    loadCourse();
  }, [loadCourse]);

  useEffect(() => {
    if (initialConceptId) {
      setSelectedConceptId(initialConceptId);
    }
  }, [initialConceptId]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  async function handleEnroll() {
    try {
      const res = await api.enrollCourse(courseId);
      setDetail(res);
      toast.success(`Enrolled in ${res.course.title}!`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Enrollment failed.');
    }
  }

  async function handleSelectConcept(cid: string, switchToLearnTab = false) {
    setSelectedConceptId(cid);
    if (switchToLearnTab) {
      setActiveTab('learn');
    }
    if (detail?.enrollment && user.role === 'learner') {
      api.setActiveConcept(courseId, cid).catch(() => {});
    }
  }

  async function handleAddPrerequisite(prereqId: string, depId: string) {
    const res = await api.addPrerequisite(courseId, prereqId, depId);
    toast.success(
      `Prerequisite edge saved (v${res.versionNumber}, ${res.affectedLearnerCount} learners notified).`,
    );
    await loadCourse();
  }

  async function handleRemovePrerequisite(edgeId: string) {
    const res = await api.removePrerequisite(courseId, edgeId);
    toast.success(`Prerequisite edge removed (v${res.versionNumber}).`);
    await loadCourse();
  }

  async function handleSavePositions(
    positions: Array<{ id: string; pos_x: number; pos_y: number }>,
  ) {
    await api.saveNodePositions(courseId, positions);
    toast.success('Graph layout saved.');
    await loadCourse();
  }

  async function handleReorderMove(conceptId: string, direction: -1 | 1) {
    if (!detail) return;
    const active = detail.concepts.filter((c) => c.status === 'active');
    const idx = active.findIndex((c) => c.id === conceptId);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= active.length) return;

    const reordered = [...active];
    const [item] = reordered.splice(idx, 1);
    reordered.splice(swapIdx, 0, item);

    try {
      const res = await api.reorderConcepts(
        courseId,
        reordered.map((c) => c.id),
      );
      toast.success(`Curriculum order updated (v${res.versionNumber}).`);
      await loadCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to reorder.');
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-44 animate-pulse rounded-xl bg-white border border-slate-200" />
        <div className="h-96 animate-pulse rounded-xl bg-white border border-slate-200" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <p className="text-sm font-medium text-red-600">{error || 'Course not found.'}</p>
          <Button variant="outline" onClick={onBack}>
            Back to Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { course, concepts, prerequisites, enrollment, versions, change_logs } = detail;
  const selectedConcept = concepts.find((c) => c.id === selectedConceptId) ?? concepts[0] ?? null;
  const activeConcepts = concepts.filter((c) => c.status === 'active');

  return (
    <div className="space-y-6">
      {/* Top Course Banner */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
          <div className="lg:col-span-4 h-48 lg:h-auto relative">
            <CourseThumbnail src={course.thumbnail_url} alt={course.title} />
          </div>
          <div className="lg:col-span-8 p-6 flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0F172A] cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back</span>
                </button>

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                  <span>{course.category}</span>
                  <span aria-hidden="true">·</span>
                  <span className="capitalize">{course.difficulty}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatMinutes(course.estimated_duration_minutes)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono font-semibold text-[#2563EB]">
                    v{course.current_version}
                  </span>
                </div>
              </div>

              <h1 className="font-display text-2xl font-bold text-[#0F172A]">{course.title}</h1>
              <p className="text-sm text-slate-600 leading-relaxed">{course.description}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-4">
              {user.role === 'learner' ? (
                enrollment ? (
                  <div className="flex-1 min-w-[220px] max-w-sm space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-medium tabular-nums">
                      <span className="text-slate-600">
                        Mastery Progress ({course.mastered_count}/{course.concept_count} concepts)
                      </span>
                      <span className="font-mono font-bold text-[#2563EB]">
                        {course.completion_percentage}%
                      </span>
                    </div>
                    <Progress value={course.completion_percentage} />
                  </div>
                ) : (
                  <Button onClick={handleEnroll}>Enroll in {course.title}</Button>
                )
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
                  <span className="font-semibold text-[#0F172A] capitalize">
                    Status: {course.status}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{course.concept_count} active concepts</span>
                  <span aria-hidden="true">·</span>
                  <span>{course.enrolled_count} enrolled learners</span>
                </div>
              )}

              {user.role === 'instructor' && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={previewAsLearner ? 'violet' : 'outline'}
                    onClick={() => setPreviewAsLearner((p) => !p)}
                  >
                    {previewAsLearner ? 'Exit Learner Preview' : 'Preview as Learner'}
                  </Button>
                  {course.status !== 'published' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await api.updateCourseStatus(course.id, 'published');
                        toast.success('Course published for learner enrollment.');
                        await loadCourse();
                      }}
                    >
                      Publish Course
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowEditCourse(true)}
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Settings</span>
                  </Button>
                  <Button size="sm" onClick={() => setShowAddConcept(true)}>
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Concept</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Main Workspace Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="graph">
            <Network className="h-3.5 w-3.5" />
            <span>{isInstructorMode ? 'Prerequisite Graph Editor' : 'Knowledge Graph'}</span>
          </TabsTrigger>
          <TabsTrigger value="learn">
            <BookOpen className="h-3.5 w-3.5" />
            <span>Concept Lessons & Quiz</span>
          </TabsTrigger>
          <TabsTrigger value="path">
            <Target className="h-3.5 w-3.5" />
            <span>Personalized Learning Path</span>
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-3.5 w-3.5" />
            <span>Curriculum History ({versions.length})</span>
          </TabsTrigger>
          {user.role === 'instructor' && (
            <TabsTrigger value="analytics">
              <BarChart3 className="h-3.5 w-3.5" />
              <span>Analytics</span>
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAB 1: Interactive Knowledge Graph */}
        <TabsContent value="graph" className="space-y-4">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="xl:col-span-8">
              <KnowledgeGraphCanvas
                concepts={concepts}
                prerequisites={prerequisites}
                selectedConceptId={selectedConcept?.id ?? null}
                activeConceptId={enrollment?.last_active_concept_id}
                editable={isInstructorMode}
                onSelectConcept={(cid) => handleSelectConcept(cid, false)}
                onAddPrerequisite={handleAddPrerequisite}
                onRemovePrerequisite={handleRemovePrerequisite}
                onSavePositions={handleSavePositions}
              />
              {isInstructorMode && (
                <p className="mt-2 text-xs text-slate-500">
                  Tip: Drag nodes to arrange layout. Drag from a node’s right handle to another
                  node’s left handle to add a prerequisite edge (cycles are automatically blocked).
                  Click any edge to remove it.
                </p>
              )}
            </div>

            <div className="xl:col-span-4">
              {selectedConcept ? (
                isInstructorMode ? (
                  <InstructorConceptInspector
                    courseId={courseId}
                    concept={selectedConcept}
                    allConcepts={concepts}
                    prerequisites={prerequisites}
                    onRefreshCourse={loadCourse}
                    onOpenSplitModal={() => setShowSplitModal(true)}
                  />
                ) : (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between text-xs">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 font-semibold',
                            selectedConcept.lock_state === 'mastered'
                              ? 'text-[#059669]'
                              : selectedConcept.lock_state === 'locked'
                                ? 'text-amber-700'
                                : selectedConcept.lock_state === 'retired'
                                  ? 'text-[#7C3AED]'
                                  : 'text-[#2563EB]',
                          )}
                        >
                          {selectedConcept.lock_state === 'mastered' && (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Mastered
                            </>
                          )}
                          {selectedConcept.lock_state === 'unlocked' && (
                            <>
                              <Unlock className="h-3.5 w-3.5" />
                              Unlocked
                            </>
                          )}
                          {selectedConcept.lock_state === 'locked' && (
                            <>
                              <Lock className="h-3.5 w-3.5" />
                              Locked
                            </>
                          )}
                          {selectedConcept.lock_state === 'retired' && (
                            <>
                              <GitBranch className="h-3.5 w-3.5" />
                              Split / Retired
                            </>
                          )}
                        </span>
                        <span className="font-mono tabular-nums text-slate-500">
                          {formatMinutes(selectedConcept.estimated_minutes)}
                        </span>
                      </div>
                      <CardTitle>{selectedConcept.title}</CardTitle>
                      <CardDescription>{selectedConcept.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {selectedConcept.lock_reason && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                          {selectedConcept.lock_reason}
                        </div>
                      )}

                      <div className="space-y-1.5 text-xs text-slate-600 tabular-nums">
                        <p>
                          <strong>Lessons:</strong> {selectedConcept.completed_lessons_count} /{' '}
                          {selectedConcept.total_lessons_count} completed
                        </p>
                        <p>
                          <strong>Quiz Threshold:</strong> {selectedConcept.passing_score}%
                          {selectedConcept.best_score !== null &&
                            ` · Best Score: ${selectedConcept.best_score}%`}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2">
                        <Button
                          onClick={() => handleSelectConcept(selectedConcept.id, true)}
                        >
                          {selectedConcept.lock_state === 'locked'
                            ? 'Inspect Lock Requirements'
                            : 'Open Lessons & Mastery Quiz'}
                        </Button>
                        {selectedConcept.status === 'active' && (
                          <Button
                            variant="outline"
                            onClick={() => {
                              setLearningPathTargetId(selectedConcept.id);
                              setActiveTab('path');
                            }}
                          >
                            <Target className="h-4 w-4" />
                            <span>Set as Learning Path Target</span>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              ) : (
                <Card>
                  <CardContent className="pt-6 text-sm text-slate-500">
                    Click any concept node on the graph to inspect or edit it.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: Concept Lessons & Quiz */}
        <TabsContent value="learn">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="lg:col-span-4 space-y-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Course Concepts ({activeConcepts.length})</CardTitle>
                  <CardDescription>
                    Master prerequisites in order to unlock downstream topics.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {concepts.map((c, idx) => {
                    const isSelected = c.id === selectedConcept?.id;
                    const activeIdx = activeConcepts.findIndex((ac) => ac.id === c.id);
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors',
                          isSelected
                            ? 'border-[#2563EB] bg-[#EFF4FF]'
                            : 'border-slate-200 bg-white hover:bg-slate-50',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectConcept(c.id, false)}
                          className="flex-1 text-left min-w-0 cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            {c.lock_state === 'mastered' && (
                              <CheckCircle2 className="h-3.5 w-3.5 text-[#059669] shrink-0" />
                            )}
                            {c.lock_state === 'unlocked' && (
                              <Unlock className="h-3.5 w-3.5 text-[#2563EB] shrink-0" />
                            )}
                            {c.lock_state === 'locked' && (
                              <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            )}
                            {c.lock_state === 'retired' && (
                              <GitBranch className="h-3.5 w-3.5 text-[#7C3AED] shrink-0" />
                            )}
                            <span className="truncate text-xs font-semibold text-[#0F172A]">
                              {c.title}
                            </span>
                          </div>
                          <div className="mt-0.5 pl-5.5 text-[11px] text-slate-500 tabular-nums">
                            {c.status !== 'active'
                              ? 'Retired (History Kept)'
                              : c.lock_state === 'mastered'
                                ? `Mastered (${c.best_score ?? 100}%)`
                                : c.lock_state === 'locked'
                                  ? `Locked · ${c.missing_prerequisites.length} missing`
                                  : `Unlocked · ${formatMinutes(c.estimated_minutes)}`}
                          </div>
                        </button>

                        {isInstructorMode && c.status === 'active' && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              aria-label="Move up"
                              disabled={activeIdx <= 0}
                              onClick={() => handleReorderMove(c.id, -1)}
                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Move down"
                              disabled={activeIdx >= activeConcepts.length - 1}
                              onClick={() => handleReorderMove(c.id, 1)}
                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-8">
              {selectedConcept ? (
                <ConceptWorkspace
                  courseId={courseId}
                  concept={selectedConcept}
                  isEnrolled={Boolean(enrollment)}
                  isInstructor={isInstructorMode}
                  onEnroll={handleEnroll}
                  onRefreshCourse={loadCourse}
                  onJumpToConcept={(cid) => handleSelectConcept(cid, true)}
                  onTargetForLearningPath={(cid) => {
                    setLearningPathTargetId(cid);
                    setActiveTab('path');
                  }}
                />
              ) : (
                <Card>
                  <CardContent className="pt-6 text-sm text-slate-500">
                    Select a concept on the left to view lessons and quizzes.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: Personalized Learning Path */}
        <TabsContent value="path">
          <LearningPathView
            courseId={courseId}
            concepts={concepts}
            initialTargetConceptId={learningPathTargetId ?? selectedConcept?.id}
            onOpenConcept={(cid) => handleSelectConcept(cid, true)}
          />
        </TabsContent>

        {/* TAB 4: Curriculum Version & Change History */}
        <TabsContent value="history">
          <CurriculumHistoryView
            courseTitle={course.title}
            currentVersion={course.current_version}
            versions={versions}
            changeLogs={change_logs}
          />
        </TabsContent>

        {/* TAB 5: Instructor Analytics */}
        {user.role === 'instructor' && analytics && (
          <TabsContent value="analytics" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-slate-500">Enrolled Learners</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-[#0F172A] mt-1">
                    {analytics.enrolled_learners}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-slate-500">Avg Course Completion</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-[#2563EB] mt-1">
                    {analytics.average_completion_percentage}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-slate-500">Average Quiz Score</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-[#7C3AED] mt-1">
                    {analytics.average_quiz_score}%
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5">
                  <p className="text-xs text-slate-500">Overall Pass Rate</p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-[#059669] mt-1">
                    {analytics.pass_rate}%
                  </p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Concept Mastery & Quiz Performance</CardTitle>
                <CardDescription>
                  Tracks learner mastery across active and split/retired historical concepts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2 pr-4 font-semibold">Concept</th>
                        <th className="py-2 pr-4 font-semibold">Status</th>
                        <th className="py-2 pr-4 font-semibold text-right">Mastered Learners</th>
                        <th className="py-2 pr-4 font-semibold text-right">Attempts</th>
                        <th className="py-2 pr-4 font-semibold text-right">Avg Score</th>
                        <th className="py-2 font-semibold text-right">Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {analytics.concept_stats.map((cs) => (
                        <tr key={cs.concept_id}>
                          <td className="py-2.5 pr-4 font-semibold text-[#0F172A]">{cs.title}</td>
                          <td className="py-2.5 pr-4 capitalize text-slate-600">{cs.status}</td>
                          <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                            {cs.mastered_learners}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                            {cs.attempt_count}
                          </td>
                          <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                            {cs.average_score}%
                          </td>
                          <td className="py-2.5 text-right font-mono tabular-nums text-[#059669]">
                            {cs.pass_rate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Enrolled Learner Progress</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.learner_progress_rows.length === 0 ? (
                  <p className="text-sm text-slate-500">No learners enrolled yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500">
                          <th className="py-2 pr-4 font-semibold">Learner</th>
                          <th className="py-2 pr-4 font-semibold">Enrolled</th>
                          <th className="py-2 pr-4 font-semibold">Active Concept</th>
                          <th className="py-2 pr-4 font-semibold text-right">Mastered</th>
                          <th className="py-2 pr-4 font-semibold text-right">Avg Score</th>
                          <th className="py-2 font-semibold text-right">Completion</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {analytics.learner_progress_rows.map((lr) => (
                          <tr key={lr.learner_id}>
                            <td className="py-2.5 pr-4">
                              <p className="font-semibold text-[#0F172A]">{lr.full_name}</p>
                              <p className="text-slate-500">{lr.email}</p>
                            </td>
                            <td className="py-2.5 pr-4 text-slate-500 tabular-nums">
                              {formatShortDate(lr.enrolled_at)}
                            </td>
                            <td className="py-2.5 pr-4 text-slate-700">
                              {lr.last_active_concept_title ?? '—'}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                              {lr.mastered_count}/{lr.total_active_concepts}
                            </td>
                            <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                              {lr.average_score !== null ? `${lr.average_score}%` : '—'}
                            </td>
                            <td className="py-2.5 text-right font-mono font-semibold text-[#2563EB] tabular-nums">
                              {lr.completion_percentage}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Modals */}
      <CourseFormModal
        open={showEditCourse}
        onOpenChange={setShowEditCourse}
        existingCourse={course}
        onSaved={async () => {
          await loadCourse();
        }}
      />

      <AddConceptModal
        open={showAddConcept}
        onOpenChange={setShowAddConcept}
        courseId={course.id}
        defaultPassingScore={course.default_passing_score}
        onCreated={loadCourse}
      />

      <SplitConceptModal
        open={showSplitModal}
        onOpenChange={setShowSplitModal}
        concept={selectedConcept}
        onSplitComplete={async (childIds) => {
          if (childIds.length > 0) setSelectedConceptId(childIds[0]);
          await loadCourse();
        }}
      />
    </div>
  );
}
