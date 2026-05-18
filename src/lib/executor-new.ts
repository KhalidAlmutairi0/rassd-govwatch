// src/lib/executor.ts
import { promises as fs } from 'fs';
import { broadcast } from './ws-server';
import { prisma } from './prisma';
import { TestStep } from './validators';
import { discoverElements, DiscoveredElement } from './element-discovery';
import { testElement } from './element-tester';

type Browser = import('playwright-core').Browser;
type BrowserContext = import('playwright-core').BrowserContext;
type Page = import('playwright-core').Page;
type CDPSession = import('playwright-core').CDPSession;

const IS_VERCEL = !!process.env.VERCEL;

interface ExecutorConfig {
  runId: string;
  siteId: string;
  baseUrl: string;
  steps: TestStep[];
  enableScreencast?: boolean;
  enableVideo?: boolean;
  enableTrace?: boolean;
}

interface StepResult {
  stepIndex: number;
  status: 'passed' | 'failed' | 'skipped';
  durationMs: number;
  screenshotPath?: string;
  error?: string;
  metadata?: any;
}

function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
async function humanDelay(min = 300, max = 900): Promise<void> {
  await new Promise((r) => setTimeout(r, rand(min, max)));
}
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

async function launchBrowser(): Promise<Browser> {
  if (IS_VERCEL) {
    const chromium = (await import('@sparticuz/chromium')).default;
    const { chromium: pwCore } = await import('playwright-core');
    return pwCore.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  try {
    const { chromium } = await import('playwright');
    return chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  } catch {
    const { chromium } = await import('playwright-core');
    return chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  }
}

async function saveScreenshot(page: Page, runId: string, siteId: string, fileName: string): Promise<string> {
  const buffer = await page.screenshot({ fullPage: false });
  if (IS_VERCEL) {
    const { put } = await import('@vercel/blob');
    const blob = await put('artifacts/' + siteId + '/' + runId + '/' + fileName, buffer, { access: 'public', contentType: 'image/png' });
    return blob.url;
  }
  const dir = 'artifacts/' + siteId + '/' + runId;
  await fs.mkdir(dir, { recursive: true });
  const path = dir + '/' + fileName;
  await fs.writeFile(path, buffer);
  return path;
}

async function saveJSON(data: object, runId: string, siteId: string, fileName: string): Promise<string> {
  const content = JSON.stringify(data, null, 2);
  if (IS_VERCEL) {
    const { put } = await import('@vercel/blob');
    const blob = await put('artifacts/' + siteId + '/' + runId + '/' + fileName, content, { access: 'public', contentType: 'application/json' });
    return blob.url;
  }
  const dir = 'artifacts/' + siteId + '/' + runId;
  await fs.mkdir(dir, { recursive: true });
  const path = dir + '/' + fileName;
  await fs.writeFile(path, content);
  return path;
}

export { ExecutorConfig, StepResult };
