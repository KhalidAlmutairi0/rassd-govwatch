// src/lib/element-tester.ts
import { Page } from "playwright";
import { promises as fs } from "fs";
import { DiscoveredElement } from "./element-discovery";

export interface ElementTestResult {
  element: DiscoveredElement;
  status: 'passed' | 'failed' | 'skipped' | 'warning';
  responseTimeMs: number;
  screenshotBefore: string;     // path to screenshot
  screenshotAfter: string;      // path to screenshot
  urlChanged: boolean;
  urlBefore: string;
  urlAfter: string;
  consoleErrors: string[];
  networkErrors: string[];
  domChanges: string;           // description of what changed
  error?: string;
}

export async function testElement(
  page: Page,
  element: DiscoveredElement,
  artifactDir: string,
  index: number,
  baseUrl: string
): Promise<ElementTestResult> {
  const startTime = Date.now();
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  console.log(`[Element Tester] Testing element ${index + 1}: ${element.type} "${element.text}"`);

  try {
    // Set up listeners for console and network errors
    const consoleListener = (msg: any) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    };

    const responseListener = async (response: any) => {
      if (response.status() >= 400) {
        networkErrors.push(`${response.request().method()} ${response.url()} → ${response.status()}`);
      }
    };

    page.on('console', consoleListener);
    page.on('response', responseListener);

    // 1. Scroll element into view
    try {
      await page.locator(element.selector).scrollIntoViewIfNeeded({ timeout: 5000 });
      await page.waitForTimeout(300); // Wait for smooth scrolling
    } catch (error) {
      return {
        element,
        status: 'failed',
        responseTimeMs: Date.now() - startTime,
        screenshotBefore: '',
        screenshotAfter: '',
        urlChanged: false,
        urlBefore: page.url(),
        urlAfter: page.url(),
        consoleErrors: [],
        networkErrors: [],
        domChanges: '',
        error: `Element not found or not scrollable: ${element.selector}`,
      };
    }

    // 2. Record current state
    const urlBefore = page.url();
    const domStateBefore = await page.evaluate(() => document.body.innerHTML.length);

    // 3. Take screenshot BEFORE
    const screenshotBefore = `${artifactDir}/element-${index}-before.png`;
    try {
      await page.screenshot({
        path: screenshotBefore,
        fullPage: false,
      });
    } catch {
      // Continue even if screenshot fails
    }

    // 4. Perform the action based on element type
    let actionSuccess = false;
    let actionError: string | undefined;

    try {
      switch (element.action) {
        case 'click':
          await page.locator(element.selector).click({ timeout: 5000 });
          actionSuccess = true;
          break;

        case 'hover':
          await page.locator(element.selector).hover({ timeout: 5000 });
          actionSuccess = true;
          break;

        case 'toggle':
          await page.locator(element.selector).click({ timeout: 5000 });
          actionSuccess = true;
          break;

        default:
          await page.locator(element.selector).click({ timeout: 5000 });
          actionSuccess = true;
      }
    } catch (error: any) {
      actionError = error.message;
      actionSuccess = false;
    }

    // 5. Wait for response (network activity or DOM changes)
    await page.waitForTimeout(1500);

    // 6. Take screenshot AFTER
    const screenshotAfter = `${artifactDir}/element-${index}-after.png`;
    try {
      await page.screenshot({
        path: screenshotAfter,
        fullPage: false,
      });
    } catch {
      // Continue even if screenshot fails
    }

    // 7. Compare state
    const urlAfter = page.url();
    const urlChanged = urlBefore !== urlAfter;
    const domStateAfter = await page.evaluate(() => document.body.innerHTML.length);
    const domChanged = domStateAfter !== domStateBefore;

    // 8. Determine DOM changes description
    let domChanges = '';
    if (urlChanged) {
      domChanges = `URL changed from ${urlBefore} to ${urlAfter}`;
    } else if (domChanged) {
      const diffPercent = Math.abs((domStateAfter - domStateBefore) / domStateBefore * 100);
      domChanges = `DOM changed by ${diffPercent.toFixed(1)}%`;
    } else {
      domChanges = 'No visible changes detected';
    }

    // 9. Navigate back if URL changed
    if (urlChanged) {
      try {
        // Check if we're still on the same domain
        if (isSameDomain(baseUrl, urlAfter)) {
          await page.goto(urlBefore, { waitUntil: 'domcontentloaded', timeout: 10000 });
          await page.waitForTimeout(1000); // Wait for page to stabilize
        } else {
          // If we navigated outside domain, this is a failure
          actionError = `Navigation went outside target domain: ${urlAfter}`;
          actionSuccess = false;
        }
      } catch (error: any) {
        console.warn(`[Element Tester] Could not navigate back: ${error.message}`);
      }
    }

    // 10. Determine status
    let status: 'passed' | 'failed' | 'warning' = 'passed';
    if (!actionSuccess) {
      status = 'failed';
    } else if (consoleErrors.length > 0 || networkErrors.length > 0) {
      status = 'warning';
    }

    // Clean up listeners
    page.off('console', consoleListener);
    page.off('response', responseListener);

    const responseTimeMs = Date.now() - startTime;

    return {
      element,
      status,
      responseTimeMs,
      screenshotBefore,
      screenshotAfter,
      urlChanged,
      urlBefore,
      urlAfter,
      consoleErrors,
      networkErrors,
      domChanges,
      error: actionError,
    };

  } catch (error: any) {
    const responseTimeMs = Date.now() - startTime;

    return {
      element,
      status: 'failed',
      responseTimeMs,
      screenshotBefore: '',
      screenshotAfter: '',
      urlChanged: false,
      urlBefore: page.url(),
      urlAfter: page.url(),
      consoleErrors,
      networkErrors,
      domChanges: '',
      error: error.message,
    };
  }
}

function isSameDomain(baseUrl: string, targetUrl: string): boolean {
  try {
    const base = new URL(baseUrl);
    const target = new URL(targetUrl);
    return (
      target.hostname === base.hostname ||
      target.hostname.endsWith('.' + base.hostname)
    );
  } catch {
    return false;
  }
}
