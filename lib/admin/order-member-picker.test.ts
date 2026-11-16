import { describe, expect, it } from "vitest";
import { splitOrderMembers } from "./order-member-picker";

const members = [
  { memberId: "a", fullName: "Anna Bianchi" },
  { memberId: "b", fullName: "Bruno Verdi" },
  { memberId: "c", fullName: "Carla Neri" },
];

describe("splitOrderMembers", () => {
  it("puts members with order lines first and keeps the given order", () => {
    const { ordered, notOrdered } = splitOrderMembers(members, [
      { memberId: "c", lineCount: 2, total: 5.5, paidCents: 600, hasDraft: false },
      { memberId: "b", lineCount: 0, total: 0, paidCents: 0, hasDraft: true },
    ]);
    expect(ordered.map((m) => m.memberId)).toEqual(["c"]);
    expect(ordered[0]).toMatchObject({ lineCount: 2, total: 5.5, paidCents: 600 });
    expect(notOrdered.map((m) => m.memberId)).toEqual(["a", "b"]);
    expect(notOrdered[1].hasDraft).toBe(true);
  });

  it("filters both groups by name, ignoring case and spaces", () => {
    const { ordered, notOrdered } = splitOrderMembers(
      members,
      [{ memberId: "a", lineCount: 1, total: 1, paidCents: 0, hasDraft: false }],
      "  ER ",
    );
    expect(ordered).toEqual([]);
    expect(notOrdered.map((m) => m.memberId)).toEqual(["b", "c"]);
  });

  it("treats a payment without lines as not ordered (the lines decide)", () => {
    const { ordered, notOrdered } = splitOrderMembers(members.slice(0, 1), [
      { memberId: "a", lineCount: 0, total: 0, paidCents: 1149, hasDraft: false },
    ]);
    expect(ordered).toEqual([]);
    expect(notOrdered[0].paidCents).toBe(1149);
  });
});
