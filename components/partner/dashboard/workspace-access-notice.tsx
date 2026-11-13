"use client";

import Link from "next/link";
import { useId } from "react";
import {
  ArrowRight,
  CircleAlert,
  LifeBuoy,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { landing } from "@/lib/partner/pms/domain";
import type { Property } from "./types";

export function WorkspaceAccessNotice({
  property,
  reason,
}: {
  property: Property;
  reason: string | null;
}) {
  const headingId = useId();
  const blocked = Boolean(reason);
  const owner = property.role === "owner";
  const issues = blocked ? (property.operationsIssues ?? []) : [];
  const href = `${blocked ? "/partner/settings" : landing(property.role)}?${new URLSearchParams({ propertyId: property.id })}`;
  const action = blocked
    ? owner
      ? "Review PMS setup"
      : "View setup requirements"
    : "Open permitted workspace";
  const role = (property.role || "staff").replaceAll("_", " ");

  return (
    <section
      role="alert"
      aria-labelledby={headingId}
      className="overflow-hidden rounded-3xl border border-[#e4ded2] bg-white shadow-[0_12px_40px_-24px_rgba(6,18,36,0.22)]"
    >
      <div className="h-1 bg-[#c89b3c]" />
      <div className="p-5 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-[#e9ddc1] bg-[#fbf5e8] text-[#936c22]">
            {blocked ? (
              <ShieldCheck aria-hidden="true" className="h-7 w-7" />
            ) : (
              <LockKeyhole aria-hidden="true" className="h-6 w-6" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="rounded-full border border-[#e9ddc1] bg-[#fbf5e8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-[#805b18]">
                {blocked ? "Action required" : "Access restricted"}
              </span>
              <span className="break-words text-xs font-semibold text-slate-500">
                {property.name}
              </span>
            </div>
            <h2
              id={headingId}
              className="mt-3 text-xl font-bold tracking-tight text-[#061224] sm:text-2xl"
            >
              {blocked
                ? "Hotel operations unavailable"
                : "This page is not available for your role"}
            </h2>
            <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-slate-600">
              {reason ||
                `Your ${role} role does not include access to this page. Open your permitted workspace to continue.`}
            </p>
          </div>
        </div>

        {issues.length > 0 && (
          <div className="mt-7 border-t border-slate-100 pt-6">
            <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-[#061224]">
              What needs attention
            </h3>
            <ul className="mt-3 grid gap-3 lg:grid-cols-2">
              {issues.map((issue) => (
                <li
                  key={issue.id}
                  className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-[#fafbfC] p-4"
                >
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 h-4 w-4 shrink-0 text-[#a17a2c]"
                  />
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-[#061224]">
                      {issue.label}
                    </p>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-600">
                      {issue.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5 border-t border-slate-200/70 bg-[#f8f9fb] p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="min-w-0 max-w-xl">
          <h3 className="text-sm font-bold text-[#061224]">
            {blocked ? "How to restore access" : "Your next step"}
          </h3>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">
            {blocked
              ? owner
                ? "Open PMS setup to review the requirements and resolve the items needing attention. If Helpkey has restricted access, contact support for assistance."
                : "Ask the hotel owner to review its PMS status and complete the required steps. You can view the setup requirements or contact Helpkey support."
              : "Use the workspace assigned to your role. If you need additional access, ask the hotel owner to review your permissions."}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/help"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
          >
            <LifeBuoy aria-hidden="true" className="h-4 w-4" /> Contact support
          </Link>
          <Link
            href={href}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#061224] px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-[#122845] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c89b3c]"
          >
            {action}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
