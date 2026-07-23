"use server";

import { revalidatePath } from "next/cache";

import { getSessionClaims } from "@/lib/onboarding/state";
import { setExerciseVideo } from "@/lib/splits/mutations";
import { parseYoutubeId } from "@/lib/splits/videos";
import { createServiceClient } from "@/lib/supabase/server";

// Phase 5.3 — video library server actions. Staff-only; the upsert + org check
// lives in lib/splits/mutations. YouTube overrides land here now; direct upload
// to the exercise-videos bucket is a follow-up (the bucket + RLS ship in 5.3).

async function requireStaff() {
  const { orgId, role } = await getSessionClaims();
  if (!orgId || (role !== "owner" && role !== "staff")) return null;
  return { orgId };
}

export async function setYoutubeVideoAction(formData: FormData): Promise<void> {
  const s = await requireStaff();
  if (!s) return;
  const exerciseId = String(formData.get("exerciseId"));
  const youtubeId = parseYoutubeId(String(formData.get("youtube") || ""));
  if (!exerciseId || !youtubeId) return;
  const cueNotes = String(formData.get("cueNotes") || "").slice(0, 500) || undefined;
  await setExerciseVideo(createServiceClient(), { orgId: s.orgId, exerciseId, kind: "youtube", youtubeId, cueNotes });
  revalidatePath("/trainer/library");
}
