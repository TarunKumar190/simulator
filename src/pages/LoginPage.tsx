import React, { useState } from 'react';
import { Lock, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';

export function LoginPage({
  onLogin,
}: {
  onLogin: (user: { email: string; name: string; role: string }, token: string) => void;
}) {
  const [email, setEmail] = useState('tarun.raj@forgetwin.io');
  const [password, setPassword] = useState('ForgeTwin@2026');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotNotice, setForgotNotice] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email.trim() || !password) {
      setError('Please enter both your email address and password.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, rememberMe }),
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
              <span className="font-mono text-[#E2E8F0]">Software IoT Simulator Ready</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Sign-In Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md bg-white border border-[#D9E0E7] rounded-md p-6 sm:p-8 shadow-[0_2px_8px_rgba(23,43,77,0.06)]">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-[#172B4D]">
              Sign in to ForgeTwin
            </h2>
            <p className="text-xs text-[#667586] mt-1">
              Access real-time telemetry, 3D Digital Twin, and maintenance workflows.
            </p>
          </div>

          {error && (
            <div className="mb-4 flex items-start gap-2 p-3 rounded border border-[#C74747]/30 bg-[#C74747]/8 text-xs text-[#C74747]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {forgotNotice && (
            <div className="mb-4 p-3 rounded border border-[#2563A6]/25 bg-[#EAF0F6] text-xs text-[#172B4D]">
              Password recovery instructions are managed by your Plant System Administrator.
              Use the pre-filled demonstration credentials below for immediate evaluation.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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
                <button
                  type="button"
                  onClick={() => setForgotNotice((v) => !v)}
                  className="text-xs text-[#2563A6] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#D9E0E7] rounded text-[#172334] focus:outline-none focus:border-[#2563A6]"
                required
              />
            </div>

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

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#172B4D] hover:bg-[#2563A6] rounded transition-colors disabled:opacity-60"
            >
              <Lock className="w-4 h-4" />
              <span>{loading ? 'Authenticating...' : 'Sign In to Operations Console'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Role quick-select for demonstration */}
          <div className="mt-5 pt-4 border-t border-[#D9E0E7]">
            <div className="text-xs font-medium text-[#667586] mb-2">
              Quick Demo Profiles
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
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
                  setEmail('arjun.d@forgetwin.io');
                  setPassword('ForgeTwin@2026');
                }}
                className="px-2.5 py-1.5 text-xs text-left border border-[#D9E0E7] rounded hover:bg-[#EAF0F6] text-[#172334]"
              >
                <div className="font-medium">Arjun Deshmukh</div>
                <div className="text-[11px] text-[#667586]">Maintenance Eng.</div>
              </button>
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2 text-[11px] text-[#8A96A3]">
            <ShieldCheck className="w-4 h-4 text-[#16836B] shrink-0" />
            <span>
              Secure role-based engineering access · Demonstration environment powered by simulated IoT telemetry.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
