export function executionTimeout(value = process.env.RUN_TIMEOUT_MS) {
  const timeout = Number(value ?? 120_000);
  return Number.isFinite(timeout) ? Math.min(120_000, Math.max(10_000, Math.floor(timeout))) : 120_000;
}
