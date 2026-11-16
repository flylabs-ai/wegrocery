import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { memberUnsubscribeHeaders, signMemberUnsubscribeToken, verifyMemberUnsubscribeToken } from "./unsubscribe-config";

const SECRET = "x".repeat(40);

// A link as WeGrocery signed it before FlyLabs Kit email 2.0.
function legacyToken(memberId: string, category: string, secret: string): string {
  const payload = Buffer.from(`${memberId}.${category}`).toString("base64url");
  const signature = createHmac("sha256", `wegrocery-unsubscribe-v1:${secret}`).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

describe("member unsubscribe links", () => {
  it("round-trips a member and a category in the kit's format", () => {
    const token = signMemberUnsubscribeToken("mem_1", "order_charge", SECRET);
    expect(token).toMatch(/^v2\./);
    expect(verifyMemberUnsubscribeToken(token, SECRET)).toEqual({ memberId: "mem_1", category: "order_charge" });
    expect(verifyMemberUnsubscribeToken(token, "y".repeat(40))).toBeNull();
  });

  it("still accepts the links already sent, and refuses a forged one", () => {
    expect(verifyMemberUnsubscribeToken(legacyToken("mem_1", "pickup", SECRET), SECRET)).toEqual({ memberId: "mem_1", category: "pickup" });
    expect(verifyMemberUnsubscribeToken(legacyToken("mem_1", "pickup", "other".repeat(8)), SECRET)).toBeNull();
    expect(verifyMemberUnsubscribeToken(legacyToken("mem_1", "not_a_category", SECRET), SECRET)).toBeNull();
    expect(verifyMemberUnsubscribeToken("garbage", SECRET)).toBeNull();
  });

  it("gives the one-click pair pointing at /api/unsubscribe, with a link that verifies", () => {
    const headers = memberUnsubscribeHeaders({ memberId: "mem_1", category: "pickup" }, "https://gas.example.org/", SECRET)!;
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    const url = new URL(headers["List-Unsubscribe"].slice(1, -1));
    expect(url.origin + url.pathname).toBe("https://gas.example.org/api/unsubscribe");
    expect(verifyMemberUnsubscribeToken(url.searchParams.get("t")!, SECRET)).toEqual({ memberId: "mem_1", category: "pickup" });
  });

  it("gives nothing without a category, a base URL, a secret or https", () => {
    expect(memberUnsubscribeHeaders({ memberId: "m", category: null }, "https://a.example", SECRET)).toBeNull();
    expect(memberUnsubscribeHeaders({ memberId: "m", category: "pickup" }, null, SECRET)).toBeNull();
    expect(memberUnsubscribeHeaders({ memberId: "m", category: "pickup" }, "https://a.example", undefined)).toBeNull();
    expect(memberUnsubscribeHeaders({ memberId: "m", category: "pickup" }, "http://localhost:3000", SECRET)).toBeNull();
  });
});
