"use client";

import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto">
      <div className="bg-[#1E1B4B] rounded-2xl shadow-2xl border border-white/10 p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#2D2770] border border-white/20 flex items-center justify-center mb-4">
            <span className="text-white text-2xl font-bold">ر</span>
          </div>
          <h1 className="text-xl font-bold text-white">Reset Password</h1>
          <p className="text-sm text-white/50 mt-1">Enter your registered email</p>
        </div>

        {sent ? (
          <div className="text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="w-12 h-12 text-green-400" />
            </div>
            <p className="text-white font-medium">Check your email</p>
            <p className="text-sm text-white/50">
              If that email is registered, a reset link has been sent. The link expires in 1 hour.
            </p>
            <Link href="/login" className="block text-sm text-[#9D8FEF] hover:underline mt-4">
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5 uppercase tracking-wider">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ministry.gov.sa"
                  className="w-full pl-10 pr-4 py-2.5 bg-white/8 border border-white/15 rounded-lg text-white text-sm placeholder:text-white/25 focus:outline-none focus:ring-2 focus:ring-[#7C6FE0] focus:border-transparent transition"
                />
              </div>
              {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#2D2770] hover:bg-[#3D377F] text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-40"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>

            <Link href="/login" className="flex items-center justify-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mt-2">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
