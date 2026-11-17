import { useEffect, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Lock,
  Play,
  RefreshCw,
  Target,
  Video,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, type QuizSubmitResponse } from '../lib/api.ts';
import { cn, formatDateTime, formatMinutes } from '../lib/utils.ts';
import type { ConceptWithProgress, QuizOptionKey } from '../types/learnpath.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';

interface ConceptWorkspaceProps {
  courseId: string;
  concept: ConceptWithProgress;
  isEnrolled: boolean;
  isInstructor?: boolean;
  onEnroll: () => Promise<void>;
  onRefreshCourse: () => Promise<void>;
  onJumpToConcept: (conceptId: string) => void;
  onTargetForLearningPath: (conceptId: string) => void;
}

export function ConceptWorkspace({
  courseId,
  concept,
  isEnrolled,
  isInstructor = false,
  onEnroll,
  onRefreshCourse,
  onJumpToConcept,
  onTargetForLearningPath,
}: ConceptWorkspaceProps) {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, QuizOptionKey>>({});
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizResult, setQuizResult] = useState<QuizSubmitResponse | null>(null);
  const [togglingLessonId, setTogglingLessonId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedAnswers({});
    setQuizResult(null);
  }, [concept.id]);

  const isLocked = !isInstructor && concept.lock_state === 'locked';
  const isRetired = concept.lock_state === 'retired';

  async function handleToggleLesson(lessonId: string) {
    setTogglingLessonId(lessonId);
    try {
      const res = await api.toggleLessonComplete(lessonId);
      toast.success(
        res.completed
          ? 'Lesson marked complete. Pass the concept quiz to unlock dependent concepts.'
          : 'Lesson marked incomplete.',
      );
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update lesson.');
    } finally {
      setTogglingLessonId(null);
    }
  }

  async function handleSubmitQuiz(e: React.FormEvent) {
    e.preventDefault();
    if (!concept.quiz) return;
    if (Object.keys(selectedAnswers).length < concept.quiz.questions.length) {
      toast.error('Please answer all questions before submitting.');
      return;
    }

    setSubmittingQuiz(true);
    try {
      const res = await api.submitQuiz(concept.id, selectedAnswers);
      setQuizResult(res);
      if (res.passed) {
        toast.success(res.recommendation);
      } else {
        toast.warning(res.recommendation);
      }
      await onRefreshCourse();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to submit quiz.');
    } finally {
      setSubmittingQuiz(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Concept Summary Header */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                <span className="capitalize font-medium text-[#2563EB]">
                  {concept.difficulty}
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatMinutes(concept.estimated_minutes)}</span>
                <span aria-hidden="true">·</span>
                <span>Passing threshold {concept.passing_score}%</span>
                {concept.mastered && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-[#059669]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Mastered ({concept.best_score}%)
                    </span>
                  </>
                )}
              </div>

              <h2 className="font-display text-2xl font-bold text-[#0F172A]">
                {concept.title}
              </h2>
              <p className="text-sm leading-relaxed text-slate-600">{concept.description}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isInstructor && !isEnrolled && (
                <Button onClick={onEnroll}>Enroll to Start Learning</Button>
              )}
              {!isRetired && isEnrolled && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onTargetForLearningPath(concept.id)}
                >
                  <Target className="h-3.5 w-3.5" />
                  <span>Generate Learning Path Here</span>
                </Button>
              )}
            </div>
          </div>

          {concept.learning_objectives.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-[#1E293B] mb-2">Learning Objectives</p>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {concept.learning_objectives.map((obj, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-xs text-slate-600">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[#2563EB] shrink-0" />
                    <span>{obj}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Retired / Split Concept Notice */}
      {isRetired && (
        <Card className="border-violet-200 bg-violet-50/40">
          <CardContent className="pt-5 space-y-3">
            <div className="flex items-start gap-3">
              <GitBranch className="h-5 w-5 text-[#7C3AED] shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  {concept.status === 'split'
                    ? 'Concept Split Into Granular Topics'
                    : 'Concept Retired'}
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  {concept.lock_reason} Your past quiz attempts and lesson completions remain
                  intact below for auditability.
                </p>
                {concept.split_into_concept_ids.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {concept.split_into_concept_ids.map((cid) => (
                      <Button
                        key={cid}
                        size="sm"
                        variant="outline"
                        onClick={() => onJumpToConcept(cid)}
                      >
                        Open Child Concept
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Locked Concept Gate */}
      {isLocked && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="pt-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100 text-amber-800 shrink-0">
                <Lock className="h-5 w-5" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-base font-semibold text-[#0F172A]">
                  {concept.lock_reason}
                </h3>
                <p className="text-xs text-slate-600">
                  Completing lessons alone does not unlock dependent topics. You must pass each
                  missing prerequisite quiz above its configured passing threshold.
                </p>
              </div>
            </div>

            <div className="space-y-2 border-t border-amber-200/70 pt-4">
              <p className="text-xs font-semibold text-amber-900">
                Missing Prerequisites ({concept.missing_prerequisites.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {concept.missing_prerequisites.map((mp) => (
                  <Button
                    key={mp.id}
                    variant="outline"
                    size="sm"
                    onClick={() => onJumpToConcept(mp.id)}
                  >
                    <Play className="h-3.5 w-3.5 text-[#2563EB]" />
                    <span>Go to {mp.title}</span>
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="violet"
                  onClick={() => onTargetForLearningPath(concept.id)}
                >
                  <Target className="h-3.5 w-3.5" />
                  <span>Show Personalized Path to {concept.title}</span>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lessons Section (Hidden when strictly locked for learners) */}
      {!isLocked && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-semibold text-[#0F172A]">
              Lessons & Study Materials
            </h3>
            <span className="text-xs text-slate-500 tabular-nums">
              {concept.completed_lessons_count} / {concept.total_lessons_count} completed
            </span>
          </div>

          {concept.lessons.length === 0 ? (
            <Card>
              <CardContent className="pt-5 text-sm text-slate-500">
                No lessons attached to this concept yet.
              </CardContent>
            </Card>
          ) : (
            concept.lessons.map((lesson, idx) => (
              <Card key={lesson.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <BookOpen className="h-3.5 w-3.5 text-[#2563EB]" />
                        <span>Lesson {idx + 1}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatMinutes(lesson.duration_minutes)}</span>
                        {lesson.completed && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[#059669]">Completed</span>
                          </>
                        )}
                      </div>
                      <CardTitle>{lesson.title}</CardTitle>
                    </div>

                    {!isInstructor && isEnrolled && !isRetired && (
                      <Button
                        size="sm"
                        variant={lesson.completed ? 'outline' : 'secondary'}
                        disabled={togglingLessonId === lesson.id}
                        onClick={() => handleToggleLesson(lesson.id)}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>
                          {lesson.completed ? 'Completed' : 'Mark Lesson Completed'}
                        </span>
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="whitespace-pre-wrap rounded-lg bg-[#F8FAFC] border border-slate-100 p-4 text-sm leading-relaxed text-slate-700 font-sans">
                    {lesson.content}
                  </div>
                  {lesson.video_url && (
                    <a
                      href={lesson.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-xs font-semibold text-[#2563EB] hover:underline"
                    >
                      <Video className="h-4 w-4" />
                      <span>Watch Reference Video Lesson</span>
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Mastery Quiz Section */}
      {!isLocked && !isRetired && concept.quiz && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{concept.quiz.title}</CardTitle>
                <CardDescription className="tabular-nums">
                  Pass with {concept.quiz.passing_score}% or higher to earn mastery and unlock
                  dependent concepts.
                </CardDescription>
              </div>
              {concept.best_score !== null && (
                <span className="text-xs font-semibold tabular-nums text-slate-600">
                  Best Score: {concept.best_score}%
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isInstructor && !isEnrolled ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 flex items-center justify-between gap-4">
                <p className="text-sm text-slate-600">
                  Enroll in this course to take the mastery quiz and track progress.
                </p>
                <Button size="sm" onClick={onEnroll}>
                  Enroll Now
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmitQuiz} className="space-y-5">
                {concept.quiz.questions.map((q, qIdx) => {
                  const feedback = quizResult?.question_feedback.find(
                    (f) => f.question_id === q.id,
                  );
                  const options: Array<{ key: QuizOptionKey; text: string }> = [
                    { key: 'A', text: q.option_a },
                    { key: 'B', text: q.option_b },
                    { key: 'C', text: q.option_c },
                    { key: 'D', text: q.option_d },
                  ];

                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-slate-200 bg-[#FAFCFF] p-4 space-y-3"
                    >
                      <p className="text-sm font-semibold text-[#0F172A]">
                        {qIdx + 1}. {q.question_text}
                      </p>

                      <div className="grid grid-cols-1 gap-2">
                        {options.map((opt) => {
                          const isSelected = selectedAnswers[q.id] === opt.key;
                          const isCorrectOption =
                            feedback && feedback.correct_option === opt.key;
                          const isWrongSelected =
                            feedback && isSelected && !feedback.is_correct;

                          return (
                            <label
                              key={opt.key}
                              className={cn(
                                'flex items-start gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors',
                                isCorrectOption
                                  ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                                  : isWrongSelected
                                    ? 'border-red-300 bg-red-50 text-red-950'
                                    : isSelected
                                      ? 'border-[#2563EB] bg-[#EFF4FF] text-[#0F172A]'
                                      : 'border-slate-200 bg-white hover:bg-slate-50',
                              )}
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                value={opt.key}
                                checked={isSelected}
                                disabled={Boolean(quizResult) || isInstructor}
                                onChange={() =>
                                  setSelectedAnswers((prev) => ({ ...prev, [q.id]: opt.key }))
                                }
                                className="mt-0.5 accent-[#2563EB]"
                              />
                              <span className="font-mono text-xs font-semibold text-slate-500 mt-0.5">
                                {opt.key}.
                              </span>
                              <span className="flex-1">{opt.text}</span>
                            </label>
                          );
                        })}
                      </div>

                      {feedback && (
                        <div
                          className={cn(
                            'rounded-lg px-3 py-2 text-xs',
                            feedback.is_correct
                              ? 'bg-emerald-50 text-emerald-800'
                              : 'bg-amber-50 text-amber-900',
                          )}
                        >
                          <span className="font-semibold">
                            {feedback.is_correct ? 'Correct: ' : `Correct Answer ${feedback.correct_option}: `}
                          </span>
                          {feedback.explanation}
                        </div>
                      )}
                    </div>
                  );
                })}

                {!isInstructor && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {!quizResult ? (
                      <Button type="submit" disabled={submittingQuiz}>
                        {submittingQuiz ? 'Evaluating Quiz...' : 'Submit Mastery Quiz'}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setQuizResult(null);
                          setSelectedAnswers({});
                        }}
                      >
                        <RefreshCw className="h-4 w-4" />
                        <span>Retry Quiz</span>
                      </Button>
                    )}
                  </div>
                )}
              </form>
            )}

            {quizResult && (
              <div
                className={cn(
                  'rounded-xl border p-4 space-y-2',
                  quizResult.passed
                    ? 'border-emerald-200 bg-emerald-50'
                    : 'border-amber-200 bg-amber-50',
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-display text-base font-bold">
                    {quizResult.passed ? (
                      <CheckCircle2 className="h-5 w-5 text-[#059669]" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-amber-700" />
                    )}
                    <span className="tabular-nums">
                      Score: {quizResult.score}% ({quizResult.correct_count}/
                      {quizResult.total_count}) —{' '}
                      {quizResult.passed ? 'Mastery Passed' : 'Review Recommended'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-700">{quizResult.recommendation}</p>
                {quizResult.newly_unlocked_concepts.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {quizResult.newly_unlocked_concepts.map((uc) => (
                      <Button
                        key={uc.id}
                        size="sm"
                        variant="outline"
                        onClick={() => onJumpToConcept(uc.id)}
                      >
                        Open {uc.title}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Historical Quiz Attempts (Always preserved!) */}
      {concept.attempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Attempt History ({concept.attempts.length})</CardTitle>
            <CardDescription>
              Historical quiz records are permanently preserved across curriculum updates.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Date</th>
                    <th className="py-2 pr-4 font-semibold text-right">Score</th>
                    <th className="py-2 pr-4 font-semibold text-right">Correct</th>
                    <th className="py-2 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {concept.attempts.map((a) => (
                    <tr key={a.id}>
                      <td className="py-2.5 pr-4 text-slate-600 tabular-nums">
                        {formatDateTime(a.attempted_at)}
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono font-semibold tabular-nums">
                        {a.score}%
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-slate-600">
                        {a.correct_count}/{a.total_count}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            'font-semibold',
                            a.passed ? 'text-[#059669]' : 'text-amber-700',
                          )}
                        >
                          {a.passed ? 'Passed' : 'Needs Review'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
