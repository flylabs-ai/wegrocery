import { ChevronDown } from "lucide-react";
import type { CycleDraftDetails, CycleDraftSummary } from "@/lib/admin/cycle-drafts";
import { t } from "@/lib/i18n";
import { formatDateTime, formatNumber } from "@/lib/i18n/format";
import { formatEur } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";

export function CycleDraftsSummary({ drafts, cardPayment }: {
  drafts: ReadonlyArray<CycleDraftSummary>;
  cardPayment: boolean;
}) {
  if (drafts.length === 0) return null;
  const c = t.admin.cycle;
  const estimatedTotal = drafts.reduce((total, draft) => total + draft.estimatedTotal, 0);

  return (
    <div role="group" aria-label={c.unconfirmedDrafts} className="grid grid-cols-2 gap-3">
      <div className="flex flex-col rounded-lg border border-dashed border-border bg-tint/[0.03] px-3 py-2">
        <div className="text-label text-secondary-foreground">{cardPayment ? c.unpaidDraftsLabel : c.unconfirmedDrafts}</div>
        <div className="mt-auto text-[20px] font-bold text-foreground">{drafts.length}</div>
      </div>
      <div className="flex flex-col rounded-lg border border-dashed border-border bg-tint/[0.03] px-3 py-2">
        <div className="text-label text-secondary-foreground">{c.draftsValue}</div>
        <div className="mt-auto break-words text-[20px] font-bold tabular-nums text-foreground">{formatEur(estimatedTotal)}</div>
      </div>
    </div>
  );
}

export function CycleDraftsCard({ drafts, cardPayment }: {
  drafts: ReadonlyArray<CycleDraftDetails>;
  cardPayment: boolean;
}) {
  if (drafts.length === 0) return null;
  const c = t.admin.cycle;

  return (
    <Card className="min-w-0 border-dashed bg-tint/[0.03]">
      <CardHeader>
        <h3 className="text-[14px] font-bold text-foreground">{c.unconfirmedDrafts} ({drafts.length})</h3>
        <p className="mt-1 text-[14px] text-secondary-foreground">{cardPayment ? c.draftsUnpaid : c.draftsUnconfirmed}</p>
      </CardHeader>
      <ul className="divide-y divide-border">
        {drafts.map((draft) => (
          <li key={draft.memberId} className="min-w-0">
            <details className="group">
              <summary className="min-h-11 cursor-pointer list-none px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 flex-1 break-words text-[14px] font-semibold text-foreground">{draft.name}</span>
                  <span className="shrink-0 whitespace-nowrap text-[14px] font-semibold tabular-nums text-foreground">{c.draftEstimate(formatEur(draft.estimatedTotal))}</span>
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <Badge className="shrink-0">{draft.kind === "new" ? c.draftNewOrder : c.draftChanges}</Badge>
                  <span className="min-w-0 text-[12px] text-muted-foreground">
                    <time dateTime={draft.updatedAt.toISOString()}>{c.draftModified(formatDateTime(draft.updatedAt))}</time>
                  </span>
                  <ChevronDown aria-hidden className="ml-auto size-4 shrink-0 text-secondary-foreground transition-transform group-open:rotate-180" />
                </span>
              </summary>
              <div className="border-t border-dashed border-border px-4 py-2.5">
                {draft.lines.length === 0 ? (
                  <p className="text-[13px] text-secondary-foreground">{c.draftNoProducts}</p>
                ) : (
                  <ul className="space-y-3">
                    {draft.lines.map((line) => {
                      const unit = line.unit?.trim();
                      const unitSuffix = unit && unit !== "1" ? ` ${unit}` : "";
                      return (
                        <li key={line.productId} className="flex items-start justify-between gap-3 text-[13px]">
                          <div className="min-w-0 break-words">
                            <p className="font-medium text-foreground">
                              {line.productName}
                              {line.variant && <span className="font-normal text-secondary-foreground"> · {line.variant}</span>}
                            </p>
                            {line.format && <p className="text-secondary-foreground">{line.format}</p>}
                            <p className="tabular-nums text-secondary-foreground">{formatNumber(line.quantity)}{unitSuffix} × {formatEur(line.unitPrice)}</p>
                          </div>
                          <p className="shrink-0 whitespace-nowrap tabular-nums text-foreground">{c.draftEstimate(formatEur(line.unitPrice * line.quantity))}</p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}
