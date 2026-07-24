import {
  BarChart3,
  ClipboardList,
  Home,
  Inbox,
  Library,
  ListChecks,
  Settings,
  UserSearch,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Render the live pending-queue count on this item. */
  badge?: boolean;
};

// Primary daily-driver surfaces, top to bottom (spec §8 / PHASE-7 7.1).
export const PRIMARY_NAV: NavItem[] = [
  { label: "Home", href: "/trainer", icon: Home },
  { label: "Inbox", href: "/trainer/inbox", icon: Inbox },
  { label: "Queue", href: "/trainer/queue", icon: ListChecks, badge: true },
  { label: "Clients", href: "/trainer/clients", icon: Users },
  { label: "Plans", href: "/trainer/plans", icon: ClipboardList },
  { label: "Analytics", href: "/trainer/analytics", icon: BarChart3 },
  { label: "Library", href: "/trainer/library", icon: Library },
];

// Lead-gen + configuration, set off below a hairline.
export const SECONDARY_NAV: NavItem[] = [
  { label: "Prospects", href: "/trainer/prospects", icon: UserSearch },
  { label: "Settings", href: "/trainer/settings", icon: Settings },
];

export const ALL_NAV: NavItem[] = [...PRIMARY_NAV, ...SECONDARY_NAV];

// Human labels for the path segments the breadcrumb trail walks through.
const SEGMENT_LABELS: Record<string, string> = {
  inbox: "Inbox",
  queue: "Queue",
  clients: "Clients",
  plans: "Plans",
  analytics: "Analytics",
  library: "Library",
  prospects: "Prospects",
  settings: "Settings",
  review: "Review",
  splits: "Splits",
  profile: "Profile",
};

export type Crumb = { label: string; href: string };

// A uuid/numeric segment reads as "Detail" until the page itself supplies a
// better crumb — the shell only needs a legible trail, not the record's name.
function looksLikeId(segment: string): boolean {
  return /^[0-9a-f]{8}-/i.test(segment) || /^\d+$/.test(segment);
}

function titleCase(segment: string): string {
  return segment.charAt(0).toUpperCase() + segment.slice(1);
}

// Breadcrumb trail for a /trainer/* path, always rooted at Home.
export function breadcrumbsFor(pathname: string): Crumb[] {
  const trail: Crumb[] = [{ label: "Home", href: "/trainer" }];
  const rest = pathname.replace(/^\/trainer\/?/, "");
  if (!rest) return trail;

  let href = "/trainer";
  // Drop empty segments so a stray leading/trailing slash (or an embedded
  // preview whose path isn't under /trainer) never yields an empty-label crumb.
  for (const segment of rest.split("/").filter(Boolean)) {
    href += `/${segment}`;
    const label =
      SEGMENT_LABELS[segment] ??
      (looksLikeId(segment) ? "Detail" : titleCase(segment));
    trail.push({ label, href });
  }
  return trail;
}
