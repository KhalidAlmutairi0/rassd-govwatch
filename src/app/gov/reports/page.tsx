"use client";

import { useState } from "react";
import { FileBarChart2, Calendar, Mail, Download, CheckCircle2 } from "lucide-react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, i) => {
  const h = i % 12 || 12;
  const ampm = i < 12 ? "AM" : "PM";
  return { value: i, label: `${h}:00 ${ampm}` };
});

export default function GovReportsPage() {
  const [email, setEmail] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(0); // Sunday
  const [hourOfDay, setHourOfDay] = useState(8);  // 8 AM
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/gov/reports/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: email, dayOfWeek, hourOfDay }),
      });
      if (res.ok) {
        setSaved(true);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to schedule report.");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadNow = async () => {
    const res = await fetch("/api/gov/dashboard");
    const data = await res.json();

    const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    let report = `RASSD — EXECUTIVE COMPLIANCE REPORT\nGenerated: ${date}\n${"=".repeat(50)}\n\n`;
    report += `OVERALL COMPLIANCE SCORE: ${data.complianceScore}%\n`;
    report += `Total Services: ${data.totalSites} | Active Issues: ${data.totalActiveIncidents}\n\n`;

    for (const card of (data.ministryCards || [])) {
      const emoji = card.rag === "green" ? "✅" : card.rag === "yellow" ? "⚠️" : card.rag === "red" ? "❌" : "❔";
      report += `${emoji} ${card.ministryName}: ${card.plainStatus}\n   ${card.citizenImpact}\n\n`;
    }

    const blob = new Blob([report], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rassd-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <FileBarChart2 className="w-6 h-6 text-[#2D2770]" />
          Compliance Reports
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Download or schedule automatic delivery of executive compliance reports
        </p>
      </div>

      {/* Download now card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#2D2770]/10 flex items-center justify-center">
            <Download className="w-5 h-5 text-[#2D2770]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Export Current Report</p>
            <p className="text-sm text-gray-500">Download the latest executive summary</p>
          </div>
        </div>
        <button
          onClick={handleDownloadNow}
          className="w-full py-2.5 bg-[#2D2770] text-white text-sm font-semibold rounded-lg hover:bg-[#3D377F] transition-colors"
        >
          Download Executive Summary
        </button>
      </div>

      {/* Scheduled delivery */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#2D2770]/10 flex items-center justify-center">
            <Calendar className="w-5 h-5 text-[#2D2770]" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">Weekly Report Delivery</p>
            <p className="text-sm text-gray-500">Receive an automatic report every week</p>
          </div>
        </div>

        {saved ? (
          <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">Report scheduled</p>
              <p className="text-sm text-green-700">
                Your weekly report will be sent to <strong>{email}</strong> every {DAYS[dayOfWeek]} at {HOURS[hourOfDay]?.label}.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSchedule} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Delivery email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="governor@ministry.gov.sa"
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D2770]/30 focus:border-[#2D2770]"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Day</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(Number(e.target.value))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D2770]/30 focus:border-[#2D2770]"
                >
                  {DAYS.map((day, i) => (
                    <option key={i} value={i}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Time</label>
                <select
                  value={hourOfDay}
                  onChange={(e) => setHourOfDay(Number(e.target.value))}
                  className="w-full py-2.5 px-3 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#2D2770]/30 focus:border-[#2D2770]"
                >
                  {HOURS.map((h) => (
                    <option key={h.value} value={h.value}>{h.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 bg-[#2D2770] text-white text-sm font-semibold rounded-lg hover:bg-[#3D377F] transition-colors disabled:opacity-50"
            >
              {saving ? "Scheduling..." : "Schedule Weekly Report"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
