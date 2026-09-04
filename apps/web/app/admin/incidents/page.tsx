import { IncidentsConsole } from "@/components/admin/incidents-console";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminIncidentsPage() {
  const service = createServiceClient();
  const { data } = await service
    .from("platform_incidents")
    .select("id, title, body, severity, surface, maintenance_mode, published, starts_at, ends_at")
    .order("starts_at", { ascending: false })
    .limit(20);

  return (
    <IncidentsConsole
      incidents={(data ?? []).map((i) => ({
        id: i.id,
        title: i.title,
        body: i.body,
        severity: i.severity,
        surface: i.surface,
        maintenanceMode: i.maintenance_mode,
        published: i.published,
        startsAt: i.starts_at,
        endsAt: i.ends_at,
      }))}
    />
  );
}
