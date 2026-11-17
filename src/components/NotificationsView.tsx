import { ArrowRight, Bell, Check, CheckCheck, GitBranch } from 'lucide-react';
import { formatDateTime } from '../lib/utils.ts';
import type { LearnerNotification } from '../types/learnpath.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';

interface NotificationsViewProps {
  notifications: LearnerNotification[];
  onMarkRead: (id: string) => Promise<void>;
  onMarkAllRead: () => Promise<void>;
  onOpenCourse: (courseId: string, conceptId?: string | null) => void;
}

export function NotificationsView({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onOpenCourse,
}: NotificationsViewProps) {
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle>Curriculum Update Notifications</CardTitle>
              <CardDescription>
                Automatic alerts whenever an enrolled course adds concepts, updates prerequisites,
                or splits a topic—keeping your learning path synchronized.
              </CardDescription>
            </div>
            {unreadCount > 0 && (
              <Button variant="outline" size="sm" onClick={onMarkAllRead}>
                <CheckCheck className="h-4 w-4" />
                <span>Mark All Read ({unreadCount})</span>
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <Bell className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="font-display text-sm font-semibold text-[#0F172A]">
              No curriculum updates yet
            </p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              When an instructor updates a course you are enrolled in, you will see exact details
              of what changed and whether your next recommended concept shifted.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => (
            <Card
              key={n.id}
              className={
                n.is_read
                  ? 'border-slate-200 bg-white'
                  : 'border-[#2563EB]/40 bg-[#F5F8FF]'
              }
            >
              <CardContent className="pt-5 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                      <span className="font-semibold text-[#2563EB]">{n.course_title}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDateTime(n.created_at)}</span>
                      {!n.is_read && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-[#7C3AED]">Unread</span>
                        </>
                      )}
                    </div>
                    <h4 className="font-display text-base font-semibold text-[#0F172A]">
                      {n.title}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2">
                    {!n.is_read && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onMarkRead(n.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>Mark Read</span>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      onClick={() => onOpenCourse(n.course_id, n.new_next_concept_id)}
                    >
                      <span>View Updated Path</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-slate-700 leading-relaxed">{n.message}</p>

                {/* Detailed structural change breakdown */}
                <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-600 border-t border-slate-200/70 pt-3">
                  {n.change_summary.added_concepts && n.change_summary.added_concepts.length > 0 && (
                    <span>
                      <strong>Added:</strong> {n.change_summary.added_concepts.join(', ')}
                    </span>
                  )}
                  {n.change_summary.new_prerequisites &&
                    n.change_summary.new_prerequisites.length > 0 && (
                      <span>
                        <strong>New Prerequisites:</strong>{' '}
                        {n.change_summary.new_prerequisites.join(', ')}
                      </span>
                    )}
                  {n.change_summary.removed_prerequisites &&
                    n.change_summary.removed_prerequisites.length > 0 && (
                      <span>
                        <strong>Removed Links:</strong>{' '}
                        {n.change_summary.removed_prerequisites.join(', ')}
                      </span>
                    )}
                  {n.change_summary.split_concepts && n.change_summary.split_concepts.length > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <GitBranch className="h-3.5 w-3.5 text-[#7C3AED]" />
                      <strong>Split:</strong>{' '}
                      {n.change_summary.split_concepts
                        .map((s) => `${s.original} → ${s.children.join(' & ')}`)
                        .join('; ')}
                    </span>
                  )}
                  {n.next_topic_changed && n.new_next_concept_title && (
                    <span className="font-semibold text-[#2563EB]">
                      Next Recommended Topic Changed → {n.new_next_concept_title}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
