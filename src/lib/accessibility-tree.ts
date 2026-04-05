// src/lib/accessibility-tree.ts
// Accessibility Tree Formatter — Converts Playwright accessibility snapshot to readable format
// This gives us structured page representation similar to Playwright MCP's browser_snapshot

import { Page } from "playwright";

export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  children?: AccessibilityNode[];
}

/**
 * Get accessibility tree from page (like Playwright MCP's browser_snapshot)
 */
export async function getAccessibilityTree(page: Page): Promise<AccessibilityNode | null> {
  try {
    const snapshot = await page.accessibility.snapshot();
    return snapshot;
  } catch (error) {
    console.error("Failed to get accessibility tree:", error);
    return null;
  }
}

/**
 * Format accessibility tree into human-readable text for AI analysis
 */
export function formatAccessibilityTree(tree: AccessibilityNode | null, depth = 0, maxDepth = 5): string {
  if (!tree || depth > maxDepth) return "";

  const indent = "  ".repeat(depth);
  const parts: string[] = [];

  // Format current node
  let nodeLine = `${indent}- ${tree.role}`;

  if (tree.name) {
    nodeLine += ` "${tree.name.substring(0, 60)}${tree.name.length > 60 ? '...' : ''}"`;
  }

  if (tree.value && tree.role === "textbox") {
    nodeLine += ` (value: "${tree.value}")`;
  }

  if (tree.description) {
    nodeLine += ` [${tree.description}]`;
  }

  parts.push(nodeLine);

  // Process children
  if (tree.children && tree.children.length > 0) {
    // Limit children to prevent overwhelming the AI
    const childrenToShow = tree.children.slice(0, 50);

    for (const child of childrenToShow) {
      const childText = formatAccessibilityTree(child, depth + 1, maxDepth);
      if (childText) {
        parts.push(childText);
      }
    }

    if (tree.children.length > 50) {
      parts.push(`${indent}  ... (${tree.children.length - 50} more children omitted)`);
    }
  }

  return parts.join("\n");
}

/**
 * Extract interactive elements from accessibility tree
 * Returns a simplified list of clickable/interactive items
 */
export function extractInteractiveElements(tree: AccessibilityNode | null): Array<{
  role: string;
  name: string;
  path: string;
}> {
  const elements: Array<{ role: string; name: string; path: string }> = [];

  const interactiveRoles = [
    "button", "link", "menuitem", "tab", "checkbox", "radio",
    "textbox", "searchbox", "combobox", "listbox", "option",
    "switch", "slider", "spinbutton", "scrollbar"
  ];

  function traverse(node: AccessibilityNode | null, path: string = "") {
    if (!node) return;

    const currentPath = path ? `${path} > ${node.role}` : node.role;

    if (interactiveRoles.includes(node.role) && node.name) {
      elements.push({
        role: node.role,
        name: node.name,
        path: currentPath
      });
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child, currentPath);
      }
    }
  }

  traverse(tree);
  return elements;
}

/**
 * Get element statistics from accessibility tree
 */
export function getAccessibilityStats(tree: AccessibilityNode | null): {
  totalElements: number;
  byRole: Record<string, number>;
  interactiveCount: number;
  textElements: number;
} {
  const stats = {
    totalElements: 0,
    byRole: {} as Record<string, number>,
    interactiveCount: 0,
    textElements: 0
  };

  const interactiveRoles = ["button", "link", "menuitem", "tab", "textbox", "searchbox"];

  function traverse(node: AccessibilityNode | null) {
    if (!node) return;

    stats.totalElements++;
    stats.byRole[node.role] = (stats.byRole[node.role] || 0) + 1;

    if (interactiveRoles.includes(node.role)) {
      stats.interactiveCount++;
    }

    if (node.role === "text" || node.role === "StaticText") {
      stats.textElements++;
    }

    if (node.children) {
      for (const child of node.children) {
        traverse(child);
      }
    }
  }

  traverse(tree);
  return stats;
}
