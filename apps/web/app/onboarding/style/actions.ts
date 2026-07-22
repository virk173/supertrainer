"use server";

import { revalidatePath } from "next/cache";

import { extractStyleProfile } from "@supertrainer/ai";
import type { Json } from "@supertrainer/db/types";

import { completeStep } from "@/app/onboarding/actions";
import { styleCoverage } from "@/lib/style/coverage";
import { extractTextFromFile } from "@/lib/style/extract-text";
import {
  STYLE_DOMAIN_ORDER,
  type StyleDomain,
} from "@/lib/style/profiles";
import { getSessionClaims } from "@/lib/onboarding/state";
import { createServiceClient } from "@/lib/supabase/server";

async function requireStaffOrg(): Promise<string> {
  const { orgId, role } = await getSessionClaims();
  if (!orgId) throw new Error("Your session expired — sign in again.");
  if (role !== "owner" && role !== "staff") {
    throw new Error("Only trainers can run style ingestion.");
  }
  return orgId;
}

export interface StyleDraft {
  domain: StyleDomain;
  profile: Record<string, unknown>;
  confidence: number;
}

export interface IngestResult {
  ok: boolean;
  message?: string;
  drafts?: StyleDraft[];
}

// Downloads each uploaded file from the private 'ingestion' bucket, extracts
// text (pdf/docx/image/text), records an uploads row, then runs all three
// domain extractors over the combined text and writes draft profiles.
export async function ingestUploads(
  files: { path: string; mimeType: string }[],
): Promise<IngestResult> {
  let orgId: string;
  try {
    orgId = await requireStaffOrg();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Unauthorized" };
  }
  if (files.length === 0) return { ok: false, message: "Add at least one file." };

  const service = createServiceClient();
  const texts: string[] = [];
  const uploadIds: string[] = [];

  for (const file of files) {
    // Path is org-scoped ({orgId}/...); reject anything outside this org.
    if (!file.path.startsWith(`${orgId}/`)) continue;
    const { data: blob, error: dlError } = await service.storage
      .from("ingestion")
      .download(file.path);

    let text = "";
    let kind: "plan_pdf" | "checkin_screenshot" | "doc" = "doc";
    let status: "done" | "failed" = "done";
    let error: string | null = null;

    if (dlError || !blob) {
      status = "failed";
      error = dlError?.message ?? "download failed";
    } else {
      try {
        const buffer = Buffer.from(await blob.arrayBuffer());
        const extracted = await extractTextFromFile(buffer, file.mimeType);
        text = extracted.text;
        kind = extracted.kind;
        if (text) texts.push(text);
      } catch (err) {
        status = "failed";
        error = err instanceof Error ? err.message : "extraction failed";
      }
    }

    const { data: row } = await service
      .from("uploads")
      .insert({
        org_id: orgId,
        bucket_path: file.path,
        kind,
        extracted_text: text || null,
        extraction_status: status,
        error,
      })
      .select("id")
      .single();
    if (row) uploadIds.push(row.id);
  }

  // PO-2: re-extraction is additive. "Add more examples to sharpen your AI"
  // re-runs over the WHOLE corpus (every prior upload plus the files just added,
  // all now rows in `uploads`), so coverage only grows — adding one more doc can
  // never regress a profile. `texts` above only tells us whether THIS run
  // contributed any readable material.
  const newReadable = texts.length;
  const { data: corpusRows } = await service
    .from("uploads")
    .select("extracted_text")
    .eq("org_id", orgId)
    .eq("extraction_status", "done");
  const combined = (corpusRows ?? [])
    .map((r) => r.extracted_text)
    .filter((t): t is string => !!t && t.trim().length > 0)
    .join("\n\n---\n\n")
    .trim();
  if (newReadable === 0 || !combined) {
    return {
      ok: false,
      message: "Couldn't read any text from those files. Try clearer scans or a text-based export.",
    };
  }

  // Extract all three domains from the combined material in parallel. Each
  // profile's stored confidence is its CODE-computed coverage (PO-2) — the share
  // of schema fields that came back with real content — not a file count.
  let drafts: StyleDraft[];
  try {
    drafts = await Promise.all(
      STYLE_DOMAIN_ORDER.map(async (domain): Promise<StyleDraft> => {
        const profile = (await extractStyleProfile(domain, combined)) as Record<
          string,
          unknown
        >;
        return { domain, profile, confidence: styleCoverage(profile).score };
      }),
    );
  } catch (err) {
    console.error("[style] extraction failed:", err);
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Style extraction failed. Try again.",
    };
  }

  // Persist as draft version 1 (overwriting any prior draft for re-runs).
  for (const draft of drafts) {
    await service.from("style_profiles").upsert(
      {
        org_id: orgId,
        domain: draft.domain,
        version: 1,
        profile: draft.profile as Json,
        status: "draft",
        confidence: draft.confidence,
        created_from: uploadIds,
      },
      { onConflict: "org_id,domain,version" },
    );
  }

  revalidatePath("/onboarding/style");
  return { ok: true, drafts };
}

export interface ConfirmResult {
  ok: boolean;
  message?: string;
  allConfirmed?: boolean;
}

// Saves a trainer's edits and confirms one domain's profile. When every draft
// is confirmed, the style checklist step completes.
export async function confirmStyleProfile(
  domain: StyleDomain,
  profile: Record<string, unknown>,
): Promise<ConfirmResult> {
  let orgId: string;
  try {
    orgId = await requireStaffOrg();
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Unauthorized" };
  }

  const service = createServiceClient();
  const { error } = await service
    .from("style_profiles")
    .update({
      profile: profile as Json,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("org_id", orgId)
    .eq("domain", domain)
    .eq("version", 1);

  if (error) return { ok: false, message: error.message };

  // All drafts resolved → complete the checklist step.
  const { data: remaining } = await service
    .from("style_profiles")
    .select("id")
    .eq("org_id", orgId)
    .eq("status", "draft");

  const allConfirmed = (remaining?.length ?? 0) === 0;
  if (allConfirmed) await completeStep("style");

  revalidatePath("/onboarding/style");
  revalidatePath("/onboarding");
  return { ok: true, allConfirmed };
}
