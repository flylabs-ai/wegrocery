"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, ChevronRight, ListTodo } from "lucide-react";
import { t } from "@/lib/i18n";
import { formatLongDay } from "@/lib/i18n/deadline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/app-ui/sheet";
import { adminHref } from "@/lib/admin/nav";
import { currentStep, doneKey, type CycleStep, type CycleTask } from "@/lib/admin/cycle-phase";
import type { CycleView } from "@/lib/admin/cycle-views";

const STORAGE_KEY = "wg.admin.todoDone";

function readDone(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

function writeDone(done: Set<string>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...done]));
  } catch {
    // Private mode or storage blocked: the step comes back on the next visit.
  }
}

const VIEW: Record<CycleStep, CycleView> = {
  overdue: "ordini",
  to_open: "panoramica",
  open: "ordini",
  to_send: "fornitore",
  to_confirm_pickup: "panoramica",
  to_adjust: "ordini",
  to_collect: "ritiri",
  to_settle: "conti",
};

// Show the next step for each cycle. Steps done outside the app can be marked
// on this device without hiding them for other admins.
export function CycleTodo({
  tasks,
  refunds,
  duplicates,
}: {
  tasks: CycleTask[];
  refunds: number;
  duplicates: number;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(() => new Set());
  useEffect(() => setDone(readDone()), []);
  const d = t.admin.workspace.todo;

  const visible = tasks.flatMap((task) => {
    const step = currentStep(task, done);
    return step ? [{ task, step }] : [];
  });
  const count = visible.length + Number(refunds > 0) + Number(duplicates > 0);

  function markDone(cycleId: string, step: CycleStep) {
    const next = new Set(done);
    next.add(doneKey(cycleId, step));
    setDone(next);
    writeDone(next);
  }

  if (count === 0 && !open) return null;

  return (
    <div className="mb-4">
      <Button
        variant="outline"
        block
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="min-h-11 cursor-pointer justify-start bg-card px-3 py-2"
      >
        <ListTodo aria-hidden className="size-4 shrink-0 text-secondary-foreground" />
        <span className="min-w-0 flex-1 text-left">{d.title}</span>
        {visible[0]?.step === "overdue" && <Badge variant="destructive">{d.lateBadge}</Badge>}
        <span className="rounded-full bg-tint/5 px-2 py-0.5 text-label tabular-nums">{count}</span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-secondary-foreground" />
      </Button>
      <Sheet open={open} onRequestClose={() => setOpen(false)} title={d.title}>
        {count === 0 && <p className="text-sm text-secondary-foreground">{d.nothing}</p>}
        {visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map(({ task, step }) => (
              <li key={task.cycleId} className="rounded-xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 font-semibold wrap-anywhere">{task.title}</p>
                  {step === "overdue" && <Badge variant="destructive">{d.lateBadge}</Badge>}
                </div>
                <p className="mt-1 text-sm text-secondary-foreground">{detail(task, step)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-4">
                  <Link
                    href={adminHref("ciclo", VIEW[step], { cycle: task.cycleId })}
                    onNavigate={() => setOpen(false)}
                    className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-text hover:underline"
                  >
                    {cta(step)}
                    <ArrowRight aria-hidden className="size-4 shrink-0" />
                  </Link>
                  {(step === "to_send" || step === "to_adjust") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markDone(task.cycleId, step)}
                      title={d.markHint}
                      className="min-h-11 text-secondary-foreground"
                    >
                      {step === "to_send" ? d.markSent : d.markDelivered}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {(refunds > 0 || duplicates > 0) && (
          <ul className="divide-y divide-border">
            {refunds > 0 && (
              <li>
                <Link href={adminHref("cassa", null)} onNavigate={() => setOpen(false)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-text">
                  {d.refunds(refunds)}
                  <ArrowRight aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>
            )}
            {duplicates > 0 && (
              <li>
                <Link href={adminHref("soci", null)} onNavigate={() => setOpen(false)} className="flex min-h-11 items-center gap-2 text-sm font-semibold text-primary-text">
                  {d.duplicates(duplicates)}
                  <ArrowRight aria-hidden className="size-4 shrink-0" />
                </Link>
              </li>
            )}
          </ul>
        )}
      </Sheet>
    </div>
  );
}

function cta(step: CycleStep): string {
  const d = t.admin.workspace.todo;
  return { overdue: d.overdueCta, to_open: d.openPlannedCta, open: d.openCta, to_send: d.sendCta, to_confirm_pickup: d.confirmPickupCta, to_adjust: d.adjustCta, to_collect: d.collectCta, to_settle: d.settleCta }[step];
}

function detail(task: CycleTask, step: CycleStep): string {
  const d = t.admin.workspace.todo;
  switch (step) {
    case "overdue":
      return d.overdueDetail(task.hours ?? 0);
    case "to_open":
      return d.openPlannedDetail(task.hours != null && task.hours >= 1);
    case "open":
      return d.openDetail(task.orderMembers, task.hours);
    case "to_send":
      return d.sendDetail;
    case "to_confirm_pickup":
      return d.confirmPickupDetail(task.pickupDate ? formatLongDay(task.pickupDate) : "");
    case "to_adjust":
      return d.adjustDetail;
    case "to_collect":
      return d.collectDetail(task.toCollect);
    case "to_settle":
      return d.settleDetail;
  }
}
