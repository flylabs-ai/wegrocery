// The "order for a member" picker (Admin, Ciclo, Ordini): the members who
// already ordered on the cycle first, to edit their order, then the ones who
// did not, to add one. Pure, so it can be unit tested.

export type OrderMemberSummary = {
  memberId: string;
  /** Order lines on the cycle (0 = no order yet). */
  lineCount: number;
  /** Effective order total, products only. */
  total: number;
  /** What a card order payment for the cycle still holds, in cents. */
  paidCents: number;
  /** An unconfirmed draft is waiting on the cycle. */
  hasDraft: boolean;
};

export type PickerMember = {
  memberId: string;
  fullName: string;
  lineCount: number;
  total: number;
  paidCents: number;
  hasDraft: boolean;
};

export function splitOrderMembers(
  members: ReadonlyArray<{ memberId: string; fullName: string }>,
  summaries: ReadonlyArray<OrderMemberSummary>,
  query = "",
): { ordered: PickerMember[]; notOrdered: PickerMember[] } {
  const byId = new Map(summaries.map((s) => [s.memberId, s]));
  const q = query.trim().toLocaleLowerCase();
  const ordered: PickerMember[] = [];
  const notOrdered: PickerMember[] = [];
  for (const m of members) {
    if (q && !m.fullName.toLocaleLowerCase().includes(q)) continue;
    const s = byId.get(m.memberId);
    const row: PickerMember = {
      memberId: m.memberId,
      fullName: m.fullName,
      lineCount: s?.lineCount ?? 0,
      total: s?.total ?? 0,
      paidCents: s?.paidCents ?? 0,
      hasDraft: s?.hasDraft ?? false,
    };
    (row.lineCount > 0 ? ordered : notOrdered).push(row);
  }
  return { ordered, notOrdered };
}
