import { FlagsConsole } from "@/components/admin/flags-console";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminFlagsPage() {
  const service = createServiceClient();
  const [{ data: flags }, { data: overrides }] = await Promise.all([
    service.from("feature_flags").select("key, description, enabled_default, rollout_percent").order("key"),
    service.from("feature_flag_overrides").select("flag_key"),
  ]);

  const overrideCount = new Map<string, number>();
  for (const o of overrides ?? []) {
    overrideCount.set(o.flag_key, (overrideCount.get(o.flag_key) ?? 0) + 1);
  }

  return (
    <FlagsConsole
      flags={(flags ?? []).map((f) => ({
        key: f.key,
        description: f.description,
        enabledDefault: f.enabled_default,
        rolloutPercent: f.rollout_percent,
        overrides: overrideCount.get(f.key) ?? 0,
      }))}
    />
  );
}
