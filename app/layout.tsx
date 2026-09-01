import type { Metadata } from "next";
import { AuthProvider } from "@/components/auth/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Helpkey | Premium hotel booking",
  description: "Premium hotel discovery for business travel, built with Helpkey.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-[var(--hk-ivory)] text-[var(--hk-ink)]">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
