"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ElementTestResults } from "@/components/report/ElementTestResults";

interface Run {
  id: string;
  status: string;
  durationMs: number;
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  summaryJson: string;
  site: {
    name: string;
    baseUrl: string;
  };
  steps: Array<{
    stepIndex: number;
    action: string;
    description: string;
    status: string;
    durationMs?: number;
    error?: string;
    screenshotPath?: string;
  }>;
}

export default function ReportPage() {
  const params = useParams();
  const runId = params.runId as string;
  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRun();
  }, []);

  const fetchRun = async () => {
    try {
      const res = await fetch(`/api/sites/temp/runs/${runId}`);
      const data = await res.json();
      setRun(data.run);
    } catch (error) {
      console.error("Error fetching run:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
        {/* Header Skeleton */}
        <nav className="bg-white border-b shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-6 w-24" />
          </div>
        </nav>

        {/* Main Content Skeletons */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Overview Card Skeleton */}
          <Card className="shadow-xl border-2 border-gray-200">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-white">
              <Skeleton className="h-8 w-64 mb-2" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="grid grid-cols-4 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="text-center">
                    <Skeleton className="h-4 w-16 mb-2 mx-auto" />
                    <Skeleton className="h-9 w-20 mx-auto" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Summary Skeleton */}
          <Card className="shadow-xl border-2 border-gray-200">
            <CardHeader className="bg-gradient-to-r from-violet-50 to-blue-50">
              <Skeleton className="h-6 w-32" />
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Skeleton className="h-4 w-32 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            </CardContent>
          </Card>

          {/* Test Steps Skeleton */}
          <Card className="shadow-xl border-2 border-gray-200">
            <CardHeader className="bg-gradient-to-r from-gray-50 to-white">
              <Skeleton className="h-6 w-24" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="p-4 rounded-xl border-2 border-gray-200">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <Skeleton className="h-5 w-3/4 mb-2" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                      <Skeleton className="h-6 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          <EmptyState
            icon="🔍"
            title="Report Not Found"
            description="The test report you're looking for doesn't exist or has been removed."
          >
            <Link href="/dashboard">
              <Button className="mt-4 rounded-full px-6">Back to Dashboard</Button>
            </Link>
          </EmptyState>
        </div>
      </div>
    );
  }

  let summary: { executive?: string; executiveAr?: string; technicalDetails?: string; recommendations?: string[]; text?: string } | null = null;
  try {
    const parsed = JSON.parse(run.summaryJson);
    // Normalize: executor may save { text } or { executive, executiveAr, ... }
    summary = {
      executive: parsed.executive || parsed.text || null,
      executiveAr: parsed.executiveAr || null,
      technicalDetails: parsed.technicalDetails || null,
      recommendations: parsed.recommendations || null,
    };
    // Only show if there's at least something meaningful
    if (!summary.executive && !summary.executiveAr) summary = null;
  } catch {
    summary = null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <nav className="bg-white border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/dashboard">
            <Button variant="ghost" className="hover:bg-gray-100">
              ← Back to Dashboard
            </Button>
          </Link>
          <Badge className={
            run.status === "passed" ? "bg-gradient-to-r from-green-400 to-green-500" :
            run.status === "failed" ? "bg-gradient-to-r from-red-400 to-red-500" :
            "bg-gray-500"
          }>
            {run.status.toUpperCase()}
          </Badge>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Overview */}
        <Card className="shadow-xl border-2 border-gray-200">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-white">
            <CardTitle className="text-2xl font-bold text-gray-900">
              Test Report for {run.site.name}
            </CardTitle>
            <p className="text-sm text-gray-600 font-medium">{run.site.baseUrl}</p>
          </CardHeader>
          <CardContent className="space-y-4 pt-6">
            <div className="grid grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm text-gray-500 font-semibold mb-2">Duration</p>
                <p className="text-3xl font-bold text-gray-900">
                  {(run.durationMs / 1000).toFixed(1)}s
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 font-semibold mb-2">Total Steps</p>
                <p className="text-3xl font-bold text-gray-900">{run.totalSteps}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 font-semibold mb-2">Passed</p>
                <p className="text-3xl font-bold text-green-600">{run.passedSteps}</p>
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-500 font-semibold mb-2">Failed</p>
                <p className="text-3xl font-bold text-red-600">{run.failedSteps}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Summary */}
        {summary && (
          <Card className="shadow-xl border-2 border-gray-200">
            <CardHeader className="bg-gradient-to-r from-violet-50 to-blue-50">
              <CardTitle className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <span>🤖</span> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Executive Summary</h4>
                <p className="text-gray-700">{summary.executive}</p>
              </div>
              {summary.executiveAr && (
                <div>
                  <h4 className="font-semibold mb-2">الملخص التنفيذي</h4>
                  <p className="text-gray-700 text-right" dir="rtl">{summary.executiveAr}</p>
                </div>
              )}
              {summary.technicalDetails && (
                <div>
                  <h4 className="font-semibold mb-2">Technical Details</h4>
                  <p className="text-sm text-gray-600">{summary.technicalDetails}</p>
                </div>
              )}
              {summary.recommendations && summary.recommendations.length > 0 && (
                <div>
                  <h4 className="font-semibold mb-2">Recommendations</h4>
                  <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                    {summary.recommendations.map((rec: string, i: number) => (
                      <li key={i}>{rec}</li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Test Steps */}
        <Card className="shadow-xl border-2 border-gray-200">
          <CardHeader className="bg-gradient-to-r from-gray-50 to-white">
            <CardTitle className="text-xl font-bold text-gray-900">Test Steps</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {run.steps.map((step) => (
                <div
                  key={step.stepIndex}
                  className={`p-4 rounded-xl border-2 shadow-sm transition-all ${
                    step.status === "passed" ? "bg-green-50 border-green-200 hover:shadow-md" :
                    step.status === "failed" ? "bg-red-50 border-red-200 hover:shadow-md" :
                    "bg-gray-50 border-gray-200"
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium">
                        {step.stepIndex + 1}. {step.description}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {step.action} • {step.durationMs ? `${(step.durationMs / 1000).toFixed(1)}s` : "—"}
                      </p>
                      {step.error && (
                        <p className="text-sm text-red-600 mt-2">{step.error}</p>
                      )}
                    </div>
                    <Badge className={
                      step.status === "passed" ? "bg-green-500" :
                      step.status === "failed" ? "bg-red-500" : "bg-gray-500"
                    }>
                      {step.status}
                    </Badge>
                  </div>
                  {step.screenshotPath && (
                    <div className="mt-2">
                      <img
                        src={`/api/artifacts/${step.screenshotPath.replace("artifacts/", "")}`}
                        alt={`Screenshot ${step.stepIndex}`}
                        className="rounded border max-w-full h-auto"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Element Test Results */}
        <ElementTestResults runId={runId} />
      </div>
    </div>
  );
}
