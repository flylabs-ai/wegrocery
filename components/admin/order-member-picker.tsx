"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { splitOrderMembers, type OrderMemberSummary, type PickerMember } from "@/lib/admin/order-member-picker";
import { formatEur } from "@/lib/utils";
import { t } from "@/lib/i18n";

type Props = {
  members: ReadonlyArray<{ memberId: string; fullName: string }>;
  summaries: ReadonlyArray<OrderMemberSummary>;
  onPick: (memberId: string) => void;
};

/**
 * First step of "order for a member": who already ordered on the cycle (to
 * edit their order), then who did not (to add one), with a name search.
 */
export function OrderMemberPicker({ members, summaries, onPick }: Props) {
  const [query, setQuery] = useState("");
  const c = t.admin.editClosedOrder;
  const { ordered, notOrdered } = useMemo(
    () => splitOrderMembers(members, summaries, query),
    [members, summaries, query],
  );

  return (
    <div>
      <label className="sr-only" htmlFor="order-member-search">
        {c.searchMember}
      </label>
      <Input
        id="order-member-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={c.searchMember}
        className="mb-4 rounded-xl"
        autoComplete="off"
      />
      {ordered.length === 0 && notOrdered.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-secondary-foreground">{c.noMemberMatch}</p>
      ) : (
        <>
          <Group title={c.orderedGroup(ordered.length)} rows={ordered} onPick={onPick} />
          <Group title={c.notOrderedGroup(notOrdered.length)} rows={notOrdered} onPick={onPick} />
        </>
      )}
    </div>
  );
}

function Group({
  title,
  rows,
  onPick,
}: {
  title: string;
  rows: PickerMember[];
  onPick: (memberId: string) => void;
}) {
  const c = t.admin.editClosedOrder;
  if (rows.length === 0) return null;
  return (
    <section className="mb-5">
      <h3 className="mb-2 font-mono text-label font-bold uppercase tracking-[0.13em] text-primary-text">{title}</h3>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((m) => {
          const ordered = m.lineCount > 0;
          return (
            <li key={m.memberId}>
              <button
                type="button"
                onClick={() => onPick(m.memberId)}
                aria-label={ordered ? c.editMemberOrderAria(m.fullName) : c.addMemberOrderAria(m.fullName)}
                className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-tint/[0.03]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-foreground">{m.fullName}</span>
                  {(ordered || m.paidCents > 0 || m.hasDraft) && (
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-secondary-foreground">
                      {ordered && (
                        <span className="tabular-nums">
                          {t.admin.closedCycleDetails.linesCount(m.lineCount)} · {formatEur(m.total)}
                        </span>
                      )}
                      {m.paidCents > 0 && <Badge variant="accent">{c.paidByCardBadge}</Badge>}
                      {!ordered && m.hasDraft && <Badge>{c.draftBadge}</Badge>}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  className={`shrink-0 rounded-full px-3 py-1.5 text-label font-bold ${
                    ordered ? "bg-primary/10 text-primary-text" : "bg-tint/[0.06] text-secondary-foreground"
                  }`}
                >
                  {ordered ? c.editAction : c.addAction}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
