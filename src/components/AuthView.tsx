import { useState } from 'react';
import { ArrowRight, BookOpen, GitBranch, Lock, Network, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiError, setSessionToken } from '../lib/api.ts';
import type { Profile, UserRole } from '../types/learnpath.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.tsx';
import { Input, Label } from './ui/input.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';

interface AuthViewProps {
  onAuthenticated: (user: Profile) => void;
}

export function AuthView({ onAuthenticated }: AuthViewProps) {
  const [tab, setTab] = useState<'login' | 'register' | 'reset'>('login');
  const [loading, setLoading] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState<UserRole>('learner');

  // Password reset
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await api.login({ email: loginEmail, password: loginPassword });
      setSessionToken(res.token);
      toast.success(`Signed in as ${res.user.full_name}`);
      onAuthenticated(res.user);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Unable to sign in.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin(email: string, password: string) {
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await api.login({ email, password });
      setSessionToken(res.token);
      toast.success(`Signed in as ${res.user.full_name}`);
      onAuthenticated(res.user);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Demo login failed.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await api.register({
        full_name: regName,
        email: regEmail,
        password: regPassword,
        role: regRole,
      });
      setSessionToken(res.token);
      toast.success('Account created successfully.');
      onAuthenticated(res.user);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Registration failed.';
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await api.forgotPassword(resetEmail);
      setIssuedCode(res.reset_code);
      setResetCode(res.reset_code);
      toast.success('Verification code generated.');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not issue reset code.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);
    try {
      const res = await api.resetPassword({
        email: resetEmail,
        reset_code: resetCode,
        new_password: newPassword,
      });
      toast.success(res.message);
      setIssuedCode(null);
      setLoginEmail(resetEmail);
      setTab('login');
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Could not reset password.';
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F9FF] flex flex-col">
      <header className="border-b border-slate-200/80 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-8 px-6 py-4">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#2563EB] text-white">
              <Network className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-[#0F172A]">
              LearnPath
            </span>
          </div>
          <p className="hidden sm:block text-xs text-slate-500 whitespace-nowrap">
            Adaptive Knowledge Graph Learning Platform
          </p>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-10 lg:grid-cols-12">
        {/* Left Architectural Overview */}
        <div className="lg:col-span-6 space-y-8">
          <div className="space-y-4">
            <p className="text-xs font-semibold tracking-wide text-[#2563EB]">
              Prerequisite-Driven Mastery
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight text-[#0F172A] sm:text-4xl text-balance">
              Learn concepts in the exact order your foundations allow.
            </h1>
            <p className="text-base leading-relaxed text-slate-600 max-w-xl">
              LearnPath replaces flat topic lists with a validated Directed Acyclic Graph.
              Students prove mastery before advancing, generate personalized paths to any
              target topic, and keep every historical quiz record when instructors evolve the
              curriculum.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] mb-1.5">
                <Lock className="h-4 w-4 text-[#2563EB]" />
                <span>Mastery-Gated Unlocking</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                Dependent concepts stay locked with clear prerequisite explanations until
                foundational quizzes pass above threshold.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] mb-1.5">
                <GitBranch className="h-4 w-4 text-[#7C3AED]" />
                <span>Safe Live Restructuring</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                Split concepts or adjust edges mid-cohort without erasing historical attempts,
                with automated learner notifications.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] mb-1.5">
                <ShieldCheck className="h-4 w-4 text-[#059669]" />
                <span>Strict DAG Validation</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                Client and server graph validation rejects circular prerequisites and names
                the exact learning cycle path.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] mb-1.5">
                <BookOpen className="h-4 w-4 text-[#2563EB]" />
                <span>Topological Learning Paths</span>
              </div>
              <p className="text-xs leading-relaxed text-slate-600">
                Pick any target concept to compute remaining steps, skip mastered topics, and
                estimate total study time.
              </p>
            </div>
          </div>
        </div>

        {/* Right Auth Panel */}
        <div className="lg:col-span-6">
          <Card className="mx-auto max-w-md border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl">Access your workspace</CardTitle>
              <CardDescription>
                Sign in with an instructor or learner account, or create a new profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Tabs
                value={tab}
                onValueChange={(v) => {
                  setErrorMsg(null);
                  setTab(v as 'login' | 'register' | 'reset');
                }}
              >
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="login">Sign In</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                  <TabsTrigger value="reset">Reset Password</TabsTrigger>
                </TabsList>

                {errorMsg && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-medium text-red-700">
                    {errorMsg}
                  </div>
                )}

                <TabsContent value="login">
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                      <Label htmlFor="login-email">Email Address</Label>
                      <Input
                        id="login-email"
                        type="email"
                        required
                        placeholder="alex.rivera@student.edu"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="login-password">Password</Label>
                      <Input
                        id="login-password"
                        type="password"
                        required
                        placeholder="Enter your password"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      <span>{loading ? 'Signing in...' : 'Sign In'}</span>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </form>

                  <div className="mt-6 border-t border-slate-100 pt-4 space-y-2.5">
                    <p className="text-xs font-semibold text-slate-600">
                      Quick Demo Access
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loading}
                        onClick={() =>
                          handleDemoLogin('alex.rivera@student.edu', 'Learner123!')
                        }
                      >
                        Demo Learner (Alex)
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={loading}
                        onClick={() =>
                          handleDemoLogin('dr.elena@learnpath.edu', 'Instructor123!')
                        }
                      >
                        Demo Instructor (Elena)
                      </Button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      Learner: <span className="font-mono">alex.rivera@student.edu</span> · Instructor:{' '}
                      <span className="font-mono">dr.elena@learnpath.edu</span>
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                      <Label htmlFor="reg-name">Full Name</Label>
                      <Input
                        id="reg-name"
                        required
                        placeholder="Jordan Patel"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reg-email">Email Address</Label>
                      <Input
                        id="reg-email"
                        type="email"
                        required
                        placeholder="jordan@university.edu"
                        value={regEmail}
                        onChange={(e) => setRegEmail(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reg-password">Password</Label>
                      <Input
                        id="reg-password"
                        type="password"
                        required
                        minLength={6}
                        placeholder="At least 6 characters"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Account Role</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setRegRole('learner')}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                            regRole === 'learner'
                              ? 'border-[#2563EB] bg-[#EFF4FF] text-[#1E3A8A]'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Learner / Student
                        </button>
                        <button
                          type="button"
                          onClick={() => setRegRole('instructor')}
                          className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
                            regRole === 'instructor'
                              ? 'border-[#7C3AED] bg-violet-50 text-violet-900'
                              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Instructor / Admin
                        </button>
                      </div>
                    </div>
                    <Button type="submit" className="w-full" disabled={loading}>
                      {loading ? 'Creating account...' : 'Create Account'}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="reset">
                  <div className="space-y-4">
                    <form onSubmit={handleRequestReset} className="space-y-3">
                      <div>
                        <Label htmlFor="reset-email">Account Email</Label>
                        <Input
                          id="reset-email"
                          type="email"
                          required
                          placeholder="alex.rivera@student.edu"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                        />
                      </div>
                      <Button type="submit" variant="outline" className="w-full" disabled={loading}>
                        Generate Verification Code
                      </Button>
                    </form>

                    {issuedCode && (
                      <form
                        onSubmit={handleConfirmReset}
                        className="space-y-3 border-t border-slate-100 pt-4"
                      >
                        <div className="rounded-lg border border-blue-200 bg-[#EFF4FF] p-3 text-xs text-[#1E3A8A]">
                          Verification code:{' '}
                          <span className="font-mono font-bold">{issuedCode}</span>
                        </div>
                        <div>
                          <Label htmlFor="reset-code">Reset Code</Label>
                          <Input
                            id="reset-code"
                            required
                            value={resetCode}
                            onChange={(e) => setResetCode(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label htmlFor="new-pw">New Password</Label>
                          <Input
                            id="new-pw"
                            type="password"
                            required
                            minLength={6}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                          />
                        </div>
                        <Button type="submit" className="w-full" disabled={loading}>
                          Update Password
                        </Button>
                      </form>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
