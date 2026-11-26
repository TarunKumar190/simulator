import React, { useState } from 'react';
import { signInWithPopup } from 'firebase/auth';
import { Lock, ShieldCheck, AlertCircle, ArrowRight, UserPlus } from 'lucide-react';
import { auth, googleAuthProvider } from '../lib/firebase';

export function LoginPage({
  onLogin,
}: {
  onLogin: (user: { id?: string; email: string; name: string; role: string }, token: string) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Plant Operations');
  const [email, setEmail] = useState('tarun.raj@forgetwin.io');
  const [password, setPassword] = useState('ForgeTwin@2026');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotNotice, setForgotNotice] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }
    if (mode === 'register') {
      if (!name.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload =
        mode === 'login'
          ? { email: email.trim(), password, rememberMe }
          : { name: name.trim(), email: email.trim(), password, department: department.trim() };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
      } else {
        onLogin(data.user, data.token);
      }
    } catch {
      setError('Unable to reach ForgeTwin authentication service.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      const credential = await signInWithPopup(auth, googleAuthProvider);
      const idToken = await credential.user.getIdToken();
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Google authentication failed.');
      } else {
        onLogin(data.user, data.token);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('popup-closed-by-user')) {
        setError('Google sign-in popup was closed before completing.');
      } else {
        setError(msg || 'Unable to complete Google sign-in.');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F6F4] flex flex-col lg:flex-row">
      {/* Left Industrial Visual Panel */}
      <div className="lg:w-1/2 bg-[#172B4D] text-white flex flex-col justify-between p-8 lg:p-12 relative overflow-hidden">
        <div className="relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#2563A6] flex items-center justify-center font-mono font-semibold text-sm text-white">
              FT
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-white">
                ForgeTwin
              </div>
              <div className="text-xs text-[#CBD5E1]">
                Industrial Intelligence Platform
              </div>
            </div>
          </div>

          <div className="mt-10 max-w-lg">
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-white leading-snug">
              AI-Powered Industrial Digital Twin &amp; Intelligent Factory Management
            </h1>
            <p className="text-sm text-[#CBD5E1] mt-3 leading-relaxed">
              ForgeTwin connects industrial machine monitoring, AI-powered anomaly detection,
              interactive 3D Digital Twin visualization, computer vision quality inspection,
              and an Agentic AI operations assistant into one unified engineering workspace.
            </p>
          </div>
        </div>

        <div className="relative z-10 mt-8">
          <div className="border border-white/15 rounded-md overflow-hidden bg-[#10203A]">
            <img
              src="/src/assets/images/login_factory_facility_1795722559792.jpg"
              alt="ForgeTwin Precision Manufacturing Floor"
              className="w-full h-56 lg:h-64 object-cover opacity-90"
              referrerPolicy="no-referrer"
            />
            <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#CBD5E1] bg-[#10203A]">
              <span>Plant Alpha · 5 Monitored Assets</span>
              <span className="font-mono text-[#E2E8F0]">PostgreSQL &amp; IoT Simulator Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sign-In / Sign-Up Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md bg-white border border-[#D9E0E7] rounded-md p-6 sm:p-8 shadow-[0_2px_8px_rgba(23,43,77,0.06)]">
          <div className="flex items-center justify-between gap-2 mb-5">
            <div>
              <h2 className="text-xl font-semibold text-[#172B4D]">
                {mode === 'login' ? 'Sign in to ForgeTwin' : 'Create Operator Account'}
              </h2>
              <p className="text-xs text-[#667586] mt-1">
                {mode === 'login'
                  ? 'Access real-time telemetry, 3D Digital Twin, and maintenance workflows.'
                  : 'Register a plant workstation account protected by server-side RBAC.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1 p-1 bg-[#F5F6F4] border border-[#D9E0E7] rounded mb-4 text-xs">
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError('');
              }}
              className={`py-1.5 font-medium rounded transition-colors ${
                mode === 'login'
                  ? 'bg-white text-[#172B4D] shadow-xs border border-[#D9E0E7]'
                  : 'text-[#667586] hover:text-[#172334]'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('register');
                setEmail('');
                setPassword('');
                setError('');
              }}
              className={`py-1.5 font-medium rounded transition-colors ${
                mode === 'register'
                  ? 'bg-white text-[#172B4D] shadow-xs border border-[#D9E0E7]'
                  : 'text-[#667586] hover:text-[#172334]'
              }`}
            >
              Create Account
            </button>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded border border-[#C74747]/30 bg-[#C74747]/8 text-xs text-[#C74747]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {forgotNotice && mode === 'login' && (
            <div className="mb-4 p-3 rounded border border-[#2563A6]/25 bg-[#EAF0F6] text-xs text-[#172B4D]">
              Password recovery is managed by your Plant System Administrator.
              Use the verified demonstration credentials below or sign in with Google.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'register' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="reg-name"
                    className="block text-xs font-medium text-[#172334] mb-1"
                  >
                    Full Name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Mercer"
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E0E7] rounded text-[#172334] focus:outline-none focus:border-[#2563A6]"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-dept"
                    className="block text-xs font-medium text-[#172334] mb-1"
                  >
                    Department
                  </label>
                  <input
                    id="reg-dept"
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-[#D9E0E7] rounded text-[#172334] focus:outline-none focus:border-[#2563A6]"
                  />
                </div>
              </div>
            )}

            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-medium text-[#172334] mb-1.5"
              >
                Work Email
              </label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@forgetwin.io"
                className="w-full px-3 py-2 text-sm bg-white border border-[#D9E0E7] rounded text-[#172334] focus:outline-none focus:border-[#2563A6]"
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-[#172334]"
                >
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setForgotNotice((v) => !v)}
                    className="text-xs text-[#2563A6] hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === 'register' ? 'Minimum 8 characters' : ''}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D9E0E7] rounded text-[#172334] focus:outline-none focus:border-[#2563A6]"
                required
              />
            </div>

            {mode === 'login' && (
              <div className="flex items-center justify-between">
                <label className="inline-flex items-center gap-2 text-xs text-[#667586] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="rounded border-[#D9E0E7] text-[#2563A6]"
                  />
                  Remember this workstation
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#172B4D] hover:bg-[#2563A6] rounded transition-colors disabled:opacity-60"
            >
              {mode === 'login' ? <Lock className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              <span>
                {loading
                  ? 'Authenticating...'
                  : mode === 'login'
                  ? 'Sign In to Operations Console'
                  : 'Create Account & Sign In'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-[#D9E0E7]" />
            <span className="text-[11px] text-[#8A96A3] uppercase tracking-wider">or</span>
            <div className="h-px flex-1 bg-[#D9E0E7]" />
          </div>

          <button
            type="button"
            disabled={googleLoading || loading}
            onClick={handleGoogleLogin}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-[#172334] bg-white border border-[#D9E0E7] hover:bg-[#F5F6F4] rounded transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"
              />
            </svg>
            <span>{googleLoading ? 'Connecting with Google...' : 'Sign in with Google'}</span>
          </button>

          {/* Role quick-select for demonstration */}
          <div className="mt-5 pt-4 border-t border-[#D9E0E7]">
            <div className="text-xs font-medium text-[#667586] mb-2">
              Quick Demo Profiles (Verified Server Password)
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setEmail('tarun.raj@forgetwin.io');
                  setPassword('ForgeTwin@2026');
                }}
                className="px-2.5 py-1.5 text-xs text-left border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172334]"
              >
                <div className="font-medium">Tarun Raj</div>
                <div className="text-[11px] text-[#667586]">Factory Manager</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setEmail('arjun.d@forgetwin.io');
                  setPassword('ForgeTwin@2026');
                }}
                className="px-2.5 py-1.5 text-xs text-left border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172334]"
              >
                <div className="font-medium">Arjun Deshmukh</div>
                <div className="text-[11px] text-[#667586]">Maintenance Eng.</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setEmail('admin@forgetwin.io');
                  setPassword('ForgeTwin@2026');
                }}
                className="px-2.5 py-1.5 text-xs text-left border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172334]"
              >
                <div className="font-medium">Ananya Verma</div>
                <div className="text-[11px] text-[#667586]">System Admin</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setEmail('vikram.s@forgetwin.io');
                  setPassword('ForgeTwin@2026');
                }}
                className="px-2.5 py-1.5 text-xs text-left border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172334]"
              >
                <div className="font-medium">Vikram Singh</div>
                <div className="text-[11px] text-[#667586]">Operator</div>
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 text-[11px] text-[#8A96A3]">
            <ShieldCheck className="w-4 h-4 text-[#16836B] shrink-0" />
            <span>
              Scrypt salted credentials &amp; Firebase Auth · Protected by server-side PostgreSQL RBAC.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
