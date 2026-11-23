"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { toast } from "@/components/app-ui/toast";
import { adminRecordManualCredit, adminRecordOutgoingMovement, adminRecordTopup, type CassaMovementResult } from "@/lib/actions/admin";
import { brand } from "@/lib/brand";
import { t } from "@/lib/i18n";
import { formatMoney, formatSignedMoney } from "@/lib/i18n/format";
import { utcToZonedLocalInput } from "@/lib/i18n/zoned-time";
import {
  MANUAL_PAYMENT_METHODS,
  manualMovementBalance,
  parseAmountInput,
  validateTopupAmount,
  type ManualPaymentMethod,
  type ManualLedgerType,
} from "@/lib/ledger";
import { formatDate } from "@/lib/utils";
import { MemberCombobox, type PickerMember } from "./member-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/app-ui/label";
import { NativeSelect } from "@/components/ui/native-select";

function todayInput(): string {
  return utcToZonedLocalInput(new Date()).slice(0, 10);
}

// ── Shared pieces ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="min-w-0">
      <Label htmlFor={id}>
        {label}
      </Label>
      {children(id)}
    </div>
  );
}

function MethodSelect({
  value,
  onChange,
  id,
}: {
  value: ManualPaymentMethod;
  onChange: (method: ManualPaymentMethod) => void;
  id: string;
}) {
  return (
    <NativeSelect
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as ManualPaymentMethod)}
      className="min-h-11"
    >
      {MANUAL_PAYMENT_METHODS.map((m) => (
        <option key={m} value={m}>
          {t.admin.treasury.methods[m]}
        </option>
      ))}
    </NativeSelect>
  );
}

type RecapLine = { label: string; value: string };

type Review = { warning: string | null; error: string | null };

