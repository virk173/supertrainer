"use server";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import {
  parseMealText,
  proposeMealFromPhoto,
  SttNotConfiguredError,
  transcribeAudio,
  type SttMediaType,
  type VisionMediaType,
} from "@supertrainer/ai";

import { getCurrentClientContext, logMeal, type LogMealInput } from "@/lib/ledger/log";
import { resolveMealItems, type ResolvedItem } from "@/lib/ledger/resolve";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 3.2 — portal meal-logging server actions. Parsing runs the model; every
// number the client ever sees is computed in code from the foods table.

export interface ResolveResult {
  items: ResolvedItem[];
  photoPath?: string;
}

// Text path: raw message -> parsed items -> DB-resolved candidate cards.
export async function parseAndResolveText(rawInput: string): Promise<ResolveResult> {
  const ctx = await getCurrentClientContext();
  if (!ctx) throw new Error("No client for the current session");
  const parsed = await parseMealText(rawInput);
  const service = createServiceClient();
  const items = await resolveMealItems(service, parsed.items, {
    locale: ctx.locale ?? undefined,
    orgId: ctx.orgId,
  });
  return { items };
}

const PHOTO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Photo path: store the image (own {org}/{client} path, service-role), propose
// items via vision, resolve to the SAME candidate cards. Returns the stored path
// so the confirmed log can reference the photo.
const PhotoInputSchema = z.object({
  base64Data: z.string().min(1).max(15_000_000), // ~10MB base64
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp"]),
});

export async function proposeAndResolvePhoto(
  base64Data: string,
  mediaType: VisionMediaType,
): Promise<ResolveResult> {
  // Server-action inputs are untrusted (TS types are erased at runtime).
  const validated = PhotoInputSchema.parse({ base64Data, mediaType });
  base64Data = validated.base64Data;
  mediaType = validated.mediaType;

  const ctx = await getCurrentClientContext();
  if (!ctx) throw new Error("No client for the current session");
  const service = createServiceClient();

  const ext = PHOTO_EXT[mediaType] ?? "jpg";
  const path = `${ctx.orgId}/${ctx.clientId}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(base64Data, "base64");
  const { error: upErr } = await service.storage
    .from("meal-photos")
    .upload(path, bytes, { contentType: mediaType, upsert: false });
  if (upErr) throw upErr;

  const parsed = await proposeMealFromPhoto(base64Data, mediaType);
  const items = await resolveMealItems(service, parsed.items, {
    locale: ctx.locale ?? undefined,
    orgId: ctx.orgId,
  });
  return { items, photoPath: path };
}

// Voice path: transcribe -> the text path. When no STT provider is configured
// (the default), returns { configured: false } so the UI degrades to typing
// instead of erroring.
export async function transcribeAndResolveVoice(
  base64Data: string,
  mediaType: SttMediaType,
): Promise<{ configured: true; transcript: string; result: ResolveResult } | { configured: false }> {
  const ctx = await getCurrentClientContext();
  if (!ctx) throw new Error("No client for the current session");
  try {
    const transcript = await transcribeAudio(Buffer.from(base64Data, "base64"), mediaType, {
      language: ctx.locale ?? undefined,
    });
    return { configured: true, transcript, result: await parseAndResolveText(transcript) };
  } catch (err) {
    if (err instanceof SttNotConfiguredError) return { configured: false };
    throw err;
  }
}

// Confirm: persist the meal log (macros recomputed from the DB inside logMeal).
export async function submitMealLog(input: LogMealInput) {
  return logMeal(input);
}
