import { Suspense } from "react";

import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { PostHogProvider } from "@supertrainer/ui/analytics";

import { PostHogPageview } from "@/components/posthog-pageview";
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
        <PostHogProvider>
          <Suspense fallback={null}>
            <PostHogPageview />
          </Suspense>
          {children}
        </PostHogProvider>
      </body>
    </html>
  );
}
