import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { PostHogProvider } from "@supertrainer/ui/analytics";

import { PostHogPageview } from "@/components/posthog-pageview";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "supertrainer",
  description: "AI coaching platform for personal trainers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {/*
         * PWA manifest (Phase 2.4). React 19 hoists this <link> into <head>.
         * crossOrigin="use-credentials" is required: the manifest route is
         * per-client (org-branded), so it must be fetched WITH cookies —
         * without this the browser gets the generic platform manifest.
         */}
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="use-credentials"
        />
        <ServiceWorkerRegister />
        <PostHogProvider>
          {children}
          {/*
           * Analytics-only, renders null. No Suspense needed: PostHogPageview
           * no longer calls useSearchParams (which would force a client-bailout
           * boundary and offset React's useId counter, breaking hydration of
           * useId-based components elsewhere on the page).
           */}
          <PostHogPageview />
        </PostHogProvider>
      </body>
    </html>
  );
}
