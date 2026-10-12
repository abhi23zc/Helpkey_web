import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
      <header className="border-b border-[var(--hk-border)] bg-white">
        <nav aria-label="Policy navigation" className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-5 py-5">
          <Link href="/" className="text-xl font-bold text-[var(--hk-navy-strong)]">Helpkey</Link>
          <div className="flex flex-wrap gap-5 text-sm font-medium">
            <Link href="/privacy-policy">Privacy policy</Link>
            <Link href="/delete-account">Account deletion</Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-4xl px-5 py-12 sm:py-16">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-[var(--hk-muted)]">Helpkey · Privacy &amp; your data</p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--hk-navy-strong)] sm:text-5xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--hk-muted)]">{description}</p>
        <article className="mt-10 space-y-9 rounded-2xl border border-[var(--hk-border)] bg-white p-6 leading-7 sm:p-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-[var(--hk-navy-strong)] [&_p+p]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_a]:underline [&_a]:underline-offset-4">{children}</article>
      </main>
      <footer className="mx-auto max-w-4xl px-5 pb-10 text-sm text-[var(--hk-muted)]">Helpkey · Hotel discovery and booking</footer>
    </div>
  );
}
