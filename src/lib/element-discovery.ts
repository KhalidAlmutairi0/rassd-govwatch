// src/lib/element-discovery.ts
import { Page } from "playwright";

export interface DiscoveredElement {
  selector: string;          // CSS selector
  type: 'button' | 'link' | 'dropdown' | 'tab' | 'modal-trigger' | 'form-input' | 'toggle' | 'accordion' | 'carousel-control' | 'menu-item';
  text: string;              // visible text
  textAr?: string;           // Arabic text if present
  href?: string;             // for links
  isVisible: boolean;
  boundingBox: { x: number; y: number; width: number; height: number };
  action: 'click' | 'hover' | 'type' | 'select' | 'toggle';
  isSafe: boolean;           // false for destructive actions
  parentSection?: string;    // which section of the page (header, nav, hero, footer, etc.)
}

// Safety filter — NEVER interact with these patterns
const UNSAFE_PATTERNS = [
  /delete/i, /remove/i, /حذف/i,           // Destructive
  /submit/i, /إرسال/i, /تقديم/i,         // Form submissions
  /login/i, /sign.?in/i, /تسجيل.*دخول/i, // Authentication
  /logout/i, /sign.?out/i, /خروج/i,       // Logout
  /pay/i, /دفع/i, /شراء/i,               // Payment
  /download/i, /تحميل/i,                  // Downloads
  /nafath/i, /نفاذ/i,                     // National SSO
  /register/i, /signup/i, /تسجيل/i,      // Registration
];

export async function discoverElements(page: Page, baseUrl: string): Promise<DiscoveredElement[]> {
  console.log("[Element Discovery] Starting element discovery...");

  const elements: DiscoveredElement[] = [];

  // Define selectors for different element types
  const selectorConfigs = [
    {
      selectors: ['nav a[href]', 'header a[href]:not([href*="login"]):not([href*="logout"])'],
      type: 'link' as const,
      action: 'click' as const,
      section: 'nav',
    },
    {
      selectors: ['button:not([type="submit"]):not([disabled])', '[role="button"]:not([disabled])'],
      type: 'button' as const,
      action: 'click' as const,
      section: 'body',
    },
    {
      selectors: ['a[href]:not(nav a):not(header a)'],
      type: 'link' as const,
      action: 'click' as const,
      section: 'content',
    },
    {
      selectors: ['[role="tab"]', '[data-toggle="tab"]', '.tab:not(.active)'],
      type: 'tab' as const,
      action: 'click' as const,
      section: 'tabs',
    },
    {
      selectors: ['[role="menuitem"]', '.menu-item', '.dropdown-item'],
      type: 'menu-item' as const,
      action: 'click' as const,
      section: 'menu',
    },
    {
      selectors: ['[data-toggle="dropdown"]', '[data-bs-toggle="dropdown"]', '.dropdown-toggle'],
      type: 'dropdown' as const,
      action: 'click' as const,
      section: 'dropdown',
    },
    {
      selectors: ['[data-toggle="modal"]', '[data-bs-toggle="modal"]', '[data-target*="modal"]'],
      type: 'modal-trigger' as const,
      action: 'click' as const,
      section: 'modal',
    },
    {
      selectors: ['[class*="accordion"]  button', '[data-toggle="collapse"]'],
      type: 'accordion' as const,
      action: 'click' as const,
      section: 'accordion',
    },
    {
      selectors: ['[class*="carousel"] .next, [class*="carousel"] .prev', '[class*="slider"] button'],
      type: 'carousel-control' as const,
      action: 'click' as const,
      section: 'carousel',
    },
  ];

  // Discover elements for each type
  for (const config of selectorConfigs) {
    for (const selector of config.selectors) {
      try {
        const elementHandles = await page.$$(selector);

        for (const handle of elementHandles) {
          try {
            // Get element properties
            const isVisible = await handle.isVisible().catch(() => false);
            if (!isVisible) continue;

            const text = await handle.textContent().catch(() => '');
            const trimmedText = text?.trim() || '';
            if (!trimmedText || trimmedText.length > 100) continue; // Skip empty or very long text

            const boundingBox = await handle.boundingBox();
            if (!boundingBox || boundingBox.width === 0 || boundingBox.height === 0) continue;

            // Get href for links
            let href: string | undefined;
            if (config.type === 'link') {
              href = (await handle.getAttribute('href').catch(() => undefined)) ?? undefined;
              // Skip external links and javascript: links
              if (href) {
                if (href.startsWith('javascript:') || href.startsWith('#')) continue;
                if (!href.startsWith('/') && !href.includes(new URL(baseUrl).hostname)) continue;
              }
            }

            // Determine parent section
            const parentSection = await determineParentSection(handle);

            // Build unique selector
            const uniqueSelector = await buildUniqueSelector(page, handle);

            // Safety check
            const isSafe = !UNSAFE_PATTERNS.some(pattern =>
              pattern.test(trimmedText) ||
              (href && pattern.test(href)) ||
              pattern.test(uniqueSelector)
            );

            // Detect Arabic text
            const hasArabic = /[\u0600-\u06FF]/.test(trimmedText);

            elements.push({
              selector: uniqueSelector,
              type: config.type,
              text: trimmedText,
              textAr: hasArabic ? trimmedText : undefined,
              href,
              isVisible: true,
              boundingBox,
              action: config.action,
              isSafe,
              parentSection: parentSection || config.section,
            });

          } catch (error) {
            // Skip this element if we can't get its properties
            continue;
          }
        }
      } catch (error) {
        // Skip this selector if it fails
        continue;
      }
    }
  }

  // Deduplicate elements by position (same x, y, width, height)
  const deduped = deduplicateElements(elements);

  // Sort by: nav first, then buttons, then links, then others
  const sorted = sortElements(deduped);

  // Limit to 100 elements
  const limited = sorted.slice(0, 100);

  console.log(`[Element Discovery] Found ${limited.length} interactive elements (${limited.filter(e => e.isSafe).length} safe)`);

  return limited.filter(e => e.isSafe); // Only return safe elements
}

