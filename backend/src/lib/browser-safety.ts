import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { BrowserContext, Locator } from "playwright";
import { HttpUrlSchema, isDangerousAction, isSameDomain } from "./validators";

export class BrowserPolicyError extends Error {}

const blocked4 = new BlockList();
const blocked6 = new BlockList();
for (const [network, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3]] as const) blocked4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [["::", 96], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64], ["2001::", 32], ["2001:db8::", 32], ["2002::", 16], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) blocked6.addSubnet(network, prefix, "ipv6");

export function isPublicAddress(address: string) {
  const family = isIP(address);
  return family === 4 ? !blocked4.check(address, "ipv4") : family === 6 && !blocked6.check(address, "ipv6");
}

export function createUrlPolicy() {
  const cache = new Map<string, Promise<void>>();
  return async (value: string) => {
    if (!HttpUrlSchema.safeParse(value).success) throw new BrowserPolicyError("Invalid HTTP destination");
    const host = new URL(value).hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "");
    if (host === "localhost" || /\.(localhost|local|internal)$/.test(host)) throw new BrowserPolicyError("Non-public destination blocked");
    if (isIP(host)) {
      if (!isPublicAddress(host)) throw new BrowserPolicyError("Non-public destination blocked");
      return;
    }
    let pending = cache.get(host);
    if (!pending) {
      if (cache.size >= 128) throw new BrowserPolicyError("Destination limit exceeded");
      pending = lookup(host, { all: true }).then((addresses) => {
        if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new BrowserPolicyError("Non-public destination blocked");
      });
      cache.set(host, pending);
    }
    await pending;
  };
}

export async function installBrowserGuards(context: BrowserContext, baseUrl: string, onBlocked: (reason: string) => void, proxyCredentials?: { username: string; password: string }) {
  const validateUrl = createUrlPolicy();
  await validateUrl(baseUrl);
  let pageCount = 0;
  context.on("page", (page) => {
    page.on("dialog", (dialog) => { void dialog.dismiss().catch(() => {}); });
    page.on("download", (download) => { void download.cancel().catch(() => {}); });
    if (++pageCount > 1) void page.close().catch(() => {});
  });
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.route("**/*", async (route) => {
    if (route.request().isNavigationRequest() && route.request().frame().parentFrame()) {
      await route.abort().catch(() => {});
      return;
    }
    await route.continue().catch(() => {});
  });
  const page = await context.newPage();
  const guard = await context.newCDPSession(page);
  let requests = 0;
  const authenticated = new Set<string>();
  guard.on("Fetch.authRequired", ({ requestId, authChallenge }) => {
    const authenticate = proxyCredentials && authChallenge.source === "Proxy" && !authenticated.has(requestId);
    authenticated.add(requestId);
    void guard.send("Fetch.continueWithAuth", { requestId, authChallengeResponse: authenticate ? { response: "ProvideCredentials", ...proxyCredentials } : { response: "CancelAuth" } }).catch(() => {});
  });
  // CDP intercepts redirect hops as well as initial requests.
  guard.on("Fetch.requestPaused", (event) => {
    void (async () => {
      try {
        if (++requests > 2000) throw new BrowserPolicyError("Request limit exceeded");
        if (!["GET", "HEAD"].includes(event.request.method)) throw new BrowserPolicyError("State-changing requests blocked");
        await validateUrl(event.request.url);
        if (event.resourceType === "Document") {
          if (!isSameDomain(baseUrl, event.request.url)) throw new BrowserPolicyError("Navigation outside the target domain blocked");
          if (isDangerousAction(decodeURIComponent(new URL(event.request.url).pathname))) throw new BrowserPolicyError("Unsafe navigation blocked");
        }
        await guard.send("Fetch.continueRequest", { requestId: event.requestId });
      } catch (error) {
        onBlocked(error instanceof Error ? error.message : "Request blocked");
        await guard.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" }).catch(() => {});
      }
    })();
  });
  await guard.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }], handleAuthRequests: true });
  return { page, guard };
}

export async function validateInteraction(element: Locator, action: string, baseUrl: string) {
  const text = (await element.textContent())?.slice(0, 500) || "";
  const label = await element.getAttribute("aria-label") || "";
  const href = await element.getAttribute("href");
  const type = await element.getAttribute("type");
  if (isDangerousAction(`${text} ${label}`, `${href || ""} ${type || ""}`)) throw new BrowserPolicyError("Unsafe interaction skipped");
  if (await element.getAttribute("download") !== null) throw new BrowserPolicyError("Download skipped");
  if (action === "type") {
    if (type !== "search") throw new BrowserPolicyError("Only search inputs may be filled");
    return;
  }
  if (href !== null) {
    if (!isSameDomain(baseUrl, new URL(href, baseUrl).href)) throw new BrowserPolicyError("External link skipped");
    return;
  }
  if (await element.locator("xpath=ancestor-or-self::form").count()) throw new BrowserPolicyError("Form control skipped");
  const semantic = await element.getAttribute("aria-expanded") !== null || await element.getAttribute("aria-controls") !== null || await element.getAttribute("role") === "tab" || await element.locator("xpath=self::summary").count() > 0;
  if (!semantic || !["click", "hover"].includes(action)) throw new BrowserPolicyError("No verifiable read-only action for this control");
}
