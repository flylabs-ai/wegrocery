"use client";

import { useState, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";

type Filter = "confirmed" | "drafts" | "all";

// Keep sections mounted so filters preserve expanded rows and loaded details.
export function CycleOrdersContent({ confirmed, drafts, isOpen, draftCount }: {
  confirmed: ReactNode;
  drafts: ReactNode;
  isOpen: boolean;
  draftCount: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const o = t.admin.orders;
  const showConfirmed = !isOpen || filter !== "drafts";
  const showDrafts = isOpen && filter !== "confirmed" && (draftCount > 0 || filter === "drafts");

  return (
    <div className="space-y-4">
      {isOpen && (
        <div role="group" aria-label={o.filterAria} className="flex flex-wrap gap-2">
          {(["confirmed", "drafts", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-11 rounded-full px-3 text-[13px] font-semibold ${
                filter === value ? "bg-inverse text-inverse-foreground" : "bg-tint/[0.05] text-secondary-foreground"
              }`}
            >
              {o.filters[value]}
            </button>
          ))}
        </div>
      )}
      <section aria-label={o.confirmedTitle} hidden={!showConfirmed} className="space-y-3">
        {isOpen && <h3 className="text-[14px] font-bold text-foreground">{o.confirmedTitle}</h3>}
        {confirmed}
      </section>
      {isOpen && (draftCount > 0 || filter === "drafts") && (
        <section aria-label={t.admin.cycle.unconfirmedDrafts} hidden={!showDrafts} className={showConfirmed ? "border-t border-border pt-4" : undefined}>
          {draftCount > 0 ? drafts : (
            <Card className="border-dashed bg-tint/[0.03]">
              <CardContent className="text-[13px] text-secondary-foreground">{o.noDrafts}</CardContent>
            </Card>
          )}
        </section>
      )}
    </div>
  );
}
