import { ArrowRight, Clock, GitBranch, History, Users } from 'lucide-react';
import { formatDateTime } from '../lib/utils.ts';
import type { CurriculumChangeLog, CurriculumVersion } from '../types/learnpath.ts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';

interface CurriculumHistoryViewProps {
  courseTitle: string;
  currentVersion: number;
  versions: CurriculumVersion[];
  changeLogs: CurriculumChangeLog[];
}

const CHANGE_TYPE_LABELS: Record<CurriculumChangeLog['change_type'], string> = {
  concept_added: 'Concept Added',
  concept_updated: 'Concept Updated',
  concept_retired: 'Concept Retired',
  concept_split: 'Concept Split',
  prerequisite_added: 'Prerequisite Added',
  prerequisite_removed: 'Prerequisite Removed',
  curriculum_reordered: 'Curriculum Reordered',
  course_published: 'Initial Publish',
};

export function CurriculumHistoryView({
  courseTitle,
  currentVersion,
  versions,
  changeLogs,
}: CurriculumHistoryViewProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Curriculum Version & Structural History</CardTitle>
              <CardDescription>
                Every structural change to {courseTitle} is versioned transactionally while
                preserving historical learner quiz attempts and lesson completions.
              </CardDescription>
            </div>
            <div className="text-right tabular-nums">
              <p className="text-xs text-slate-500">Current Version</p>
              <p className="font-mono text-lg font-bold text-[#2563EB]">v{currentVersion}</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      {changeLogs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-slate-500">
            No structural curriculum edits recorded yet beyond initial creation.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {changeLogs.map((log) => {
            const prevStruct = log.previous_structure as {
              concepts?: Array<{ id: string; title: string; status: string }>;
              prerequisites?: Array<{ prerequisite_concept_id: string; dependent_concept_id: string }>;
            };
            const newStruct = log.new_structure as {
              concepts?: Array<{ id: string; title: string; status: string }>;
              prerequisites?: Array<{ prerequisite_concept_id: string; dependent_concept_id: string }>;
            };

            const prevActiveCount = (prevStruct.concepts ?? []).filter(
              (c) => c.status === 'active',
            ).length;
            const newActiveCount = (newStruct.concepts ?? []).filter(
              (c) => c.status === 'active',
            ).length;
            const prevEdgeCount = (prevStruct.prerequisites ?? []).length;
            const newEdgeCount = (newStruct.prerequisites ?? []).length;

            return (
              <Card key={log.id}>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span className="font-mono font-bold text-[#2563EB]">
                          v{log.version_number ?? '?'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-semibold text-[#7C3AED]">
                          {CHANGE_TYPE_LABELS[log.change_type] ?? log.change_type}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>By {log.changed_by_name ?? 'Instructor'}</span>
                      </div>
                      <h4 className="font-display text-sm font-semibold text-[#0F172A]">
                        {log.description}
                      </h4>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-slate-500 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-[#2563EB]" />
                        {log.affected_learner_count} learners notified
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Structure comparison */}
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-[#F8FAFC] p-3.5 sm:grid-cols-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-500 mb-1">Previous Structure</p>
                      <p className="text-slate-700 tabular-nums">
                        {prevActiveCount} active concepts · {prevEdgeCount} prerequisite links
                      </p>
                    </div>
                    <div>
                      <p className="font-semibold text-[#1E3A8A] mb-1 flex items-center gap-1">
                        <ArrowRight className="h-3 w-3" />
                        Updated Structure
                      </p>
                      <p className="text-[#0F172A] font-medium tabular-nums">
                        {newActiveCount} active concepts · {newEdgeCount} prerequisite links
                      </p>
                    </div>
                  </div>

                  {log.affected_concept_titles && log.affected_concept_titles.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <GitBranch className="h-3.5 w-3.5 text-[#7C3AED]" />
                      <span className="font-semibold">Affected Concepts:</span>
                      <span>{log.affected_concept_titles.join(', ')}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {versions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-[#2563EB]" />
              <span>Version Snapshots ({versions.length})</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-semibold">Version</th>
                    <th className="py-2 pr-4 font-semibold">Summary</th>
                    <th className="py-2 pr-4 font-semibold">Author</th>
                    <th className="py-2 font-semibold">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {versions.map((v) => (
                    <tr key={v.id}>
                      <td className="py-2.5 pr-4 font-mono font-semibold text-[#2563EB] tabular-nums">
                        v{v.version_number}
                      </td>
                      <td className="py-2.5 pr-4 text-slate-700">{v.summary}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{v.created_by_name}</td>
                      <td className="py-2.5 text-slate-500 tabular-nums">
                        {formatDateTime(v.created_at)}
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
