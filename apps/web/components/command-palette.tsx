"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { CircleUser, ListChecks, Monitor, Moon, Plus, Sun, UserPlus } from "lucide-react";

import { useTheme } from "@/components/theme-provider";
import { searchClientsAction, type ClientHit } from "@/app/(app)/trainer/actions";
import { ALL_NAV } from "@/lib/trainer-nav";
import { type Theme } from "@/lib/theme";

const itemClass =
  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-foreground outline-none data-[selected=true]:bg-secondary data-[selected=true]:text-secondary-foreground";

const groupClass =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground";

const THEME_ITEMS: { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: "light", label: "Switch to light theme", icon: Sun },
  { theme: "dark", label: "Switch to dark theme", icon: Moon },
  { theme: "system", label: "Match system theme", icon: Monitor },
];

// ⌘K palette: navigate anywhere, jump to a client by name, or fire a quick
// action. Rendered by TrainerShell, which owns open state + the ⌘K shortcut.
export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { setTheme } = useTheme();
  const [search, setSearch] = React.useState("");
  const [clients, setClients] = React.useState<ClientHit[]>([]);

  // Load client matches while open (empty query → most-recent clients). Debounced
  // so a burst of keystrokes hits the server once.
  React.useEffect(() => {
    if (!open) return;
    let active = true;
    const timer = setTimeout(() => {
      void searchClientsAction(search).then((hits) => {
        if (active) setClients(hits);
      });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [open, search]);

  // Reset the query each time the palette closes.
  React.useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  const run = React.useCallback(
    (action: () => void) => {
      onOpenChange(false);
      action();
    },
    [onOpenChange],
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      shouldFilter
      overlayClassName="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm"
      contentClassName="fixed inset-x-3 top-24 z-50 mx-auto max-w-lg overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-sm"
    >
      <Command.Input
        value={search}
        onValueChange={setSearch}
        placeholder="Search or jump to…"
        className="h-12 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
      />
      <Command.List className={`max-h-80 overflow-y-auto p-2 ${groupClass}`}>
        <Command.Empty className="px-2 py-6 text-center text-sm text-muted-foreground">
          No matches. Try a client name or a page.
        </Command.Empty>

        <Command.Group heading="Go to">
          {ALL_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <Command.Item
                key={item.href}
                value={`go ${item.label}`}
                onSelect={() => run(() => router.push(item.href))}
                className={itemClass}
              >
                <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                {item.label}
              </Command.Item>
            );
          })}
        </Command.Group>

        {clients.length > 0 && (
          <Command.Group heading="Clients">
            {clients.map((client) => (
              <Command.Item
                key={client.id}
                value={`client ${client.name}`}
                onSelect={() =>
                  run(() => router.push(`/trainer/clients/${client.id}`))
                }
                className={itemClass}
              >
                <CircleUser aria-hidden="true" className="size-4 text-muted-foreground" />
                {client.name}
              </Command.Item>
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Actions">
          <Command.Item
            value="approve next draft review queue"
            onSelect={() => run(() => router.push("/trainer/queue"))}
            className={itemClass}
          >
            <ListChecks aria-hidden="true" className="size-4 text-muted-foreground" />
            Approve next draft
          </Command.Item>
          <Command.Item
            value="invite client"
            onSelect={() => run(() => router.push("/trainer/prospects"))}
            className={itemClass}
          >
            <UserPlus aria-hidden="true" className="size-4 text-muted-foreground" />
            Invite a client
          </Command.Item>
          <Command.Item
            value="new plan"
            onSelect={() => run(() => router.push("/trainer/clients"))}
            className={itemClass}
          >
            <Plus aria-hidden="true" className="size-4 text-muted-foreground" />
            New plan
          </Command.Item>
          {THEME_ITEMS.map(({ theme, label, icon: Icon }) => (
            <Command.Item
              key={theme}
              value={label}
              onSelect={() => run(() => setTheme(theme))}
              className={itemClass}
            >
              <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
              {label}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
