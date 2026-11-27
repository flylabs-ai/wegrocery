import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { describeDb, makeScope } from "@/test/int/fixtures";
import { requireActiveMember, requireUserSession } from "@/lib/auth/session";
import { updateNotificationPreference } from "@/lib/actions/notifications";
import { readPushConsentAction, writePushConsentAction } from "@/lib/actions/push-consents";

vi.mock("@/lib/auth/session", () => ({
  requireActiveMember: vi.fn(),
  requireUserSession: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

describeDb("push consent (WGR-02)", () => {
  const scope = makeScope("push_consent");
  const category = "draft_reminder";
  let relativeId: string;

  function signInAs(personId: string) {
    const user = { personId, memberId: scope.memberId, email: "test@example.invalid" };
    vi.mocked(requireActiveMember).mockResolvedValue({ ...user, role: null });
    vi.mocked(requireUserSession).mockResolvedValue({ user });
  }

  beforeAll(async () => {
    vi.stubEnv("VAPID_PUBLIC_KEY", "test-public-key");
    await scope.createMember();
    relativeId = await scope.createExtraMember("relative");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await scope.cleanup();
  });

  it("keeps a relative's push consent and the account's app/email preferences independent", async () => {
    signInAs(scope.memberId);
    expect(await readPushConsentAction(category)).toBe(false);
    expect(await writePushConsentAction(category, true)).toEqual({ ok: true });
    expect(await readPushConsentAction(category)).toBe(true);

    signInAs(relativeId);
    expect(await readPushConsentAction(category)).toBe(false);
    expect(await writePushConsentAction(category, true)).toEqual({ ok: true });
    expect(await readPushConsentAction(category)).toBe(true);
    expect(await writePushConsentAction(category, false)).toEqual({ ok: true });

    const consents = () => scope.sql`
      SELECT person_id, category, enabled, updated_at FROM push_consents
      WHERE person_id IN (${scope.memberId}, ${relativeId}) ORDER BY person_id
    `;
    const before = await consents();
    expect(before).toHaveLength(2);
    expect(await updateNotificationPreference({ category, appEnabled: false, emailEnabled: true })).toEqual({ ok: true });
    expect(await updateNotificationPreference({ category, appEnabled: true, emailEnabled: false })).toEqual({ ok: true });
    expect(await consents()).toEqual(before);

    const prefs = () => scope.sql`
      SELECT app_enabled, email_enabled, updated_at FROM notification_preferences
      WHERE member_id = ${scope.memberId} AND category = ${category}
    `;
    const priorPrefs = await prefs();
    expect(priorPrefs).toMatchObject([{ app_enabled: true, email_enabled: false }]);
    expect(await readPushConsentAction(category)).toBe(false);
    signInAs(scope.memberId);
    expect(await readPushConsentAction(category)).toBe(true);
    expect(await writePushConsentAction(category, false)).toEqual({ ok: true });
    expect(await prefs()).toEqual(priorPrefs);
  });
});