// The recap shown before anything is written. `onConfirm(true)` resubmits
// after a possible-duplicate warning.
function Recap({
  title,
  lines,
  hint,
  balance,
  review,
  confirmLabel,
  isPending,
  onBack,
  onConfirm,
}: {
  title: string;
  lines: RecapLine[];
  hint: string;
  balance: React.ReactNode;
  review: Review;
  confirmLabel: string;
  isPending: boolean;
  onBack: () => void;
  onConfirm: (confirmDuplicate: boolean) => void;
}) {
  const headingRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div>
      <p ref={headingRef} tabIndex={-1} className="text-sm font-bold text-foreground">
        {title}
      </p>
      <p className="mb-3 text-sm text-secondary-foreground">{hint}</p>
      <dl className="divide-y divide-border rounded-lg border border-border">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <dt className="shrink-0 text-label font-semibold uppercase tracking-wide text-secondary-foreground">{line.label}</dt>
            <dd className="min-w-0 break-words text-right text-[13px] text-foreground">{line.value}</dd>
          </div>
        ))}
      </dl>
      {balance}
      {review.warning && (
        <p role="alert" className="mt-3 rounded-lg border border-primary/40 bg-primary-bg px-3 py-2 text-[12px] text-foreground">
          {review.warning}
        </p>
      )}
      {review.error && (
        <p role="alert" className="mt-3 rounded-lg border border-destructive/30 bg-danger-bg px-3 py-2 text-[12px] text-destructive">
          {review.error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={onBack}
          disabled={isPending}
          className="min-h-12 grow"
        >
          {t.admin.treasury.backToEdit}
        </Button>
        <Button
          onClick={() => onConfirm(review.warning !== null)}
          disabled={isPending}
          className="min-h-12 grow whitespace-normal text-center"
        >
          {isPending
            ? t.admin.treasury.registeringTopup
            : review.warning
              ? t.admin.treasury.recordAnyway
              : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

// Runs a Cassa action from the recap: an error or a duplicate warning keeps
// the recap open with the message, a success resets the form.
function useMovementSubmit(onRecorded: (memberName: string, notice: string | null) => void) {
  const [isPending, startTransition] = useTransition();
  const [review, setReview] = useState<Review | null>(null);

  function submit(action: () => Promise<CassaMovementResult>) {
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setReview({ warning: null, error: result.error });
      } else if (result.warning) {
        setReview({ warning: result.warning, error: null });
      } else {
        setReview(null);
        onRecorded(result.memberName ?? "", result.notice ?? null);
      }
    });
  }

  return { isPending, review, setReview, submit };
}

// A Cassa form folded behind its title: opened only when the admin needs it,
// so the balances list stays in view.
function FoldableCard({
  title,
  hint,
  open,
  onToggle,
  children,
}: {
  title: string;
  hint: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = useId();
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
      >
        <span>
          <span className="block text-sm font-bold text-foreground">{title}</span>
          <span className="mt-0.5 block text-sm text-secondary-foreground">{hint}</span>
        </span>
        <ChevronDown aria-hidden className={`size-4 shrink-0 text-muted-foreground ${open ? "rotate-180" : ""}`} />
      </button>
      <div id={panelId} hidden={!open} className="mt-4">
        {children}
      </div>
    </div>
  );
}

// The ledger rounds the typed amount to cents before applying its sign.
function BalancePreview({ change, after, balance }: { change: number; after: number; balance: number }) {
  const tr = t.admin.treasury;
  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary p-3">
      <dl className="flex flex-wrap gap-x-6 gap-y-2 tabular-nums">
        <div>
          <dt className="text-label text-secondary-foreground">{tr.balanceBefore}</dt>
          <dd className="text-sm font-semibold text-foreground">{formatMoney(balance)}</dd>
        </div>
        <div>
          <dt className="text-label text-secondary-foreground">{tr.balanceChange}</dt>
          <dd className="text-sm font-semibold text-foreground">{formatSignedMoney(change)}</dd>
        </div>
        <div>
          <dt className="text-label text-secondary-foreground">{tr.balanceAfter}</dt>
          <dd className={`text-sm font-bold ${after < 0 ? "text-destructive" : "text-foreground"}`}>{formatMoney(after)}</dd>
        </div>
      </dl>
      {after < 0 && (
        <p className="mt-2 text-sm font-medium text-destructive">{tr.balanceOwed(formatMoney(-after))}</p>
      )}
    </div>
  );
}

