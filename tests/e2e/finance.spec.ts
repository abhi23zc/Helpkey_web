import { emptyAccount } from "./fixtures/finance-account";
import { expect, test, type Page } from "@playwright/test";
import {
  DEFAULT_POLICY,
  EMPTY_PROFILE,
  profileReadiness,
  resolvePolicy,
  type FinanceOverrides,
  type FinanceProfile,
} from "../../lib/finance/domain";
async function fixtures(page: Page) {
  const state = {
    global: { policy: structuredClone(DEFAULT_POLICY), revision: 0 },
    overrides: {} as FinanceOverrides,
    overrideRevision: 0,
    profile: structuredClone(EMPTY_PROFILE),
    profileRevision: 0,
    contentRevision: 0,
    profileState: "draft",
    review: null as null | {
      notes: string;
      reviewedProfileRevision: number;
      reviewer: string;
      reviewedAt: string;
    },
    agreement: null as null | {
      revision: number;
      title: string;
      documentUrl: string;
    },
    acceptance: null as null | {
      agreementVersion: number;
      profileRevision: number;
      acceptedAt: string;
    },
    conflict: false,
  };
  const revisionFor = (action: string) => action === "global" ? state.global.revision
    : action === "publish" ? state.agreement?.revision ?? 0
    : action === "overrides" ? state.overrideRevision : state.profileRevision;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/accounts/transactions")) return route.fulfill({ json: { transactions: [], nextCursor: null } });
    if (url.pathname === "/api/admin/finance/accounts") return route.fulfill({ json: emptyAccount() });
    if (url.pathname === "/api/admin/finance/deductions") return route.fulfill({ json: { revision: 0, rules: [], active: [], accountingEnabled: false } });
    if (url.pathname === "/api/admin/properties")
      return route.fulfill({
        json: {
          properties: [{ id: "hotel", name: "Finance Hotel" }],
          hasMore: false,
          nextCursor: null,
        },
      });
    if (url.searchParams.get("history"))
      return route.fulfill({ json: { events: [], nextCursor: null } });
    if (route.request().method() === "POST") {
      const c = route.request().postDataJSON();
      if (state.conflict) {
        state.conflict = false;
        state.global.revision++;
        return route.fulfill({
          status: 409,
          json: {
            error: {
              code: "FINANCE_CONFLICT",
              message: "Finance information changed. Your draft is retained.",
            },
          },
        });
      }
      if (c.expectedRevision !== revisionFor(c.action) ||
          (c.action === "overrides" && c.globalRevision !== state.global.revision))
        return route.fulfill({ status: 409, json: {
          error: { code: "FINANCE_CONFLICT", message: "Finance information changed. Your draft is retained." },
        } });
      if (c.action === "global") {
        state.global.policy = c.policy;
        state.global.revision++;
      }
      if (c.action === "overrides") {
        state.overrides = c.overrides;
        state.overrideRevision++;
      }
      if (c.action === "profile") {
        state.profile = c.profile as FinanceProfile;
        state.profileRevision++;
        state.contentRevision = state.profileRevision;
        state.profileState = c.submit ? "submitted" : "draft";
        state.review = null;
      }
      if (c.action === "review") {
        state.profileRevision++;
        state.profileState = c.decision;
        state.review = {
          notes: c.notes,
          reviewedProfileRevision: state.contentRevision,
          reviewer: "founder",
          reviewedAt: new Date().toISOString(),
        };
      }
      if (c.action === "publish")
        state.agreement = {
          revision: (state.agreement?.revision ?? 0) + 1,
          title: c.title,
          documentUrl: c.documentUrl,
        };
      if (c.action === "accept") {
        state.profileRevision++;
        state.acceptance = {
          agreementVersion: c.agreementVersion,
          profileRevision: state.contentRevision,
          acceptedAt: new Date().toISOString(),
        };
      }
      return route.fulfill({ json: { revision: revisionFor(c.action) } });
    }
    return route.fulfill({
      json: {
        ...state,
        ...resolvePolicy(state.global.policy, state.overrides),
        readiness: profileReadiness(
          state.profile,
          !!state.agreement &&
            state.acceptance?.agreementVersion === state.agreement.revision &&
            state.acceptance?.profileRevision === state.contentRevision,
          state.profileState === "manually_reviewed",
        ),
        documents: [{ id: "doc", label: "PAN document" }],
        invoicePrefill: null,
      },
    });
  });
  return state;
}
test("founder saves global settings, customizes a single setting and restores inheritance", async ({
  page,
}) => {
  const state = await fixtures(page);
  await page.goto("/admin/finance");
  await page.getByLabel("Room commission", { exact: true }).fill("12.5");
  await page.getByLabel("Reason for change").fill("Updated commercial terms");
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(state.global.policy.roomCommissionBps).toBe(1250);
  await page.getByLabel("Finance scope").selectOption("hotel");
  const room = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", {
        name: "Room commission (%)",
        exact: true,
      }),
    })
    .last();
  await room.getByLabel("Use global settings").uncheck();
  await page.getByLabel("Room commission", { exact: true }).fill("5");
  await page.getByLabel("Reason for change").fill("Hotel negotiated rate");
  await page.getByRole("button", { name: "Save hotel overrides" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(state.overrides).toEqual({ roomCommissionBps: 500 });
  await room.getByLabel("Use global settings").check();
  await page.getByRole("button", { name: "Save hotel overrides" }).click();
  await expect(page.getByLabel("Room commission", { exact: true })).toHaveValue(
    "12.5",
  );
  expect(state.overrides).toEqual({});
});
test("owner submits, founder requests changes and reviews, owner accepts published terms", async ({
  page,
}) => {
  const state = await fixtures(page);
  await page.goto("/partner/finance");
  for (const [label, value] of [
    ["Legal payee name", "Hotel Ltd"],
    ["Business address", "Mumbai"],
    ["Business email", "owner@example.com"],
    ["Business phone", "9876543210"],
    ["PAN", "ABCDE1234F"],
  ])
    await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByLabel("PAN document", { exact: true }).check();
  await page.getByLabel("Reason for change").fill("Initial finance submission");
  await page.getByRole("button", { name: "Submit profile" }).click();
  await expect(page.getByText(/Status: submitted/)).toBeVisible();
  await page.goto("/admin/finance");
  await page.getByLabel("Finance scope").selectOption("hotel");
  await page.getByLabel("Reason for change").fill("Finance profile review");
  await page.getByLabel("Review notes").fill("Please confirm address");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText(/Status: changes requested/)).toBeVisible();
  await page.goto("/partner/finance");
  await expect(
    page.getByText("Review feedback: Please confirm address"),
  ).toBeVisible();
  await page.getByLabel("Business address").fill("Pune");
  await page.getByLabel("Reason for change").fill("Corrected address");
  await page.getByRole("button", { name: "Submit profile" }).click();
  await expect(page.getByText(/Status: submitted/)).toBeVisible();
  await page.goto("/admin/finance");
  await page.getByLabel("Finance scope").selectOption("hotel");
  await page.getByLabel("Reason for change").fill("Documents checked");
  await page.getByLabel("Review notes").fill("Profile reviewed");
  await page.getByRole("button", { name: "Mark manually reviewed" }).click();
  await expect(page.getByText(/Status: manually reviewed/)).toBeVisible();
  await page.getByLabel("Finance scope").selectOption("");
  await page.getByLabel("Reason for change").fill("Publish finance agreement");
  await page.getByLabel("Agreement title").fill("Hotel terms v1");
  await page
    .getByLabel("HTTPS document link")
    .fill("https://example.com/terms");
  await page.getByRole("button", { name: "Publish agreement version" }).click();
  await expect(
    page.getByRole("link", { name: "Hotel terms v1" }),
  ).toBeVisible();
  await page.goto("/partner/finance");
  await page.getByLabel("Reason for change").fill("Accept hotel terms");
  await page
    .getByRole("button", { name: "Accept published agreement" })
    .click();
  await expect(
    page.getByText("Agreement: Accepted", { exact: true }),
  ).toBeVisible();
  expect(state.acceptance?.agreementVersion).toBe(1);
  await expect(
    page.getByText("Provider verification: Not started", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Payouts: Not enabled/)).toBeVisible();
});
test("stale form preserves the draft for explicit review and recovery", async ({
  page,
}) => {
  const state = await fixtures(page);
  await page.goto("/admin/finance");
  await page.getByLabel("Room commission", { exact: true }).fill("9");
  await page.getByLabel("Reason for change").fill("Reviewed retained draft");
  state.conflict = true;
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(
    page.getByText(/Your draft is retained. Current revisions/),
  ).toBeVisible();
  await expect(page.getByLabel("Room commission", { exact: true })).toHaveValue(
    "9",
  );
  await page
    .getByRole("button", { name: "Use current revisions for retained draft" })
    .click();
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(state.global.policy.roomCommissionBps).toBe(900);
});
test("publishing an agreement preserves an unsaved policy and its stale revision", async ({ page }) => {
  const state = await fixtures(page);
  await page.goto("/admin/finance");
  await page.getByLabel("Room commission", { exact: true }).fill("9");
  await page.getByLabel("Reason for change").fill("Publish new agreement");
  await page.getByLabel("Agreement title").fill("Hotel terms");
  await page.getByLabel("HTTPS document link").fill("https://example.com/terms");
  // Another founder changes the policy while this founder publishes terms.
  state.global.revision++;
  await page.getByRole("button", { name: "Publish agreement version" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByLabel("Room commission", { exact: true })).toHaveValue("9");
  expect(state.global.policy.roomCommissionBps).toBe(1000);
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(page.getByText(/Your draft is retained. Current revisions/)).toBeVisible();
  await page.getByRole("button", { name: "Use current revisions for retained draft" }).click();
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(state.global.policy.roomCommissionBps).toBe(900);
});
test("saving settings preserves agreement edits and allows subsequent saves", async ({ page }) => {
  const state = await fixtures(page);
  await page.goto("/admin/finance");
  await page.getByLabel("Agreement title").fill("Draft hotel terms");
  await page.getByLabel("HTTPS document link").fill("https://example.com/terms");
  await page.getByLabel("Room commission", { exact: true }).fill("9");
  await page.getByLabel("Reason for change").fill("Updated settings");
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await expect(page.getByLabel("Agreement title")).toHaveValue("Draft hotel terms");
  await expect(page.getByLabel("HTTPS document link")).toHaveValue("https://example.com/terms");
  await page.getByRole("button", { name: "Publish agreement version" }).click();
  await expect(page.getByRole("link", { name: "Draft hotel terms" })).toBeVisible();
  await page.getByLabel("Room commission", { exact: true }).fill("8");
  await page.getByRole("button", { name: "Save global settings" }).click();
  await expect(page.getByLabel("Room commission", { exact: true })).toHaveValue("8");
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(state.global.policy.roomCommissionBps).toBe(800);
});
test("reviewing a profile preserves unsaved hotel overrides", async ({ page }) => {
  const state = await fixtures(page);
  state.profileState = "submitted";
  await page.goto("/admin/finance");
  await page.getByLabel("Finance scope").selectOption("hotel");
  const room = page.locator("section").filter({ has: page.getByRole("heading", { name: "Room commission (%)", exact: true }) }).last();
  await room.getByLabel("Use global settings").uncheck();
  await page.getByLabel("Room commission", { exact: true }).fill("5");
  await page.getByLabel("Reason for change").fill("Review profile with pending policy edit");
  await page.getByLabel("Review notes").fill("Please complete business details");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expect(page.getByText(/Status: changes requested/)).toBeVisible();
  await expect(page.getByLabel("Room commission", { exact: true })).toHaveValue("5");
  expect(state.overrides).toEqual({});
  await page.getByRole("button", { name: "Save hotel overrides" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  expect(state.overrides).toEqual({ roomCommissionBps: 500 });
});
test("owner can remove an unavailable supporting document and select its replacement", async ({ page }) => {
  const state = await fixtures(page);
  state.profile = {
    ...EMPTY_PROFILE, legalPayeeName: "Hotel Ltd", businessAddress: "Mumbai",
    businessEmail: "hotel@example.com", businessPhone: "9876543210",
    pan: "ABCDE1234F", documentIds: ["removed-document"],
  };
  await page.goto("/partner/finance");
  const unavailable = page.getByLabel("Unavailable document (removed-document) — uncheck to remove");
  await unavailable.click();
  await expect(unavailable).toHaveCount(0);
  await page.getByLabel("PAN document", { exact: true }).check();
  await page.getByLabel("Reason for change").fill("Replace removed document");
  await page.getByRole("button", { name: "Submit profile" }).click();
  await expect(page.getByText(/Status: submitted/)).toBeVisible();
  expect(state.profile.documentIds).toEqual(["doc"]);
});
