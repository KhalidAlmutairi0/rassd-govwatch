export function summarizeHealth(groups: Array<{ status: string; _count: { _all: number } }>) {
  const total = groups.reduce((sum, group) => sum + group._count._all, 0);
  const healthy = groups.find((group) => group.status === "healthy")?._count._all || 0;
  const known = groups.filter((group) => ["healthy", "degraded", "down"].includes(group.status)).reduce((sum, group) => sum + group._count._all, 0);
  return { total, known, healthy, score: known ? Math.round(healthy / known * 100) : null };
}
