import { describe, expect, it } from "vitest";
import { approvalReadiness } from "@/lib/admin/approval-readiness";
import { canEditKyc } from "@/lib/partner/kyc-policy";
import { lifecycleActions } from "@/lib/admin/lifecycle";

const property = { status: "pending_review", approvalStatus: "pending", coverMediaId: "outside" };
const rooms = [{ id: "double", name: "Double" }, { id: "suite", name: "Suite" }, { id: "single", name: "Single" }];
const media = [{ id: "outside", category: "exterior" }, ...rooms.flatMap(room => ["room", "bathroom"].map(category => ({ id: `${room.id}_${category}`, category, roomTypeId: room.id })))].map(asset => ({ ...asset, kind: "property_image", moderationStatus: "approved" }));
const docs = ["pan", "government_id_front", "government_id_back"].map(documentType => ({ documentType, status: "approved" }));

describe("admin onboarding approval evidence", () => {
  it("requires approved bedroom/bathroom coverage for each room and seven photos for three rooms", () => {
    expect(approvalReadiness(property, media, rooms, docs).ready).toBe(true);
    const missing = approvalReadiness(property, media.filter(asset => asset.id !== "suite_bathroom"), rooms, docs);
    expect(missing.ready).toBe(false);
    expect(missing.blockers).toContain("Approved photos: Suite · Bathroom photo");
    expect(missing.blockers).toContain("Approved photos: At least 7 photos");
    expect(missing.blockers).toEqual(missing.checks.filter(check => !check.complete).map(check => check.label));
  });
  it("does not count pending or rejected photos, or a cover without approved evidence", () => {
    const check = approvalReadiness(property, media.map(asset => asset.id === "outside" ? { ...asset, moderationStatus: "pending" } : asset), rooms, docs);
    expect(check.blockers).toContain("Approved photos: Exterior / entrance photo");
    expect(check.blockers).toContain("Approved photos: Choose a cover photo");
  });
  it("requires all three identity statuses but leaves GST optional", () => {
    expect(approvalReadiness(property, media, rooms, [...docs, { documentType: "gst", status: "rejected" }]).ready).toBe(true);
    expect(approvalReadiness(property, media, rooms, docs.map(doc => doc.documentType === "pan" ? { ...doc, status: "pending" } : doc)).blockers).toContain("Approved document: pan");
  });
  it("supports document rejection, changes request, replacement, and resubmission states", () => {
    const rejected = docs.map(doc => doc.documentType === "pan" ? { ...doc, status: "rejected" } : doc);
    expect(approvalReadiness(property, media, rooms, rejected).ready).toBe(false);
    expect(canEditKyc(property)).toBe(false);
    expect(canEditKyc({ status: "draft", approvalStatus: "changes_requested" })).toBe(true);
    const replacement = rejected.map(doc => doc.documentType === "pan" ? { ...doc, status: "pending" } : doc);
    expect(approvalReadiness(property, media, rooms, replacement).ready).toBe(false);
    expect(approvalReadiness(property, media, rooms, docs).ready).toBe(true);
  });
  it.each(["not_submitted", "changes_requested", "rejected"])("allows draft KYC corrections for %s only", approvalStatus => {
    expect(canEditKyc({ status: "draft", approvalStatus })).toBe(true);
    expect(canEditKyc({ status: "active", approvalStatus })).toBe(false);
  });
  it.each(["pending", "approved"])("blocks draft KYC edits for %s", approvalStatus => {
    expect(canEditKyc({ status: "draft", approvalStatus })).toBe(false);
  });
  it("only permits valid lifecycle controls", () => {
    expect(lifecycleActions(property)).toEqual([]);
    expect(lifecycleActions({ status: "active", approvalStatus: "approved" })).toEqual(["pause", "archive"]);
    expect(lifecycleActions({ status: "paused", approvalStatus: "approved" })).toEqual(["resume", "archive"]);
    expect(lifecycleActions({ status: "paused", approvalStatus: "pending" })).toEqual([]);
    expect(lifecycleActions({ status: "draft", approvalStatus: "rejected" })).toEqual(["archive"]);
    expect(lifecycleActions({ status: "archived", approvalStatus: "approved" })).toEqual(["restore"]);
    expect(lifecycleActions({ status: "draft", approvalStatus: "pending" })).toEqual([]);
  });
});
