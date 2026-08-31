import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helpkey | Find your perfect business stay",
  description: "Premium hotel discovery for business travel, built with Helpkey.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
        {children}
      </body>
    </html>
  );
}