export function MovementForm({
  kind,
  members = [],
  fixedMember,
}: {
  kind: Exclude<ManualLedgerType, "payout">;
  members?: PickerMember[];
  fixedMember?: PickerMember;
}) {
  const tr = t.admin.treasury;
  const copy = tr.movementActions[kind];
  const reasonHintId = useId();
  const [open, setOpen] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ManualPaymentMethod>("bonifico");
  const [externalRef, setExternalRef] = useState("");
  const [entryDate, setEntryDate] = useState(todayInput);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const member = fixedMember ?? members.find((candidate) => candidate.memberId === memberId) ?? null;
  const isTopup = kind === "topup";
  const parsedAmount = parseAmountInput(amount);
  const hasAmount = validateTopupAmount(parsedAmount) === null;
  const preview = member && hasAmount ? manualMovementBalance(kind, parsedAmount, member.balance) : null;
  const balancePreview = member && preview ? (
    <BalancePreview {...preview} balance={member.balance} />
  ) : null;

  const { isPending, review, setReview, submit } = useMovementSubmit((memberName, notice) => {
    const recorded = isTopup ? tr.topupRegistered : tr.balanceMovementRegistered[kind];
    toast.success(recorded(formatMoney(Math.abs(preview?.change ?? parsedAmount)), memberName));
    if (notice) toast.warning(notice, { duration: 12000 });
    setMemberId(null);
    setAmount("");
    setMethod("bonifico");
    setExternalRef("");
    setEntryDate(todayInput());
    setNote("");
  });

  function handleReview(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!member) {
      setFormError(tr.chooseMember);
    } else if (!hasAmount) {
      setFormError(tr.enterPositiveAmount);
    } else if (!isTopup && !note.trim()) {
      setFormError(tr.movementErrors.noteRequired);
    } else {
      setFormError(null);
      setReview({ warning: null, error: null });
    }
  }

  function confirm(confirmDuplicate: boolean) {
    if (!member || !preview) return;
    const input = {
      memberId: member.memberId,
      amount: Math.abs(preview.change),
      note,
      entryDate,
      confirmDuplicate,
    };
    if (isTopup) {
      submit(() => adminRecordTopup({ ...input, method, externalRef }));
    } else if (kind === "manual_credit") {
      submit(() => adminRecordManualCredit(input));
    } else {
      submit(() => adminRecordOutgoingMovement({ ...input, type: kind }));
    }
  }

  function toggle() {
    if (isPending) return;
    setOpen((value) => !value);
  }

  let body: React.ReactNode = null;
  if (open && review && member && preview) {
    const lines: RecapLine[] = [
      { label: tr.recapMember, value: `${member.fullName} (${member.email})` },
      ...(isTopup ? [{ label: tr.recapMethod, value: tr.methods[method] }] : []),
      ...(isTopup && externalRef.trim() ? [{ label: tr.recapRef, value: externalRef.trim() }] : []),
      { label: tr.recapDate, value: entryDate ? formatDate(entryDate) : formatDate(new Date()) },
      ...(note.trim() ? [{ label: isTopup ? tr.recapNote : tr.recapReason, value: note.trim() }] : []),
    ];
    body = (
      <Recap
        title={copy.title}
        hint={copy.hint}
        lines={lines}
        balance={balancePreview}
        review={review}
        confirmLabel={copy.confirm(formatMoney(Math.abs(preview.change)))}
        isPending={isPending}
        onBack={() => setReview(null)}
        onConfirm={confirm}
      />
    );
  } else if (open) {
    body = (
      <form onSubmit={handleReview} noValidate className="space-y-3">
        {fixedMember ? (
          <p className="text-sm font-semibold text-foreground">{fixedMember.fullName}</p>
        ) : (
          <MemberCombobox
            members={members}
            value={member}
            onChange={(selected) => {
              setMemberId(selected?.memberId ?? null);
              setFormError(null);
            }}
            label={tr.memberLabel}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr.amountLabel(brand.currency)}>
            {(id) => (
              <Input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={tr.amountPlaceholder}
                className="min-h-11"
              />
            )}
          </Field>
          <Field label={tr.dateLabel}>
            {(id) => (
              <Input
                id={id}
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="min-h-11"
              />
            )}
          </Field>
        </div>
        {balancePreview}
        {isTopup && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr.methodLabel}>
              {(id) => <MethodSelect id={id} value={method} onChange={setMethod} />}
            </Field>
            <Field label={tr.externalRefLabel}>
              {(id) => (
                <Input
                  id={id}
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  placeholder={tr.externalRefPlaceholder}
                  className="min-h-11"
                />
              )}
            </Field>
          </div>
        )}
        <Field label={isTopup ? tr.noteLabel : tr.reasonLabel}>
          {(id) => (
            <>
              <Input
                id={id}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={isTopup ? tr.notePlaceholder : undefined}
                aria-describedby={isTopup ? undefined : reasonHintId}
                className="min-h-11"
              />
              {!isTopup && <p id={reasonHintId} className="mt-1 text-label text-secondary-foreground">{tr.reasonHint}</p>}
            </>
          )}
        </Field>
        {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
        <Button type="submit" block className="min-h-12 whitespace-normal text-center">
          {copy.review}
        </Button>
      </form>
    );
  }

  return (
    <FoldableCard
      title={copy.title}
      hint={copy.hint}
      open={open}
      onToggle={toggle}
    >
      {body}
    </FoldableCard>
  );
}
