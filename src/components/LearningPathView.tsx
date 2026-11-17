import { useEffect, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  PlayCircle,
  Target,
  Unlock,
} from 'lucide-react';
import { api, ApiError } from '../lib/api.ts';
import { cn, formatMinutes } from '../lib/utils.ts';
import type { ConceptWithProgress, PersonalizedLearningPath } from '../types/learnpath.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import { Label, SelectNative } from './ui/input.tsx';
import { Progress } from './ui/tabs.tsx';

interface LearningPathViewProps {
  courseId: string;
  concepts: ConceptWithProgress[];
  initialTargetConceptId?: string | null;
  onOpenConcept: (conceptId: string) => void;
}

export function LearningPathView({
  courseId,
  concepts,
  initialTargetConceptId,
  onOpenConcept,
}: LearningPathViewProps) {
  const activeConcepts = concepts.filter((c) => c.status === 'active');
  const defaultTarget =
    initialTargetConceptId && activeConcepts.some((c) => c.id === initialTargetConceptId)
      ? initialTargetConceptId
      : activeConcepts[activeConcepts.length - 1]?.id ?? '';

  const [targetId, setTargetId] = useState(defaultTarget);
  const [pathData, setPathData] = useState<PersonalizedLearningPath | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialTargetConceptId && activeConcepts.some((c) => c.id === initialTargetConceptId)) {
      setTargetId(initialTargetConceptId);
    }
  }, [initialTargetConceptId]);

  useEffect(() => {
    if (!targetId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getLearningPath(courseId, targetId)
      .then((res) => {
        if (!cancelled) setPathData(res);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Unable to generate learning path.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [courseId, targetId, concepts]);

  if (activeConcepts.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-slate-500">
          No active concepts exist in this course yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <CardTitle>Personalized Learning Path Generator</CardTitle>
              <CardDescription>
                Select any target concept to compute the exact topological prerequisite sequence,
                automatically skipping concepts you have already mastered.
              </CardDescription>
            </div>

            <div className="w-full sm:w-72">
              <Label htmlFor="target-concept-select">Target Concept</Label>
              <SelectNative
                id="target-concept-select"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              >
                {activeConcepts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </SelectNative>
            </div>
          </div>
        </CardHeader>

        {loading && (
          <CardContent>
            <div className="h-24 animate-pulse rounded-lg bg-slate-100" />
          </CardContent>
        )}

        {error && (
          <CardContent>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
              {error}
            </div>
          </CardContent>
        )}

        {!loading && pathData && (
          <CardContent className="space-y-6">
            {/* Summary Strip */}
            <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-[#F8FAFC] p-4 sm:grid-cols-4">
              <div>
                <p className="text-xs text-slate-500">Target Concept</p>
                <p className="font-display text-sm font-semibold text-[#0F172A] mt-0.5">
                  {pathData.target_concept_title}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Remaining Steps</p>
                <p className="font-mono text-lg font-bold tabular-nums text-[#0F172A]">
                  {pathData.ordered_remaining_steps.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Estimated Time Remaining</p>
                <p className="font-mono text-lg font-bold tabular-nums text-[#2563EB]">
                  {formatMinutes(pathData.estimated_remaining_minutes)}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Path Readiness</p>
                <div className="flex items-center gap-2 mt-1">
                  <Progress value={pathData.completion_percentage} className="h-2" />
                  <span className="font-mono text-xs font-semibold tabular-nums">
                    {pathData.completion_percentage}%
                  </span>
                </div>
              </div>
            </div>

            {/* Next Recommended Action */}
            {pathData.next_recommended_concept ? (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-200 bg-[#EFF4FF] p-4">
                <div className="flex items-start gap-3">
                  <Target className="h-5 w-5 text-[#2563EB] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-[#1E3A8A]">
                      Next Recommended Action
                    </p>
                    <p className="font-display text-base font-bold text-[#0F172A]">
                      {pathData.next_recommended_concept.title}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 tabular-nums">
                      {formatMinutes(pathData.next_recommended_concept.estimated_minutes)} ·{' '}
                      Unlocked and ready for quiz mastery
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => onOpenConcept(pathData.next_recommended_concept!.concept_id)}
                >
                  <span>Start Concept</span>
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <CheckCircle2 className="h-5 w-5 text-[#059669] shrink-0" />
                <span>
                  You have already mastered <strong>{pathData.target_concept_title}</strong> and
                  all of its prerequisites.
                </span>
              </div>
            )}

            {/* Ordered Remaining Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                  Ordered Remaining Learning Path ({pathData.ordered_remaining_steps.length})
                </h4>
                <span className="text-xs text-slate-500">
                  Topological order respecting all prerequisites
                </span>
              </div>

              {pathData.ordered_remaining_steps.length === 0 ? (
                <p className="text-sm text-slate-500">No remaining steps required.</p>
              ) : (
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {pathData.ordered_remaining_steps.map((step) => {
                    const isNext = step.status === 'next_recommended';
                    const isUnlocked = step.status === 'unlocked' || isNext;
                    return (
                      <div
                        key={step.concept_id}
                        className={cn(
                          'flex flex-wrap items-center justify-between gap-4 p-4',
                          isNext && 'bg-[#F5F8FF]',
                        )}
                      >
                        <div className="flex items-start gap-3.5 max-w-2xl">
                          <div
                            className={cn(
                              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold tabular-nums',
                              isNext
                                ? 'bg-[#2563EB] text-white'
                                : isUnlocked
                                  ? 'bg-[#EFF4FF] text-[#1E3A8A]'
                                  : 'bg-slate-100 text-slate-500',
                            )}
                          >
                            {step.step_number}
                          </div>
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-display text-sm font-semibold text-[#0F172A]">
                                {step.title}
                              </span>
                              {step.is_target && (
                                <span className="text-[11px] font-semibold text-[#7C3AED]">
                                  · Target Concept
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600">{step.description}</p>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500 tabular-nums">
                              <span className="inline-flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatMinutes(step.estimated_minutes)}
                              </span>
                              {isNext ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-[#2563EB]">
                                  <PlayCircle className="h-3.5 w-3.5" />
                                  Next Recommended
                                </span>
                              ) : isUnlocked ? (
                                <span className="inline-flex items-center gap-1 font-medium text-[#2563EB]">
                                  <Unlock className="h-3 w-3" />
                                  Unlocked
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-amber-700">
                                  <Lock className="h-3 w-3" />
                                  Requires: {step.missing_prerequisite_titles.join(', ')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <Button
                          size="sm"
                          variant={isNext ? 'default' : 'outline'}
                          onClick={() => onOpenConcept(step.concept_id)}
                        >
                          Open Concept
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Already Mastered Prerequisites (Skipped Automatically) */}
            {pathData.completed_prerequisites.length > 0 && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-600">
                  Already Mastered & Automatically Skipped (
                  {pathData.completed_prerequisites.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {pathData.completed_prerequisites.map((step) => (
                    <button
                      key={step.concept_id}
                      type="button"
                      onClick={() => onOpenConcept(step.concept_id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-1.5 text-xs font-medium text-[#059669] hover:bg-emerald-100/70 cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>{step.title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
