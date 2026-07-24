import Link from "next/link";
import { ArrowLeft, MessageSquare } from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";

import { ForensicGrid } from "@/components/profile/forensic-grid";
import { WeightChart } from "@/components/profile/weight-chart";
import type { ClientProfile as ClientProfileData } from "@/lib/trainer/profile";

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "outline"> = {
  active: "success",
  onboarding: "warning",
  paused: "muted",
  churned: "muted",
  lead: "outline",
};

function monthYear(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(
      new Date(iso),
    );
  } catch {
    return null;
  }
}

// The forensic client profile (trainer lens): identity + quick nav, the signature
// adherence grid (the dispute-ender), and the weight trend.
export function ClientProfile({ profile }: { profile: ClientProfileData }) {
  const since = monthYear(profile.memberSince);

  return (
    <div className="space-y-6" data-testid="client-profile">
      <header className="flex flex-wrap items-center gap-3">
        <Button asChild variant="ghost" size="icon" aria-label="Back to clients">
          <Link href="/trainer/clients">
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
        </Button>
        <Avatar name={profile.name} className="size-10" />
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight" data-testid="profile-title">
            {profile.name}
          </h1>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={STATUS_VARIANT[profile.status] ?? "muted"} className="capitalize">
              {profile.status}
            </Badge>
            {since && <span>Member since {since}</span>}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/trainer/clients/${profile.id}/inbox`}>
              <MessageSquare aria-hidden="true" className="size-4" />
              Open inbox
            </Link>
          </Button>
        </div>
      </header>

      {/* Facts row */}
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant={profile.hasPlan ? "success" : "outline"}>
          Diet plan {profile.hasPlan ? "active" : "none"}
        </Badge>
        <Badge variant={profile.hasSplit ? "success" : "outline"}>
          Training split {profile.hasSplit ? "active" : "none"}
        </Badge>
        <Badge variant={profile.consentSignedAt ? "muted" : "warning"}>
          Consent {profile.consentSignedAt ? "signed" : "pending"}
        </Badge>
      </div>

      <ForensicGrid rows={profile.grid} />

      <WeightChart weight={profile.weight} trend={profile.weightTrend} />
    </div>
  );
}
