import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BookOpen,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Network,
  Target,
  X,
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { AuthView } from './components/AuthView.tsx';
import { CourseDetailPage } from './components/CourseDetailPage.tsx';
import { InstructorDashboard } from './components/InstructorDashboard.tsx';
import { LearnerDashboard } from './components/LearnerDashboard.tsx';
import { NotificationsView } from './components/NotificationsView.tsx';
import { Button } from './components/ui/button.tsx';
import { api, getSessionToken, setSessionToken } from './lib/api.ts';
import { cn } from './lib/utils.ts';
import type { CourseSummary, LearnerNotification, Profile } from './types/learnpath.ts';

type AppRoute =
  | { view: 'dashboard' }
  | {
      view: 'course';
      courseId: string;
      conceptId?: string | null;
      tab?: 'graph' | 'learn' | 'path' | 'history' | 'analytics';
    }
  | { view: 'notifications' };

export default function App() {
  const [user, setUser] = useState<Profile | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [route, setRoute] = useState<AppRoute>({ view: 'dashboard' });
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [notifications, setNotifications] = useState<LearnerNotification[]>([]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const loadShellData = useCallback(async (activeUser: Profile) => {
    try {
      const { courses: courseList } = await api.listCourses();
      setCourses(courseList);
      if (activeUser.role === 'learner') {
        const { notifications: notifList } = await api.getNotifications();
        setNotifications(notifList);
      } else {
        setNotifications([]);
      }
    } catch {
      // Ignore background refresh error
    }
  }, []);

  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      setCheckingAuth(false);
      return;
    }

    api
      .me()
      .then((res) => {
        setUser(res.user);
        loadShellData(res.user);
      })
      .catch(() => {
        setSessionToken(null);
        setUser(null);
      })
      .finally(() => setCheckingAuth(false));
  }, [loadShellData]);

  async function handleLogout() {
    await api.logout().catch(() => {});
    setSessionToken(null);
    setUser(null);
    setRoute({ view: 'dashboard' });
    toast.success('Signed out.');
  }

  function openCourse(
    courseId: string,
    conceptId?: string | null,
    tab: 'graph' | 'learn' | 'path' | 'history' | 'analytics' = 'graph',
  ) {
    setRoute({ view: 'course', courseId, conceptId, tab });
    setMobileNavOpen(false);
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-[#F6F9FF] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-[#2563EB] flex items-center justify-center text-white animate-pulse">
            <Network className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-slate-500">Loading LearnPath workspace...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Toaster position="top-right" richColors />
        <AuthView
          onAuthenticated={(loggedInUser) => {
            setUser(loggedInUser);
            setRoute({ view: 'dashboard' });
            loadShellData(loggedInUser);
          }}
        />
      </>
    );
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  const primaryCourseId =
    route.view === 'course'
      ? route.courseId
      : courses.find((c) => c.is_enrolled)?.id ?? courses[0]?.id ?? null;

  const breadcrumbLabel =
    route.view === 'dashboard'
      ? user.role === 'instructor'
        ? 'Instructor Studio / Courses'
        : 'Learner Dashboard'
      : route.view === 'notifications'
        ? 'Curriculum Update Notifications'
        : `${courses.find((c) => c.id === route.courseId)?.title ?? 'Course Workspace'}`;

  return (
    <div className="min-h-screen bg-[#F6F9FF] text-[#0F172A] flex">
      <Toaster position="top-right" richColors />

      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/35 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Left Sidebar Navigation */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 border-r border-slate-200 bg-white flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setRoute({ view: 'dashboard' });
                setMobileNavOpen(false);
              }}
              className="flex items-center gap-2.5 whitespace-nowrap cursor-pointer"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-white">
                <Network className="h-4 w-4" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
                LearnPath
              </span>
            </button>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              className="lg:hidden p-1 text-slate-500"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setRoute({ view: 'dashboard' });
                setMobileNavOpen(false);
                loadShellData(user);
              }}
              className={cn(
                'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                route.view === 'dashboard'
                  ? 'bg-[#EFF4FF] text-[#1E3A8A]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]',
              )}
            >
              <LayoutDashboard className="h-4 w-4" />
              <span>Dashboard</span>
            </button>

            {primaryCourseId && (
              <>
                <button
                  type="button"
                  onClick={() => openCourse(primaryCourseId, null, 'graph')}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                    route.view === 'course' && route.tab === 'graph'
                      ? 'bg-[#EFF4FF] text-[#1E3A8A]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]',
                  )}
                >
                  <BookOpen className="h-4 w-4" />
                  <span>{user.role === 'instructor' ? 'Graph Studio' : 'Knowledge Graph'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => openCourse(primaryCourseId, null, 'path')}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                    route.view === 'course' && route.tab === 'path'
                      ? 'bg-[#EFF4FF] text-[#1E3A8A]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]',
                  )}
                >
                  <Target className="h-4 w-4" />
                  <span>Learning Path</span>
                </button>

                <button
                  type="button"
                  onClick={() => openCourse(primaryCourseId, null, 'history')}
                  className={cn(
                    'w-full flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                    route.view === 'course' && route.tab === 'history'
                      ? 'bg-[#EFF4FF] text-[#1E3A8A]'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]',
                  )}
                >
                  <History className="h-4 w-4" />
                  <span>Curriculum History</span>
                </button>
              </>
            )}

            {user.role === 'learner' && (
              <button
                type="button"
                onClick={async () => {
                  setRoute({ view: 'notifications' });
                  setMobileNavOpen(false);
                  const res = await api.getNotifications().catch(() => null);
                  if (res) setNotifications(res.notifications);
                }}
                className={cn(
                  'w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer',
                  route.view === 'notifications'
                    ? 'bg-[#EFF4FF] text-[#1E3A8A]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]',
                )}
              >
                <span className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4" />
                  <span>Notifications</span>
                </span>
                {unreadCount > 0 && (
                  <span className="font-mono text-xs font-bold text-[#2563EB] tabular-nums">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}
          </nav>

          {/* Quick Course Switcher */}
          {courses.length > 0 && (
            <div className="border-t border-slate-100 pt-4 space-y-2">
              <p className="px-3 text-[11px] font-semibold text-slate-400">Courses</p>
              <div className="space-y-1">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openCourse(c.id, null, 'graph')}
                    className={cn(
                      'w-full text-left truncate rounded-lg px-3 py-1.5 text-xs transition-colors cursor-pointer',
                      route.view === 'course' && route.courseId === c.id
                        ? 'font-semibold text-[#2563EB] bg-[#F5F8FF]'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-[#0F172A]',
                    )}
                  >
                    {c.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Footer */}
        <div className="border-t border-slate-200 p-4 space-y-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#0F172A] truncate">{user.full_name}</p>
            <p className="text-xs text-slate-500 capitalize truncate">
              {user.role} · {user.email}
            </p>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={handleLogout}>
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-30 h-16 border-b border-slate-200 bg-white/95 backdrop-blur-sm px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-[#0F172A] truncate">
              {breadcrumbLabel}
            </span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {user.role === 'learner' && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setRoute({ view: 'notifications' });
                  const res = await api.getNotifications().catch(() => null);
                  if (res) setNotifications(res.notifications);
                }}
              >
                <Bell className="h-4 w-4 text-[#2563EB]" />
                <span className="tabular-nums">
                  {unreadCount > 0 ? `Updates (${unreadCount})` : 'Notifications'}
                </span>
              </Button>
            )}
            {route.view !== 'dashboard' && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRoute({ view: 'dashboard' });
                  loadShellData(user);
                }}
              >
                All Courses
              </Button>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {route.view === 'dashboard' &&
            (user.role === 'instructor' ? (
              <InstructorDashboard user={user} onOpenCourse={openCourse} />
            ) : (
              <LearnerDashboard
                user={user}
                onOpenCourse={openCourse}
                onOpenNotifications={async () => {
                  setRoute({ view: 'notifications' });
                  const res = await api.getNotifications().catch(() => null);
                  if (res) setNotifications(res.notifications);
                }}
              />
            ))}

          {route.view === 'course' && (
            <CourseDetailPage
              courseId={route.courseId}
              user={user}
              initialConceptId={route.conceptId}
              initialTab={route.tab}
              onBack={() => {
                setRoute({ view: 'dashboard' });
                loadShellData(user);
              }}
            />
          )}

          {route.view === 'notifications' && (
            <NotificationsView
              notifications={notifications}
              onMarkRead={async (id) => {
                await api.markNotificationRead(id);
                setNotifications((prev) =>
                  prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
                );
              }}
              onMarkAllRead={async () => {
                await api.markAllNotificationsRead();
                setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
              }}
              onOpenCourse={(courseId, conceptId) => openCourse(courseId, conceptId, 'path')}
            />
          )}
        </main>
      </div>
    </div>
  );
}
