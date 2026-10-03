/**
 * Root layout — M1 application shell only (no product UI). The real editor/
 * dashboard surfaces land in M6 per ROADMAP.md.
 */
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Forge Platform",
  description: "Provider-agnostic AI application-building platform (foundation build)",
  robots: { index: false }, // dev/foundation builds must not be indexed
};

export default function RootLayout({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", margin: 0 }}>{children}</body>
    </html>
  );
}