async function determineParentSection(handle: any): Promise<string | undefined> {
  try {
    const parentSelectors = [
      'header',
      'nav',
      'footer',
      '[role="navigation"]',
      '[role="banner"]',
      '[role="contentinfo"]',
      'aside',
      'main',
    ];

    for (const selector of parentSelectors) {
      const parent = await handle.evaluateHandle((el: any, sel: string) => {
        return el.closest(sel);
      }, selector);

      if (parent) {
        return selector.replace('[role="', '').replace('"]', '');
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}

async function buildUniqueSelector(page: Page, handle: any): Promise<string> {
  try {
    // Try to build a unique selector using id, class, or text
    const selector = await page.evaluate((el: any) => {
      // Try ID first
      if (el.id) return `#${el.id}`;

      // Try class + tag
      if (el.className && typeof el.className === 'string') {
        const classes = el.className.trim().split(/\s+/).filter((c: string) => c.length > 0);
        if (classes.length > 0) {
          return `${el.tagName.toLowerCase()}.${classes[0]}`;
        }
      }

      // Try data attributes
      if (el.dataset && Object.keys(el.dataset).length > 0) {
        const firstKey = Object.keys(el.dataset)[0];
        return `[data-${firstKey}="${el.dataset[firstKey]}"]`;
      }

      // Fall back to tag name + text content (partial)
      const text = el.textContent?.trim().substring(0, 20) || '';
      if (text) {
        return `${el.tagName.toLowerCase()}:has-text("${text}")`;
      }

      // Last resort: tag name + nth-child
      const parent = el.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(el);
        return `${el.tagName.toLowerCase()}:nth-child(${index + 1})`;
      }

      return el.tagName.toLowerCase();
    }, handle);

    return selector;
  } catch {
    return 'unknown';
  }
}

function deduplicateElements(elements: DiscoveredElement[]): DiscoveredElement[] {
  const seen = new Map<string, DiscoveredElement>();

  for (const element of elements) {
    // Create a key based on position and text
    const key = `${Math.round(element.boundingBox.x)},${Math.round(element.boundingBox.y)}-${element.text}`;

    if (!seen.has(key)) {
      seen.set(key, element);
    }
  }

  return Array.from(seen.values());
}

function sortElements(elements: DiscoveredElement[]): DiscoveredElement[] {
  const priority: Record<string, number> = {
    'link': 1,      // Navigation links first
    'button': 2,    // Then buttons
    'tab': 3,       // Then tabs
    'dropdown': 4,  // Then dropdowns
    'menu-item': 5,
    'modal-trigger': 6,
    'accordion': 7,
    'carousel-control': 8,
    'toggle': 9,
    'form-input': 10,
  };

  return elements.sort((a, b) => {
    // Sort by parent section first (nav and header first)
    if (a.parentSection === 'nav' && b.parentSection !== 'nav') return -1;
    if (b.parentSection === 'nav' && a.parentSection !== 'nav') return 1;
    if (a.parentSection === 'header' && b.parentSection !== 'header') return -1;
    if (b.parentSection === 'header' && a.parentSection !== 'header') return 1;

    // Then by type priority
    const aPriority = priority[a.type] || 999;
    const bPriority = priority[b.type] || 999;
    if (aPriority !== bPriority) return aPriority - bPriority;

    // Finally by Y position (top to bottom)
    return a.boundingBox.y - b.boundingBox.y;
  });
}
