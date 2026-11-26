import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIRESTORE_EMULATOR_HOST || "",
  ) ||
  !/^(127\.0\.0\.1|localhost):\d+$/.test(
    process.env.FIREBASE_AUTH_EMULATOR_HOST || "",
  )
)
  throw new Error("Explicit localhost emulators required.");
const app = initializeApp(
  { projectId: "demo-helpkey-finance" },
  "finance-settings-browser",
);
const db = getFirestore(app),
  auth = getAuth(app);
const prefix = `finance-ui-${crypto.randomUUID()}`,
  hotel = `${prefix}-hotel`,
  otherHotel = `${prefix}-other`;
const uid = (role: string) => `${prefix}-${role}`;
const cookies = new Map<string, string>();
async function login(context: BrowserContext, role: string) {
  await context.clearCookies();
  await context.addCookies([
    {
      name: "helpkey_session",
      value: cookies.get(role)!,
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}
function row(page: Page, label: string) {
  return page
    .getByRole("heading", { name: label, exact: true })
    .locator("../..");
}
async function edit(
  page: Page,
  name: "commission" | "guest payments" | "payouts & hotel dues",
) {
  const button = page.getByRole("button", {
    name: new RegExp(`^(Edit|Close) ${name}$`),
  });
  await expect(button).toBeVisible();
  if ((await button.getAttribute("aria-expanded")) === "false")
    await button.click();
}
test.beforeAll(async () => {
  for (const role of ["admin", "owner", "staff", "stranger"]) {
    const email = `${uid(role)}@example.test`;
    await auth.createUser({
      uid: uid(role),
      email,
      password: "EmulatorOnly123!",
      emailVerified: true,
    });
    await db
      .collection("users")
      .doc(uid(role))
      .set({
        uid: uid(role),
        fullName: `Finance ${role}`,
        email,
        emailVerified: true,
        roles: [role === "admin" ? "admin" : "partner"],
        accountStatus: "active",
        isActive: true,
      });
    const response = await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password: "EmulatorOnly123!",
          returnSecureToken: true,
        }),
      },
    );
    const payload = await response.json();
    cookies.set(
      role,
      await auth.createSessionCookie(payload.idToken, { expiresIn: 86400000 }),
    );
  }
  for (const [id, owner] of [
    [hotel, uid("owner")],
    [otherHotel, uid("stranger")],
  ]) {
    await db
      .collection("properties")
      .doc(id)
      .set({
        ownerId: owner,
        partnerId: owner,
        name: "Finance Test Hotel",
        slug: id,
        status: "active",
        approvalStatus: "approved",
        isBookable: true,
        address: { city: "Test City" },
        timezone: "Asia/Kolkata",
      });
    await db
      .collection("propertyMemberships")
      .doc(`${id}_${owner}`)
      .set({ propertyId: id, userId: owner, role: "owner", status: "active" });
  }
  await db
    .collection("propertyMemberships")
    .doc(`${hotel}_${uid("staff")}`)
    .set({
      propertyId: hotel,
      userId: uid("staff"),
      role: "manager",
      status: "active",
    });
});
test.afterAll(async () => {
  for (const id of ["global", `hotel_${hotel}`, `hotel_${otherHotel}`])
    await db.recursiveDelete(db.collection("hotelFinanceSettingsV1").doc(id));
  for (const role of ["admin", "owner", "staff", "stranger"]) {
    await db.collection("users").doc(uid(role)).delete();
    await auth.deleteUser(uid(role)).catch((error) => {
      if (error.code !== "auth/user-not-found") throw error;
    });
  }
  for (const id of [hotel, otherHotel])
    await db.collection("properties").doc(id).delete();
  for (const [id, role] of [
    [hotel, "owner"],
    [hotel, "staff"],
    [otherHotel, "stranger"],
  ])
    await db
      .collection("propertyMemberships")
      .doc(`${id}_${uid(role)}`)
      .delete();
});
test("admin setup, audit, inheritance, conflicts, owner read-only and isolation", async ({
  page,
  context,
  browser,
}) => {
  await login(context, "admin");
  await page.goto("/admin/finance-settings");
  await expect(page.getByText("Loading finance settings…")).toBeHidden();
  await expect(
    page.getByLabel("Marketplace commission (%)", { exact: true }),
  ).toHaveCount(0);
  await edit(page, "commission");
  const commission = row(page, "Marketplace commission (%)");
  await expect(commission).toContainText("Not configured");
  await commission
    .getByRole("button", { name: "Configure", exact: true })
    .click();
  await page
    .getByLabel("Marketplace commission (%)", { exact: true })
    .fill("10");
  await page
    .getByLabel("Reason for this save")
    .fill("Initial hotel commercial agreement");
  await page.getByRole("button", { name: "Save finance settings" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Finance settings saved" }),
  ).toContainText("Finance settings saved");
  await expect(commission).toContainText("10%");
  await expect(row(page, "Payout cycle")).toContainText("Not configured");
  await page
    .getByRole("button", { name: "Close commission", exact: true })
    .click();
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: "test-results/finance-settings/admin-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page
    .locator("summary")
    .filter({ hasText: /^Change history$/ })
    .click();
  await expect(
    page.getByText("Revision 1 · Finance admin", { exact: false }),
  ).toBeVisible();
  await page.getByText("Revision 1 · Finance admin", { exact: false }).click();
  await expect(
    page.getByText("Initial hotel commercial agreement", { exact: true }),
  ).toBeVisible();
  // A second administrator session changes defaults while the first keeps a draft.
  const secondContext = await browser.newContext();
  await login(secondContext, "admin");
  const second = await secondContext.newPage();
  await second.goto("/admin/finance-settings");
  await edit(second, "commission");
  await second
    .getByLabel("Marketplace commission (%)", { exact: true })
    .fill("11");
  await second.getByLabel("Reason for this save").fill("Updated agreement");
  await second.getByRole("button", { name: "Save finance settings" }).click();
  await expect(
    second.getByRole("status").filter({ hasText: "Finance settings saved" }),
  ).toContainText("Finance settings saved");
  await edit(page, "commission");
  await page
    .getByLabel("Marketplace commission (%)", { exact: true })
    .fill("12");
  await page
    .getByLabel("Reason for this save")
    .fill("Stale administrator edit");
  await page.getByRole("button", { name: "Save finance settings" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Finance settings changed" }),
  ).toContainText("Refresh and review");
  await expect(
    page.getByLabel("Marketplace commission (%)", { exact: true }),
  ).toHaveValue("12");
  const navigationDialog = page.waitForEvent("dialog");
  const navigationClick = page
    .getByRole("link", { name: "Properties", exact: true })
    .click();
  await (await navigationDialog).dismiss();
  await navigationClick;
  await expect(page).toHaveURL(/\/admin\/finance-settings$/);
  const refreshDialog = page.waitForEvent("dialog");
  const refreshClick = page
    .getByRole("button", { name: "Refresh saved settings" })
    .click();
  await (await refreshDialog).accept();
  await refreshClick;
  await expect(
    page.getByLabel("Marketplace commission (%)", { exact: true }),
  ).toHaveValue("11");
  await secondContext.close();
  // Hotel detail mounts the same editor with sparse overrides.
  await page.goto(`/admin/properties/${hotel}`);
  await page
    .locator("summary")
    .filter({ hasText: /^Finance Settings$/ })
    .click();
  await edit(page, "commission");
  const hotelCommission = row(page, "Marketplace commission (%)");
  await expect(hotelCommission).toContainText("Inherited from global defaults");
  await hotelCommission
    .getByRole("button", { name: "Override this setting" })
    .click();
  await edit(page, "commission");
  await page
    .getByLabel("Marketplace commission (%)", { exact: true })
    .fill("12");
  await page
    .getByLabel("Reason for this save")
    .fill("Hotel specific agreement");
  await page.getByRole("button", { name: "Save finance settings" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Finance settings saved" }),
  ).toContainText("Finance settings saved");
  await expect(hotelCommission).toContainText("Overridden for this hotel");
  await hotelCommission
    .getByRole("button", { name: "Return to global default" })
    .click();
  await page
    .getByLabel("Reason for this save")
    .fill("Restore global agreement");
  await page.getByRole("button", { name: "Save finance settings" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Finance settings saved" }),
  ).toContainText("Finance settings saved");
  await expect(hotelCommission).toContainText("Inherited from global defaults");
  const invalid = await page.request.patch(
    `/api/admin/properties/${hotel}/finance-settings`,
    {
      data: {
        changes: { commissionBasisPoints: -1 },
        remove: [],
        expectedRevision: 2,
        expectedGlobalRevision: 2,
        requestId: crypto.randomUUID(),
        reason: "Invalid input",
      },
    },
  );
  expect(invalid.status()).toBe(422);
  await login(context, "owner");
  await page.goto(`/partner/settings/finance?propertyId=${hotel}`);
  await expect(row(page, "Marketplace commission (%)")).toContainText("11%");
  await expect(
    page.getByRole("button", { name: "Save finance settings" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Only HelpKey administrators can change", { exact: false }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/finance-settings/owner-mobile.png",
    animations: "disabled",
  });
  await expect
    .poll(() =>
      page.evaluate(() => ({
        width: window.innerWidth,
        content: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll("body *")]
          .filter(
            (e) => e.getBoundingClientRect().right > window.innerWidth + 1,
          )
          .slice(0, 10)
          .map((e) => `${e.tagName}.${e.className}`),
      })),
    )
    .toMatchObject({ width: 390, content: 390 });
  const privateResponse = await page.request.get(
    `/api/partner/properties/${otherHotel}/finance-settings`,
  );
  expect(privateResponse.status()).toBe(403);
  expect(
    (
      await page.request.patch(
        `/api/admin/properties/${hotel}/finance-settings`,
        { data: {} },
      )
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.patch(
        `/api/partner/properties/${hotel}/finance-settings`,
        { data: {} },
      )
    ).status(),
  ).toBe(405);
  await login(context, "staff");
  expect(
    (
      await page.request.get(
        `/api/partner/properties/${hotel}/finance-settings`,
      )
    ).status(),
  ).toBe(403);
});

test.describe("confirmed saves when refreshing settings fails", () => {
  test.beforeEach(async () => {
    for (const id of ["global", `hotel_${hotel}`])
      await db.recursiveDelete(db.collection("hotelFinanceSettingsV1").doc(id));
    await db
      .collection("hotelFinanceSettingsV1")
      .doc("global")
      .set({
        scope: "global",
        propertyId: null,
        revision: 1,
        settings: {
          commissionBasisPoints: 1000,
          commissionBasis: "rooms",
          eligibleExtraCategories: ["food_drinks"],
          guestPaymentOptions: ["full_online"],
          advance: { type: "percentage", basisPoints: 1000 },
          payoutCycle: "daily",
          payoutWeekday: "monday",
        },
      });
  });

  const refreshWarning =
    "Your settings were saved, but the latest settings could not be refreshed.";

  async function failReads(page: Page, url: string) {
    await page.route(url, (route) =>
      route.request().method() === "GET"
        ? route.abort("failed")
        : route.continue(),
    );
  }

  async function saveWithFailedRefresh(page: Page, reason: string) {
    await page.getByLabel("Reason for this save").fill(reason);
    await page.getByRole("button", { name: "Save finance settings" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Finance settings saved" }),
    ).toBeVisible();
    await expect(
      page.getByRole("alert").filter({ hasText: refreshWarning }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save finance settings" }),
    ).toBeDisabled();
    await expect(page.getByText("Unsaved edits", { exact: true })).toHaveCount(
      0,
    );
  }

  test("global saved values and dependent fields stay accurate and refresh can be retried", async ({
    page,
    context,
  }) => {
    await login(context, "admin");
    await page.goto("/admin/finance-settings");
    await expect(row(page, "Marketplace commission (%)")).toContainText("10%");
    await edit(page, "commission");
    await failReads(page, "**/api/admin/finance-settings");
    await page
      .getByLabel("Marketplace commission (%)", { exact: true })
      .fill("12");
    await page
      .getByLabel("Commission categories", { exact: true })
      .selectOption("rooms_and_extras");
    await edit(page, "payouts & hotel dues");
    await expect(page.getByLabel("Payout cycle", { exact: true })).toHaveValue(
      "daily",
    );
    await expect(
      page.getByLabel("Weekly payout day", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Payout cycle", { exact: true })
      .selectOption("weekly");
    await expect(
      page.getByLabel("Weekly payout day", { exact: true }),
    ).toBeVisible();
    await edit(page, "guest payments");
    await expect(
      page.getByLabel("Partial advance requirement type", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Partial advance; balance at hotel", { exact: true })
      .check();
    await saveWithFailedRefresh(
      page,
      "Save revised global terms during refresh outage",
    );
    await expect(row(page, "Marketplace commission (%)")).toContainText("12%");
    await expect(row(page, "Weekly payout day")).toContainText("Monday");
    await expect(row(page, "Partial advance requirement")).toContainText("10%");
    await expect(row(page, "Eligible extra categories")).not.toContainText(
      "Inactive",
    );
    expect(
      (await db.collection("hotelFinanceSettingsV1").doc("global").get()).get(
        "settings.commissionBasisPoints",
      ),
    ).toBe(1200);

    await page.unroute("**/api/admin/finance-settings");
    await page.getByRole("button", { name: "Refresh saved settings" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: refreshWarning }),
    ).toHaveCount(0);
    await expect(row(page, "Marketplace commission (%)")).toContainText("12%");
    await expect(
      page.getByRole("button", { name: "Save finance settings" }),
    ).toBeDisabled();
  });

  test("hotel override values and restored inheritance stay accurate without a reload", async ({
    page,
    context,
  }) => {
    await login(context, "admin");
    await page.goto(`/admin/properties/${hotel}`);
    await page
      .locator("summary")
      .filter({ hasText: /^Finance Settings$/ })
      .click();
    await edit(page, "commission");
    const commission = row(page, "Marketplace commission (%)");
    await expect(commission).toContainText("Inherited from global defaults");
    await failReads(page, `**/api/admin/properties/${hotel}/finance-settings`);
    await commission
      .getByRole("button", { name: "Override this setting" })
      .click();
    await page
      .getByLabel("Marketplace commission (%)", { exact: true })
      .fill("12");
    await saveWithFailedRefresh(
      page,
      "Save hotel override during refresh outage",
    );
    await expect(commission).toContainText("Overridden for this hotel");
    await expect(commission).toContainText("12%");

    await commission
      .getByRole("button", { name: "Return to global default" })
      .click();
    await saveWithFailedRefresh(
      page,
      "Restore inheritance during refresh outage",
    );
    await expect(commission).toContainText("Inherited from global defaults");
    await expect(commission).toContainText("10%");
    expect(
      (
        await db
          .collection("hotelFinanceSettingsV1")
          .doc(`hotel_${hotel}`)
          .get()
      ).get("settings"),
    ).toEqual({});
  });
  test("incomplete inactive drafts can be corrected without losing saved dependent settings", async ({
    page,
    context,
  }) => {
    await login(context, "admin");
    await page.goto("/admin/finance-settings");
    await edit(page, "guest payments");
    await page
      .getByLabel("Partial advance; balance at hotel", { exact: true })
      .check();
    await expect(
      page.getByLabel("Partial advance requirement value", { exact: true }),
    ).toHaveValue("10");
    await page
      .getByLabel("Partial advance requirement type", { exact: true })
      .selectOption("fixed");
    await page
      .getByLabel("Partial advance; balance at hotel", { exact: true })
      .uncheck();
    await expect(
      page.getByLabel("Partial advance requirement type", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Reason for this save")
      .fill("Remove the incomplete advance draft explicitly");
    await page.getByRole("button", { name: "Save finance settings" }).click();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "Review the highlighted settings" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Inactive — complete or remove this draft setting before saving.",
        { exact: true },
      ),
    ).toBeVisible();
    await row(page, "Partial advance requirement")
      .getByRole("button", { name: "Remove configuration", exact: true })
      .click();
    await page.getByRole("button", { name: "Save finance settings" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Finance settings saved" }),
    ).toBeVisible();
    const saved = (
      await db.collection("hotelFinanceSettingsV1").doc("global").get()
    ).get("settings");
    expect(saved.advance).toBeUndefined();
    expect(saved.payoutWeekday).toBe("monday");
  });
});
