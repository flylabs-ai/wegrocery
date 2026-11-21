"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check, ChevronDown, CreditCard, List, Search } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sheet } from "@/components/app-ui/sheet";
import { t } from "@/lib/i18n";
import { formatDate } from "@/lib/i18n/format";
import { adminHref } from "@/lib/admin/nav";
import { filterCycles, groupCycles, type CycleFilter, type CycleGroup, type CycleView } from "@/lib/admin/cycle-views";
import { Input } from "@/components/ui/input";

export type SettleState = "to_settle" | "needs_update" | "refund_failed";

export type CycleListItem = {
  cycleId: string;
  title: string;
  supplierName: string | null;
  status: string;
  perOrder: boolean;
  /** Card cycle whose accounts ask the admin to act: shown first, under "Conti da chiudere". */
  toSettle: boolean;
  /** Why, when toSettle: never settled, to update after a correction, a refund failed. */
  settle: SettleState | null;
  /** ISO: the planned opening, the close for an open cycle, the pickup (or creation) otherwise. */
  date: string | null;
};

const PAGE = 20;

const STATUS: Record<string, string> = {
  planned: t.admin.cycle.plannedBadge,
  open: t.admin.cycle.openBadge,
  closed: t.admin.cycle.closedBadge,
  cancelled: t.admin.cycle.cancelledBadge,
};

const DOT: Record<string, string> = {
  planned: "bg-primary",
  open: "bg-accent",
  closed: "bg-neutral",
  cancelled: "bg-danger",
};

// Every cycle, newest first, with a status filter, a search and pages of 20:
// the archive replaces "Ultimi cicli", which stopped at 15 (older cycles
// could no longer be corrected or cancelled). A link keeps the current view.
export function CycleList({
  cycles,
  selectedId,
  view,
  onNavigate,
}: {
  cycles: CycleListItem[];
  selectedId: string | null;
  view: CycleView | null;
  onNavigate?: () => void;
}) {
  const id = useId();
  const [filter, setFilter] = useState<CycleFilter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(PAGE);
  const w = t.admin.workspace;
  const groups = groupCycles(filterCycles(cycles, filter, query));
  const list = groups.flatMap((group) => group.cycles);

  return (
    <div>
      {!onNavigate && (
        <Link
          href={adminHref("ciclo", null, { new: "1" })}
          className={cn(buttonVariants({ size: "sm", block: true }), "mb-3 min-h-11")}
        >
          {w.newCycle}
        </Link>
      )}
      <div className="relative">
        <label className="sr-only" htmlFor={`${id}-search`}>{w.search}</label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-secondary-foreground" />
        <Input
          id={`${id}-search`}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder={w.searchPlaceholder}
          className="pl-9"
        />
      </div>
      <div role="group" aria-label={w.filtersLabel} className="mt-2 flex flex-wrap gap-1">
        {(Object.keys(w.filters) as CycleFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => {
              setFilter(f);
              setShown(PAGE);
            }}
            className={`min-h-(--control-h) cursor-pointer rounded-full px-2.5 text-label font-semibold ${
              filter === f ? "bg-inverse text-inverse-foreground" : "bg-tint/[0.05] text-secondary-foreground"
            }`}
          >
            {w.filters[f]}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p role="status" className="py-6 text-center text-sm text-secondary-foreground">{w.noMatch}</p>
      ) : (
        <div className="mt-4">
          {groupCycles(list.slice(0, shown)).map(({ group, cycles: items }) => (
            <CycleGroupSection key={group} id={`${id}-${group}`} group={group} cycles={items} selectedId={selectedId} view={view} onNavigate={onNavigate} />
          ))}
        </div>
      )}
      {list.length > shown && (
        <Button variant="outline" size="sm" block onClick={() => setShown((n) => n + PAGE)} className="mt-2">
          {w.showMore} ({list.length - shown})
        </Button>
      )}
    </div>
  );
}

/** One group of the list: its heading and its rows. */
function CycleGroupSection({
  group,
  cycles,
  selectedId,
  view,
  onNavigate,
  id,
}: {
  id: string;
  group: CycleGroup;
  cycles: CycleListItem[];
  selectedId: string | null;
  view: CycleView | null;
  onNavigate?: () => void;
  idPrefix?: string;
}) {
  const w = t.admin.workspace;
  return (
    <section aria-labelledby={id} className="mt-3 first:mt-0">
      <h3
        id={id}
        className={`px-2 text-label font-bold uppercase tracking-wide ${group === "toSettle" ? "text-primary-text" : "text-muted-foreground"}`}
      >
        {w.groups[group]}
      </h3>
      <ul className="mt-1 divide-y divide-border">
        {cycles.map((c) => {
          const current = c.cycleId === selectedId;
          const state = STATUS[c.status] ?? c.status;
          return (
            <li key={c.cycleId}>
              <Link
                href={adminHref("ciclo", c.toSettle ? "conti" : view, { cycle: c.cycleId })}
                onNavigate={onNavigate}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-2 py-2 ${
                  current ? "bg-primary-bg" : "hover:bg-tint/5"
                }`}
              >
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${c.toSettle ? "bg-primary" : (DOT[c.status] ?? DOT.closed)}`} />
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm wrap-anywhere ${current ? "font-bold" : "font-medium"} text-foreground`}>
                    {c.title}
                  </span>
                  <span className="block text-label wrap-anywhere text-secondary-foreground">
                    {c.perOrder && <CreditCard className="mr-1 inline size-3 align-[-2px]" role="img" aria-label={t.admin.cycle.cardBadge} />}
                    {c.supplierName ? `${c.supplierName} · ` : ""}
                    {c.settle ? `${state} · ${w.settleHints[c.settle]}` : state}
                    {c.date ? ` · ${formatDate(c.date, { day: "numeric", month: "short", year: "numeric" })}` : ""}
                  </span>
                </span>
                {current && <Check aria-hidden className="size-4 shrink-0 text-primary-text" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** On a phone or tablet: a button that opens the whole list in a sheet (to settle and open cycles first). */
export function CyclePicker({
  cycles,
  selectedId,
  view,
}: {
  cycles: CycleListItem[];
  selectedId: string | null;
  view: CycleView | null;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        block
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="min-h-11 cursor-pointer justify-start bg-card px-3 py-2"
      >
        <List aria-hidden className="size-4 shrink-0 text-secondary-foreground" />
        <span className="min-w-0 flex-1 text-left">{selectedId ? t.admin.workspace.switchCycle : t.admin.workspace.chooseCycle}</span>
        <ChevronDown aria-hidden className="size-4 shrink-0 text-secondary-foreground" />
      </Button>
      <Sheet open={open} onRequestClose={() => setOpen(false)} title={`${t.admin.workspace.listTitle} (${cycles.length})`} size="sm">
        <CycleList cycles={cycles} selectedId={selectedId} view={view} onNavigate={() => setOpen(false)} />
      </Sheet>
    </>
  );
}
