"use client";

import Link from "next/link";
import { useIsPartner } from "@/components/auth/auth-provider";

export type MainNavLink = {
  label: string;
  href: string;
  className?: string;
};

/**
 * Renders the primary site navigation links. When the signed-in user has the
 * "partner" role, the "For Business" entry is hidden.
 */
export function MainNavLinks({ items }: { items: MainNavLink[] }) {
  const isPartner = useIsPartner();
  const visibleItems = isPartner ? items.filter((item) => item.label !== "For Business") : items;

  return (
    <>
      {visibleItems.map((item) => (
        <Link key={item.label} href={item.href} className={item.className}>
          {item.label}
        </Link>
      ))}
    </>
  );
}
