"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, Download, MoreHorizontal } from "lucide-react";

import { Avatar } from "@supertrainer/ui/components/avatar";
import { Badge } from "@supertrainer/ui/components/badge";
import { Button } from "@supertrainer/ui/components/button";
import { EmptyState } from "@supertrainer/ui/components/empty-state";
import { Input } from "@supertrainer/ui/components/input";
import { cn, focusRing } from "@supertrainer/ui/lib/utils";

import type { RosterRow } from "@/lib/trainer/roster";
import type { ScoreBand } from "@supertrainer/scoring";

const STATUS_VARIANT: Record<string, "success" | "warning" | "muted" | "outline"> = {
  active: "success",
  onboarding: "warning",
  paused: "muted",
  churned: "muted",
  lead: "outline",
};

const BAND_DOT: Record<ScoreBand, string> = {
  locked_in: "bg-success",
  building: "bg-warning",
  reset: "bg-danger",
};

const STATUS_FILTERS = ["all", "active", "onboarding", "paused"] as const;
const BAND_FILTERS: { key: "all" | ScoreBand; label: string }[] = [
  { key: "all", label: "All bands" },
  { key: "locked_in", label: "Locked in" },
  { key: "building", label: "Building" },
  { key: "reset", label: "Slipping" },
];

function activityLabel(days: number | null): string {
  if (days === null) return "No activity";
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function renewalLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `Overdue ${-days}d`;
  if (days === 0) return "Due today";
  return `In ${days}d`;
}

const menuItem =
  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-secondary";

