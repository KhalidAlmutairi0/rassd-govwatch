"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Lock, Mail, AlertTriangle, Clock } from "lucide-react";

function formatTimeRemaining(lockedUntil: string): string {
  const remaining = new Date(lockedUntil).getTime() - Date.now();
  if (remaining <= 0) return "0:00";
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [timeRemaining, setTimeRemaining] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedUntil) return;
    const update = () => setTimeRemaining(formatTimeRemaining(lockedUntil));
    update();
    const interval = setInterval(() => {
      const remaining = new Date(lockedUntil).getTime() - Date.now();
      if (remaining <= 0) {
        setLockedUntil(null);
        setError("");
        clearInterval(interval);
      } else {
        update();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const validateEmail = (value: string) => {
    if (!value) { setEmailError("Email is required."); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError("");
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!validateEmail(email)) return;
    if (!password) { setError("Password is required."); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.toLowerCase(), password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Invalid credentials.");
        if (data.lockedUntil) setLockedUntil(data.lockedUntil);
        if (data.attemptsRemaining !== undefined) setAttemptsRemaining(data.attemptsRemaining);
        return;
      }

      // Redirect based on role
      const from = searchParams.get("from");
      router.push(from && !from.startsWith("/login") ? from : data.redirectTo);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const isLocked = !!lockedUntil && new Date(lockedUntil).getTime() > Date.now();

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-[#1E1B4B] rounded-2xl shadow-2xl border border-white/10 p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#2D2770] border border-white/20 flex items-center justify-center mb-4">
            <img src="/union.png" alt="Rassd" className="w-9 h-9 object-contain" />
          </div>
          <h1 className="text-xl font-bold text-white">Welcome to Rassd</h1>
          <p className="text-sm text-white/50 mt-1">رصد — Government Website Monitor</p>
        </div>

        {/* Lockout warning */}
        {isLocked && (
          <div className="mb-5 p-4 bg-red-950/60 border border-red-700/50 rounded-xl flex items-start gap-3">
            <Clock className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300">Account temporarily locked</p>
              <p className="text-xs text-red-400 mt-0.5">
                Too many failed attempts. Try again in{" "}
                <span className="font-mono font-bold">{timeRemaining}</span>
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wider">
              Email address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
                onBlur={() => validateEmail(email)}
                placeholder="you@ministry.gov.sa"
                autoComplete="email"
                disabled={loading || isLocked}
                className="w-full pl-10 pr-4 py-2.5 bg-[#1a1745] border border-white/15 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#7C6FE0] focus:border-transparent disabled:opacity-40 transition"
              />
            </div>
            {emailError && (
              <p className="text-xs text-red-400 mt-1">{emailError}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-white/70 uppercase tracking-wider">
                Password
              </label>
              <a href="/forgot-password" className="text-xs text-[#9D8FEF] hover:text-[#B8ADFF] transition-colors">
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                disabled={loading || isLocked}
                className="w-full pl-10 pr-10 py-2.5 bg-[#1a1745] border border-white/15 rounded-lg text-white text-sm placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-[#7C6FE0] focus:border-transparent disabled:opacity-40 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Attempts warning */}
          {attemptsRemaining !== null && attemptsRemaining > 0 && !isLocked && (
            <div className="flex items-center gap-2 text-xs text-yellow-400 bg-yellow-950/40 border border-yellow-700/40 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining before lockout
            </div>
          )}

          {/* Generic error */}
          {error && !isLocked && (
            <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-700/40 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || isLocked}
            className="w-full py-2.5 mt-2 bg-[#2D2770] hover:bg-[#3D377F] border border-[#4D479F]/50 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Signing in...
              </span>
            ) : isLocked ? (
              `Locked — ${timeRemaining}`
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-white/25 mt-6">
          Rassd — رصد · Authorized access only
        </p>
      </div>
    </div>
  );
}
