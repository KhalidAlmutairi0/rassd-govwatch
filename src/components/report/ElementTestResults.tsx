"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ElementTestResult {
  id: string;
  elementType: string;
  elementText: string;
  elementTextAr: string | null;
  elementSelector: string;
  parentSection: string | null;
  action: string;
  status: string;
  responseTimeMs: number | null;
  urlBefore: string | null;
  urlAfter: string | null;
  urlChanged: boolean;
  screenshotBefore: string | null;
  screenshotAfter: string | null;
  consoleErrors: string | null;
  networkErrors: string | null;
  domChanges: string | null;
  error: string | null;
  cursorX: number | null;
  cursorY: number | null;
  createdAt: string;
}

interface ElementTestSummary {
  total: number;
  passed: number;
  failed: number;
  byType: Record<string, { total: number; passed: number; failed: number }>;
}

interface ElementTestResultsProps {
  runId: string;
}

export function ElementTestResults({ runId }: ElementTestResultsProps) {
  const [elements, setElements] = useState<ElementTestResult[]>([]);
  const [summary, setSummary] = useState<ElementTestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedElement, setExpandedElement] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"all" | "passed" | "failed">("all");

  useEffect(() => {
    async function fetchElements() {
      try {
        const response = await fetch(`/api/runs/${runId}/elements`);
        if (!response.ok) throw new Error("Failed to fetch elements");
        const data = await response.json();
        setElements(data.elements);
        setSummary(data.summary);
      } catch (error) {
        console.error("Error fetching element test results:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchElements();
  }, [runId]);

  if (loading) {
    return (
      <div className="space-y-4">
        {/* Summary Skeleton */}
        <Card className="p-6">
          <Skeleton className="h-6 w-48 mb-4" />

          {/* Overall Stats Skeleton */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center">
                <Skeleton className="h-9 w-16 mx-auto mb-2" />
                <Skeleton className="h-4 w-24 mx-auto" />
              </div>
            ))}
          </div>

          {/* Stats by Type Skeleton */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-32 mb-2" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-100">
                <Skeleton className="h-4 w-20" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Filter Buttons Skeleton */}
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>

        {/* Element Results List Skeleton */}
        <Card className="p-4">
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="border rounded-lg p-3">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-5 w-5 mt-0.5" />
                  <Skeleton className="h-5 w-5 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Skeleton className="h-5 w-16" />
                      <Skeleton className="h-4 w-32" />
                    </div>
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!summary || elements.length === 0) {
    return (
      <Card className="shadow-xl border-2 border-gray-200">
        <CardContent className="text-center py-12">
          <div className="text-5xl mb-3">🔬</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Element Tests Available</h3>
          <p className="text-sm text-gray-600">
            This test run didn't include individual element testing, or no interactive elements were found on the page.
          </p>
        </CardContent>
      </Card>
    );
  }

  const filteredElements =
    filterStatus === "all"
      ? elements
      : elements.filter((e) => e.status === filterStatus);

  const statusIcon = (status: string) => {
    switch (status) {
      case "passed":
        return "✅";
      case "failed":
        return "❌";
      default:
        return "⏳";
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "passed":
        return "bg-green-50 text-green-700 border-green-200";
      case "failed":
        return "bg-red-50 text-red-700 border-red-200";
      default:
        return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary Section */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Element Test Results</h3>

        {/* Overall Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-gray-900">{summary.total}</div>
            <div className="text-sm text-gray-500">Total Elements</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{summary.passed}</div>
            <div className="text-sm text-gray-500">Passed</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{summary.failed}</div>
            <div className="text-sm text-gray-500">Failed</div>
          </div>
        </div>

        {/* Stats by Element Type */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">By Element Type</h4>
          {Object.entries(summary.byType).map(([type, stats]) => (
            <div key={type} className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700 capitalize">{type}</span>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">{stats.total} total</span>
                <span className="text-sm text-green-600">{stats.passed} passed</span>
                {stats.failed > 0 && (
                  <span className="text-sm text-red-600">{stats.failed} failed</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Filter Buttons */}
      <div className="flex gap-2">
        <Button
          variant={filterStatus === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("all")}
        >
          All ({summary.total})
        </Button>
        <Button
          variant={filterStatus === "passed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("passed")}
        >
          Passed ({summary.passed})
        </Button>
        <Button
          variant={filterStatus === "failed" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilterStatus("failed")}
        >
          Failed ({summary.failed})
        </Button>
      </div>

      {/* Element Results List */}
      <Card className="p-4">
        <div className="space-y-2">
          {filteredElements.map((element) => (
            <div
              key={element.id}
              className={`border rounded-lg transition-all ${getStatusColor(element.status)}`}
            >
              {/* Element Header */}
              <button
                className="w-full p-3 flex items-start gap-3 hover:bg-black/5 transition-colors"
                onClick={() =>
                  setExpandedElement(expandedElement === element.id ? null : element.id)
                }
              >
                <span className="text-xl mt-0.5">
                  {expandedElement === element.id ? (
                    <ChevronDown className="w-5 h-5" />
                  ) : (
                    <ChevronRight className="w-5 h-5" />
                  )}
                </span>
                <span className="text-lg">{statusIcon(element.status)}</span>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {element.elementType}
                    </Badge>
                    <span className="text-sm font-medium text-gray-900">
                      {element.elementText || element.elementTextAr || "Unnamed element"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {element.responseTimeMs && `${element.responseTimeMs}ms`}
                    {element.action && ` • ${element.action}`}
                  </div>
                </div>
              </button>

              {/* Expanded Details */}
              {expandedElement === element.id && (
                <div className="px-3 pb-3 space-y-3 border-t border-gray-200/50">
                  {/* Element Info */}
                  <div className="grid grid-cols-2 gap-3 text-xs mt-3">
                    <div>
                      <span className="font-semibold text-gray-700">Selector:</span>
                      <code className="block mt-1 p-2 bg-gray-100 rounded text-gray-800 font-mono text-xs overflow-x-auto">
                        {element.elementSelector}
                      </code>
                    </div>
                    {element.parentSection && (
                      <div>
                        <span className="font-semibold text-gray-700">Section:</span>
                        <div className="mt-1 text-gray-600">{element.parentSection}</div>
                      </div>
                    )}
                  </div>

                  {/* URL Changes */}
                  {element.urlChanged && (
                    <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs">
                      <div className="font-semibold text-blue-700 mb-1">URL Changed</div>
                      <div className="space-y-1 text-gray-700">
                        <div>
                          <span className="font-medium">Before:</span> {element.urlBefore}
                        </div>
                        <div>
                          <span className="font-medium">After:</span> {element.urlAfter}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {element.error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-xs">
                      <div className="font-semibold text-red-700 mb-1">Error</div>
                      <div className="text-gray-700">{element.error}</div>
                    </div>
                  )}

                  {/* Console Errors */}
                  {element.consoleErrors && element.consoleErrors !== "[]" && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                      <div className="font-semibold text-yellow-700 mb-1">Console Errors</div>
                      <pre className="text-gray-700 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(JSON.parse(element.consoleErrors), null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Network Errors */}
                  {element.networkErrors && element.networkErrors !== "[]" && (
                    <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs">
                      <div className="font-semibold text-orange-700 mb-1">Network Errors</div>
                      <pre className="text-gray-700 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(JSON.parse(element.networkErrors), null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Screenshots */}
                  {(element.screenshotBefore || element.screenshotAfter) && (
                    <div className="grid grid-cols-2 gap-2">
                      {element.screenshotBefore && (
                        <div>
                          <div className="text-xs font-semibold text-gray-700 mb-1">Before</div>
                          <img
                            src={`/api/artifacts/${element.screenshotBefore}`}
                            alt="Before interaction"
                            className="w-full rounded border border-gray-200"
                          />
                        </div>
                      )}
                      {element.screenshotAfter && (
                        <div>
                          <div className="text-xs font-semibold text-gray-700 mb-1">After</div>
                          <img
                            src={`/api/artifacts/${element.screenshotAfter}`}
                            alt="After interaction"
                            className="w-full rounded border border-gray-200"
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
