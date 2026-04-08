"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";

interface Site {
  id: string;
  name: string;
  nameAr?: string;
  baseUrl: string;
  status: string;
  lastRunAt?: string;
  _count: {
    runs: number;
    incidents: number;
  };
}

export default function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSites();
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch("/api/sites");
      const data = await res.json();
      setSites(data.sites);
    } catch (error) {
      console.error("Error fetching sites:", error);
    } finally {
      setLoading(false);
    }
  };

  const triggerRun = async (siteId: string) => {
    try {
      const res = await fetch(`/api/sites/${siteId}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.run) {
        window.location.href = `/live/${data.run.id}`;
      }
    } catch (error) {
      console.error("Error triggering run:", error);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, any> = {
      healthy: { variant: "default", className: "bg-green-500", label: "🟢 Healthy" },
      degraded: { variant: "secondary", className: "bg-yellow-500", label: "🟡 Degraded" },
      down: { variant: "destructive", label: "🔴 Down" },
      unknown: { variant: "outline", label: "⚪ Unknown" },
    };
    const config = variants[status] || variants.unknown;
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <nav className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <Link href="/">
              <h1 className="text-2xl font-bold text-gray-900 cursor-pointer">GovWatch</h1>
            </Link>
            <div className="flex gap-2">
              <Link href="/">
                <Button variant="outline">Home</Button>
              </Link>
            </div>
          </div>
        </nav>

        {/* Main Content with Skeletons */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <Skeleton className="h-9 w-96 mb-2" />
            <Skeleton className="h-6 w-80" />
          </div>

          {/* Skeleton Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <Skeleton className="h-6 w-32 mb-2" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-4 w-full" />

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Skeleton className="h-4 w-16 mb-2" />
                      <Skeleton className="h-6 w-12" />
                    </div>
                    <div>
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-6 w-8" />
                    </div>
                  </div>

                  <Skeleton className="h-3 w-40" />

                  <div className="pt-2 flex gap-2">
                    <Skeleton className="h-8 flex-1" />
                    <Skeleton className="h-8 flex-1" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <nav className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <Link href="/">
            <h1 className="text-2xl font-bold text-gray-900 cursor-pointer">GovWatch</h1>
          </Link>
          <div className="flex gap-2">
            <Link href="/">
              <Button variant="outline">Home</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">
            Saudi Government Websites Dashboard
          </h2>
          <p className="text-gray-600">
            Monitoring {sites.length} government websites • Real-time status updates
          </p>
        </div>

        {/* Sites Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sites.map((site) => (
            <Card key={site.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <CardTitle className="text-xl">{site.name}</CardTitle>
                    {site.nameAr && (
                      <p className="text-sm text-gray-500 mt-1">{site.nameAr}</p>
                    )}
                  </div>
                  {getStatusBadge(site.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="text-sm text-gray-600">
                  <p className="truncate">{site.baseUrl}</p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Total Runs</p>
                    <p className="font-semibold text-lg">{site._count.runs}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Open Incidents</p>
                    <p className="font-semibold text-lg text-red-600">
                      {site._count.incidents}
                    </p>
                  </div>
                </div>

                {site.lastRunAt && (
                  <div className="text-xs text-gray-500">
                    Last run: {new Date(site.lastRunAt).toLocaleString()}
                  </div>
                )}

                <div className="pt-2 flex gap-2">
                  <Button
                    onClick={() => triggerRun(site.id)}
                    className="flex-1"
                    size="sm"
                  >
                    Run Test
                  </Button>
                  <Link href={`/dashboard/${site.id}`} className="flex-1">
                    <Button variant="outline" className="w-full" size="sm">
                      Details
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {sites.length === 0 && (
          <EmptyState
            icon="🌐"
            title="No Sites Configured"
            description="No government websites are currently being monitored. Sites will appear here once they are added to the system."
            action={{
              label: "Run Database Seed",
              onClick: () => {
                alert("Run 'npm run seed' in your terminal to add preset Saudi government websites");
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
