import { redirect } from "next/navigation";

import { ProgressPhotos } from "@/components/progress-photos";
import { getCurrentClientContext, tzDate } from "@/lib/ledger/log";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Progress photos — supertrainer" };

export default async function ProgressPage() {
  const ctx = await getCurrentClientContext();
  if (!ctx) redirect("/portal");
  const service = createServiceClient();
  const day = tzDate(ctx.timezone);
  const { data } = await service
    .from("progress_photos")
    .select("pose")
    .eq("client_id", ctx.clientId)
    .eq("tz_date", day);

  const initialDone: Partial<Record<"front" | "side" | "back", boolean>> = {};
  for (const r of data ?? []) initialDone[r.pose as "front" | "side" | "back"] = true;

  return <ProgressPhotos initialDone={initialDone} />;
}
