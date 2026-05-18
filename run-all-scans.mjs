// Standalone script to run scans for all 10 sites
// Usage: node run-all-scans.mjs

import { PrismaClient } from '@prisma/client';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function main() {
  // Dynamically import the executor (it's TypeScript, need tsx or compiled)
  // We'll use a child process approach instead — call the API start endpoint

  const sites = await prisma.site.findMany({
    where: { isActive: true },
    include: { journeys: { take: 1 } },
  });

  console.log(`Found ${sites.length} sites to scan`);

  // Create runs for sites that need fresh scans
  const runs = [];
  for (const site of sites) {
    const journeyId = site.journeys[0]?.id;
    if (!journeyId) {
      console.log(`Skipping ${site.name} — no journey`);
      continue;
    }

    const run = await prisma.run.create({
      data: {
        siteId: site.id,
        journeyId,
        status: 'queued',
        triggeredBy: 'manual',
      },
    });
    runs.push({ run, site });
    console.log(`Created run ${run.id} for ${site.name}`);
  }

  // Now start each run via HTTP — the API will handle execution in background
  // We need to authenticate first
  console.log('\nStarting runs via API...');

  for (const { run, site } of runs) {
    try {
      const resp = await fetch(`http://localhost:3000/api/runs/${run.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const text = await resp.text();
      console.log(`${site.name}: ${resp.status} ${text.substring(0, 100)}`);

      // Wait 3 seconds between starts to avoid overloading
      await new Promise(r => setTimeout(r, 3000));
    } catch (err) {
      console.error(`Failed to start ${site.name}:`, err.message);
    }
  }

  console.log('\nAll scans triggered. Waiting for completion...');

  // Poll until all done
  const runIds = runs.map(r => r.run.id);
  let attempts = 0;
  while (attempts < 120) { // 10 min max wait
    await new Promise(r => setTimeout(r, 5000));
    attempts++;

    const statuses = await prisma.run.findMany({
      where: { id: { in: runIds } },
      select: { id: true, status: true, durationMs: true },
    });

    const pending = statuses.filter(s => ['queued', 'running'].includes(s.status));
    const done = statuses.filter(s => !['queued', 'running'].includes(s.status));

    console.log(`[${attempts * 5}s] Done: ${done.length}/${statuses.length} (pending: ${pending.length})`);

    if (pending.length === 0) break;
  }

  // Final results
  const final = await prisma.run.findMany({
    where: { id: { in: runIds } },
    include: { site: { select: { name: true } } },
  });

  console.log('\n=== FINAL RESULTS ===');
  for (const r of final) {
    console.log(`${r.site.name.padEnd(25)} ${r.status.padEnd(8)} ${r.passedSteps}/${r.totalSteps} steps  ${r.durationMs ? (r.durationMs/1000).toFixed(1)+'s' : '-'}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