export function RosterTable({
  data,
  initialSearch,
  initialStatus,
}: {
  data: RosterRow[];
  initialSearch: string;
  initialStatus: string;
}) {
  const pathname = usePathname();

  const [search, setSearch] = React.useState(initialSearch);
  const [status, setStatus] = React.useState(initialStatus || "all");
  const [band, setBand] = React.useState<"all" | ScoreBand>("all");
  const [atRiskOnly, setAtRiskOnly] = React.useState(false);
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [rowSelection, setRowSelection] = React.useState<Record<string, boolean>>({});

  // Reflect the primary filters in the URL (shareable / back-button correct).
  // Uses history.replaceState, NOT router.replace: filtering is entirely
  // client-side, so a Next navigation here would needlessly re-run the server
  // page (getRoster re-queries the whole org) on every keystroke.
  React.useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (status !== "all") params.set("status", status);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }, [search, status, pathname]);

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.filter((row) => {
      if (needle && !row.name.toLowerCase().includes(needle)) return false;
      if (status !== "all" && row.status !== status) return false;
      if (band !== "all" && row.band !== band) return false;
      if (atRiskOnly && !row.atRisk) return false;
      return true;
    });
  }, [data, search, status, band, atRiskOnly]);

  const columns = React.useMemo<ColumnDef<RosterRow>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <input
            type="checkbox"
            aria-label="Select all"
            className="size-4 rounded border-input"
            checked={table.getIsAllPageRowsSelected()}
            onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.original.name}`}
            className="size-4 rounded border-input"
            checked={row.getIsSelected()}
            onChange={(e) => row.toggleSelected(e.target.checked)}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: "Client",
        cell: ({ row }) => (
          <Link
            href={`/trainer/clients/${row.original.id}`}
            className={cn("flex items-center gap-2 font-medium hover:underline", focusRing)}
          >
            <Avatar name={row.original.name} className="size-7" />
            <span className="truncate">{row.original.name}</span>
          </Link>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => (
          <Badge variant={STATUS_VARIANT[row.original.status] ?? "muted"} className="capitalize">
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: "adherence",
        header: ({ column }) => <SortHeader column={column} label="Adherence" />,
        cell: ({ row }) => {
          const { adherence, band: b } = row.original;
          return (
            <span className="flex items-center gap-2">
              {b && <span aria-hidden="true" className={cn("size-2 rounded-full", BAND_DOT[b])} />}
              <span className="metric">{adherence ?? "—"}</span>
            </span>
          );
        },
      },
      {
        accessorKey: "lastActivityDays",
        header: ({ column }) => <SortHeader column={column} label="Last activity" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{activityLabel(row.original.lastActivityDays)}</span>
        ),
        sortUndefined: "last",
      },
      {
        accessorKey: "renewalDays",
        header: ({ column }) => <SortHeader column={column} label="Renewal" />,
        cell: ({ row }) => (
          <span className={cn("metric text-sm", (row.original.renewalDays ?? 99) < 0 && "text-warning-text")}>
            {renewalLabel(row.original.renewalDays)}
          </span>
        ),
        sortUndefined: "last",
      },
      {
        id: "actions",
        cell: ({ row }) => <RowActions id={row.original.id} name={row.original.name} />,
        enableSorting: false,
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    getRowId: (row) => row.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 12 } },
  });

  const selectedIds = Object.keys(rowSelection).filter((k) => rowSelection[k]);

  function exportSelected() {
    const chosen = data.filter((d) => selectedIds.includes(d.id));
    // RFC-4180: quote every field and double embedded quotes so a name with a
    // comma or quote can't shift the columns.
    const cell = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = "name,status,adherence,last_activity_days,renewal_days\n";
    const body = chosen
      .map((c) => [c.name, c.status, c.adherence ?? "", c.lastActivityDays ?? "", c.renewalDays ?? ""].map(cell).join(","))
      .join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "roster.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4" data-testid="roster">
      <h1 className="text-xl font-semibold tracking-tight" data-testid="roster-title">
        Clients
      </h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clients…"
          aria-label="Search clients"
          className="h-9 w-full sm:w-64"
          data-testid="roster-search"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => setStatus(s)}>
              {s === "all" ? "All" : s}
            </FilterChip>
          ))}
        </div>
        <select
          value={band}
          onChange={(e) => setBand(e.target.value as "all" | ScoreBand)}
          aria-label="Filter by adherence band"
          className={cn("h-9 rounded-md border bg-background px-2 text-sm", focusRing)}
        >
          {BAND_FILTERS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
        <FilterChip active={atRiskOnly} onClick={() => setAtRiskOnly((v) => !v)} testid="filter-at-risk">
          At risk
        </FilterChip>
      </div>

      {/* Bulk-action bar */}
      {selectedIds.length > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-md border bg-surface px-3 py-2 text-sm"
          data-testid="bulk-bar"
        >
          <span className="metric-label">{selectedIds.length} selected</span>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={exportSelected} data-testid="bulk-export">
              <Download aria-hidden="true" className="size-3.5" />
              Export
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState title="No clients match" description="Try clearing a filter or your search." />
      ) : (
        <>
          <div
            className="overflow-x-auto rounded-md border bg-surface-raised focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            tabIndex={0}
            role="group"
            aria-label="Client roster table"
          >
            <table className="w-full text-sm" data-testid="roster-table">
              <thead className="border-b text-left">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {hg.headers.map((header) => (
                      <th key={header.id} className="metric-label px-3 py-2 font-medium">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr
                    key={row.id}
                    data-testid="roster-row"
                    className="border-b last:border-0 hover:bg-foreground/5"
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2.5 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {table.getFilteredRowModel().rows.length} client
              {table.getFilteredRowModel().rows.length === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                aria-label="Previous page"
              >
                <ChevronLeft aria-hidden="true" className="size-4" />
              </Button>
              <span className="metric">
                {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                aria-label="Next page"
              >
                <ChevronRight aria-hidden="true" className="size-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SortHeader({
  column,
  label,
}: {
  column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" };
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
      className={cn("flex items-center gap-1 hover:text-foreground", focusRing)}
    >
      {label}
      <ArrowUpDown aria-hidden="true" className="size-3" />
    </button>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  testid,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  testid?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      className={cn(
        "rounded-md border px-2.5 py-1.5 text-sm font-medium capitalize transition-colors",
        focusRing,
        active
          ? "border-foreground/15 bg-secondary text-secondary-foreground"
          : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function RowActions({ id, name }: { id: string; name: string }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        aria-label={`Actions for ${name}`}
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
          focusRing,
        )}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-md border bg-popover p-1 text-popover-foreground shadow-sm"
        >
          <DropdownMenu.Item asChild>
            <Link href={`/trainer/clients/${id}/inbox`} className={menuItem}>
              Open inbox
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href={`/trainer/clients/${id}`} className={menuItem}>
              Open profile
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
