"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Test failed");
      }

      // Redirect to live view
      window.location.href = `/live/${data.runId}`;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Header */}
      <nav className="border-b bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">GovWatch</h1>
          <Link href="/dashboard">
            <Button variant="outline">Dashboard</Button>
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-12">
          <h2 className="text-5xl font-bold text-gray-900 mb-4">
            AI-Powered Website Monitoring
          </h2>
          <p className="text-xl text-gray-600">
            Real-time monitoring of Saudi government websites with live browser view
          </p>
        </div>

        {/* URL Test Input */}
        <Card className="max-w-2xl mx-auto shadow-lg">
          <CardHeader>
            <CardTitle>Instant Website Test</CardTitle>
            <CardDescription>
              Enter any government website URL to run an instant test with live browser streaming
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTest} className="space-y-4">
              <div>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.absher.sa"
                  className="w-full px-4 py-3 text-lg border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                disabled={loading || !url}
                className="w-full py-6 text-lg"
                size="lg"
              >
                {loading ? "Analyzing & Testing..." : "Start Test"}
              </Button>
            </form>

            <div className="mt-6 text-sm text-gray-500 text-center">
              <p>The system will:</p>
              <ul className="mt-2 space-y-1">
                <li>✓ Analyze the website structure</li>
                <li>✓ Generate safe smoke tests automatically</li>
                <li>✓ Execute tests with live browser view</li>
                <li>✓ Produce an AI-powered report</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mt-16">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Live Browser View</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Watch the AI agent browse websites in real-time through CDP screencast streaming
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">AI-Powered Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Automatic test generation and intelligent summaries in English and Arabic
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Safe & Secure</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-gray-600">
                Black-box testing only - no code access, no destructive actions, same-domain enforcement
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
