import { afterAll, beforeAll, expect, it } from "vitest";
import { getDb } from "@/lib/db/client";
import { describeDb, makeScope } from "@/test/int/fixtures";
import { createAuth, type Auth } from "./config";
import { PREVIEW_LOGIN_HEADER } from "./preview-login";

// The preview check's sign-in on a real database: the right secret signs the
// test member in for two hours; a wrong secret, a missing or inactive member,
// and any deploy that is not a configured preview get nobody in.
const BASE = "http://localhost:3000";
const SECRET = "preview-secret-at-least-32-characters!!";

function cookieOf(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .filter((c) => !c.endsWith("="))
    .join("; ");
}

describeDb("sign-in for the preview check", () => {
  const scope = makeScope("preview_login");
  const { sql } = scope;
  // Lower case: the scope's prefix is the cleanup key.
  const userEmail = `${scope.prefix}.socio@example.com`;
  const adminEmail = `${scope.prefix}.admin@example.com`;
  let ip = 10;

  function build(env: Record<string, string | undefined> = {}): Auth {
    return createAuth(getDb(), {
      baseURL: BASE,
      env: {
        ...process.env,
        AUTH_SECRET: "test-secret-at-least-32-characters-long!!",
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
        PREVIEW_LOGIN_SECRET: SECRET,
        PREVIEW_LOGIN_EMAILS: `${userEmail},${adminEmail}`,
        ...env,
      },
      sendAuthEmail: async () => {},
    });
  }

  function signIn(auth: Auth, profile: string, secret: string | null = SECRET): Promise<Response> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      origin: BASE,
      "x-vercel-forwarded-for": `198.51.100.${ip++}`,
    };
    if (secret !== null) headers[PREVIEW_LOGIN_HEADER] = secret;
    return auth.handler(
      new Request(`${BASE}/api/auth/preview/sign-in`, { method: "POST", headers, body: JSON.stringify({ profile }) }),
    );
  }

  beforeAll(async () => {
    await scope.createMember();
    await sql`UPDATE members SET email = ${userEmail} WHERE member_id = ${scope.memberId}`;
  });

  afterAll(async () => {
    await sql`DELETE FROM auth_users WHERE lower(email) LIKE ${`${scope.prefix}%`}`;
    await scope.cleanup();
  });

  it("signs the test member in for two hours with the right secret", async () => {
    const auth = build();
    const res = await signIn(auth, "user");
    expect(res.status).toBe(200);
    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookieOf(res) }) });
    expect(session?.user.email).toBe(userEmail);
    const hours = (new Date(session!.session.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(1.9);
    expect(hours).toBeLessThanOrEqual(2);
  });

  it("refuses a wrong or missing secret", async () => {
    const auth = build();
    expect((await signIn(auth, "user", `${SECRET}x`)).status).toBe(403);
    expect((await signIn(auth, "user", null)).status).toBe(403);
  });

  it("refuses a test address with no member, and creates no identity for it", async () => {
    const res = await signIn(build(), "admin");
    expect(res.status).toBe(403);
    const rows = await sql`SELECT 1 FROM auth_users WHERE lower(email) = ${adminEmail}`;
    expect(rows).toHaveLength(0);
  });

  it("refuses an inactive test member", async () => {
    await sql`UPDATE members SET active = false WHERE member_id = ${scope.memberId}`;
    try {
      expect((await signIn(build(), "user")).status).toBe(403);
    } finally {
      await sql`UPDATE members SET active = true WHERE member_id = ${scope.memberId}`;
    }
  });

  it("does not exist outside a configured preview", async () => {
    for (const env of [{ VERCEL_ENV: "production" }, { VERCEL_ENV: undefined }, { PREVIEW_LOGIN_SECRET: undefined }]) {
      expect((await signIn(build(env), "user")).status).toBe(404);
    }
  });
});
