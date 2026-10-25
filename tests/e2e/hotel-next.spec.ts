import { writeFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { availability, property, stayQuery } from "./fixtures/hotel-data";

for (const mobile of [false, true]) test(`real Next router stays responsive without navigation on ${mobile ? "throttled mobile" : "desktop"}`, async ({ page }, testInfo) => {
  if (mobile) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await page.addInitScript(() => {
    const metrics = { inputPaintMs: [] as number[], lcp: 0, cls: 0, longTasks: 0 };
    Object.assign(window, { hotelMetrics: metrics });
    document.addEventListener("click", event => {
      const button = (event.target as Element).closest("button");
      if (!button || !/Increase|Decrease|Hourly|Overnight/.test(button.getAttribute("aria-label") ?? button.textContent ?? "")) return;
      const start = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => metrics.inputPaintMs.push(performance.now() - start)));
    }, true);
    new PerformanceObserver(list => { for (const entry of list.getEntries()) metrics.lcp = entry.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(list => { for (const entry of list.getEntries()) { const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean }; if (!shift.hadRecentInput) metrics.cls += shift.value; } }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(list => { metrics.longTasks += list.getEntries().length; }).observe({ type: "longtask", buffered: true });
  });
  await page.route("**/api/auth/me", route => route.fulfill({ status: 401, json: { error: "UNAUTHENTICATED" } }));
  await page.route("**/api/properties/garden", route => route.fulfill({ json: { property } }));
  await page.route("**/api/properties/garden/reviews?**", route => route.fulfill({ json: { reviews: [], total: 0, nextCursor: null } }));
  const seen: string[] = [];
  let release: (() => void) | undefined;
  await page.route("**/api/properties/garden/bookable?**", async route => {
    seen.push(route.request().url());
    if (seen.length > 1) await new Promise<void>(resolve => { release = resolve; });
    await route.fulfill({ json: { ...availability(), serverNow: Date.now() } }).catch(() => {});
  });
  await page.goto(`/hotels/garden?${stayQuery}&roomTypeId=family&ratePlanId=flex`);
  await expect(page.getByRole("link", { name: "Reserve this room" })).toBeVisible();
  const navigations: string[] = [];
  const propertyReads: string[] = [];
  page.on("request", request => {
    if (request.isNavigationRequest() || (request.headers()["rsc"] === "1" && new URL(request.url()).pathname === "/hotels/garden")) navigations.push(request.url());
    if (new URL(request.url()).pathname === "/api/properties/garden") propertyReads.push(request.url());
  });
  await page.locator("#reserve").getByRole("button", { name: /^Guests/ }).click();
  await page.getByRole("button", { name: "Increase Adults" }).click();
  await page.getByRole("button", { name: "Increase Children" }).click();
  await expect(page.getByRole("button", { name: /^Guests/ })).toContainText("3 Adults, 1 Child");
  await expect(page.getByLabel("Checking price", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Increase Infants" })).toBeVisible();
  await expect.poll(() => seen.length).toBe(2);
  await page.getByRole("button", { name: "Decrease Adults" }).focus();
  await expect(page.getByRole("button", { name: "Decrease Adults" })).toBeFocused();
  release?.();
  await expect(page.getByRole("link", { name: "Reserve this room" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Decrease Adults" })).toBeFocused();

  await (mobile ? page.locator("#reserve").getByRole("button", { name: "Hourly stay", exact: true }) : page.getByRole("button", { name: "Hourly Stays", exact: true })).click();
  await expect(page.getByLabel("Arrival date", { exact: true })).toBeVisible();
  await expect(page.locator("#reserve").getByRole("button", { name: "Hourly stay", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => seen.length).toBe(3);
  await (mobile ? page.locator("#reserve").getByRole("button", { name: "Overnight stay", exact: true }) : page.getByRole("button", { name: "Overnight Stays", exact: true })).click();
  await expect(page.locator("#reserve").getByRole("button", { name: "Overnight stay", exact: true })).toHaveAttribute("aria-pressed", "true");
  release?.();
  expect(navigations).toEqual([]);
  expect(propertyReads).toEqual([]);

  await page.evaluate(() => history.pushState(null, "", `${location.pathname}?checkIn=2027-01-15&checkOut=2027-01-17&adults=4&children=0&infants=0`));
  await expect(page.locator("#reserve")).toContainText("4 Adults, 0 Children");
  release?.();
  await page.goBack();
  await expect(page.locator("#reserve")).toContainText("3 Adults, 1 Child");

  const metrics = await page.evaluate(() => ({
    ...(window as unknown as { hotelMetrics: object }).hotelMetrics,
    scripts: performance.getEntriesByType("resource").filter(entry => entry.name.includes(".js")).map(entry => ({ name: new URL(entry.name).pathname, bytes: (entry as PerformanceResourceTiming).transferSize })),
  }));
  const metricsPath = testInfo.outputPath("production-hotel-performance.json");
  await writeFile(metricsPath, JSON.stringify(metrics, null, 2));
  await testInfo.attach("production-hotel-performance.json", { path: metricsPath, contentType: "application/json" });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("hotel-production.png"), fullPage: true });
});
