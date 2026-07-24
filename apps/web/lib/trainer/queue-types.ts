// Pure queue model — types, tab config, and the tab filter. No server imports,
// so both the server data layer (queue.ts) and the client split-view import it.

export type QueueTab =
  | "all"
  | "replies"
  | "plans"
  | "splits"
  | "progressions"
  | "escalations"
  | "flags";

export type QueueItemType =
  | "reply"
  | "plan"
  | "split"
  | "progression"
  | "escalation"
  | "flag";

export interface QueueItem {
  key: string;
  id: string;
  type: QueueItemType;
  clientId: string;
  clientName: string;
  ageHours: number;
  preview: string;
  reviewHref?: string;
  needsAttention?: boolean;
  // reply
  draftText?: string;
  triggerText?: string;
  category?: string;
  // escalation
  selfHarm?: boolean;
  categories?: string[];
  excerpt?: string;
}

export type QueueCounts = Record<QueueTab, number>;

export interface QueueData {
  items: QueueItem[];
  counts: QueueCounts;
}

export const QUEUE_TABS: { tab: QueueTab; label: string }[] = [
  { tab: "all", label: "All" },
  { tab: "replies", label: "Replies" },
  { tab: "plans", label: "Diet plans" },
  { tab: "splits", label: "Splits" },
  { tab: "progressions", label: "Progressions" },
  { tab: "escalations", label: "Escalations" },
  { tab: "flags", label: "Flags" },
];

const TAB_TYPE: Partial<Record<QueueTab, QueueItemType>> = {
  replies: "reply",
  plans: "plan",
  splits: "split",
  progressions: "progression",
  escalations: "escalation",
  flags: "flag",
};

export function itemsForTab(items: QueueItem[], tab: QueueTab): QueueItem[] {
  if (tab === "all") return items;
  const type = TAB_TYPE[tab];
  return items.filter((i) => i.type === type);
}
