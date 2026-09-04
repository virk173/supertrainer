import { notFound } from "next/navigation";

import BrandedLandingPage, { generateMetadata as brandedMetadata } from "@/app/c/[slug]/page";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 9.5 — a coach's own domain, resolved.
//
// Middleware can't do this lookup (it would put a database round-trip in front
// of every request), so it rewrites an unrecognised host's ROOT here and this
// page resolves it. Only an ACTIVE domain resolves: a half-verified one must not
// serve a coach's page, or a hijacked DNS record would.

async function slugForHost(host: string): Promise<string | null> {
  const domain = host.split(":")[0].toLowerCase();
  const service = createServiceClient();
  const { data } = await service
    .from("custom_domains")
    .select("status, orgs!inner(slug)")
    .eq("domain", domain)
    .eq("status", "active")
    .maybeSingle();
  if (!data) return null;
  return (data.orgs as unknown as { slug: string }).slug;
}

export async function generateMetadata({ params }: { params: Promise<{ host: string }> }) {
  const { host } = await params;
  const slug = await slugForHost(decodeURIComponent(host));
  if (!slug) return { title: "Coaching" };
  return brandedMetadata({ params: Promise.resolve({ slug }) });
}

export default async function CustomDomainLanding({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = await params;
  const slug = await slugForHost(decodeURIComponent(host));
  if (!slug) notFound();
  return BrandedLandingPage({ params: Promise.resolve({ slug }) });
}
