import { describe, expect, it } from "vitest";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { emailOTP, magicLink } from "better-auth/plugins";
import { authOptions } from "./options";
import { resolveAuthPolicy } from "./policy";

const BASE = "https://app.example.com";
const SECRET = "synthetic-in-memory-auth-secret-for-tests";
const EMAIL = "member@example.com";
type Store = Record<string, Record<string, unknown>[]>;
function setup(production = false) {
  const store: Store = { user: [], session: [], account: [], verification: [], rateLimit: [] };
  const links: string[] = [];
  const auth = betterAuth(authOptions(resolveAuthPolicy({ profile: "white-label", production }), {
    adapter: memoryAdapter(store), secret: SECRET, baseURL: BASE, trustedOrigins: [BASE],
    sendMagicLink: async ({ token }) => { links.push(token); }, sendVerificationOTP: async () => {},
    appOptions: { logger: { disabled: true } },
  }));
  const post = (path: string, body: object, origin = BASE) => auth.handler(new Request(`${BASE}/api/auth${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin, "sec-fetch-site": origin === BASE ? "same-origin" : "cross-site", "sec-fetch-mode": "cors" }, body: JSON.stringify(body),
  }));
  return { auth, store, links, post };
}
describe("Better Auth 1.7.18 with a real memory adapter", () => {
  it("invalidates an OTP after three wrong attempts", async () => {
    const { auth, post, store } = setup();
    const otp = await auth.api.createVerificationOTP({ body: { email: EMAIL, type: "sign-in" } });
    expect(otp).toMatch(/^\d{6}$/);
    const wrong = otp === "000000" ? "111111" : "000000";
    for (let i = 0; i < 3; i++) expect((await post("/sign-in/email-otp", { email: EMAIL, otp: wrong })).status).toBe(400);
    expect((await post("/sign-in/email-otp", { email: EMAIL, otp })).status).toBe(403);
    expect(store.session).toHaveLength(0);
  });
  it("stores no cleartext magic token and creates no session for a foreign origin", async () => {
    const { post, links, store } = setup();
    expect((await post("/sign-in/magic-link", { email: EMAIL, callbackURL: BASE })).status).toBe(200);
    expect(links).toHaveLength(1);
    expect(JSON.stringify(store.verification)).not.toContain(links[0]);
    expect(JSON.stringify(store.verification)).toContain("magic-link:");
    expect((await post("/sign-in/magic-link", { email: EMAIL, callbackURL: BASE }, "https://foreign.example.test")).status).toBe(403);
    expect(links).toHaveLength(1);
    expect(store.session).toHaveLength(0);
  });
  it("retains a token and OTP issued by the apps' original plugin settings", async () => {
    const { auth, store } = setup();
    let token = "";
    const legacy = betterAuth({ database: memoryAdapter(store), secret: SECRET, baseURL: BASE, logger: { disabled: true },
      plugins: [magicLink({ expiresIn: 900, storeToken: "hashed", sendMagicLink: async (data) => { token = data.token; } }), emailOTP({ expiresIn: 900, otpLength: 6, allowedAttempts: 3, storeOTP: "hashed", sendVerificationOTP: async () => {} })],
    });
    await legacy.api.signInMagicLink({ body: { email: EMAIL, callbackURL: BASE }, headers: new Headers({ origin: BASE }) });
    const result = await auth.handler(new Request(`${BASE}/api/auth/magic-link/verify?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(BASE)}`));
    expect(result.status).toBe(302);
    expect(store.session).toHaveLength(1);
    const otp = await legacy.api.createVerificationOTP({ body: { email: EMAIL, type: "sign-in" } });
    const response = await auth.handler(new Request(`${BASE}/api/auth/sign-in/email-otp`, { method: "POST", headers: { origin: BASE, "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, otp }) }));
    expect(response.status).toBe(200);
    expect(store.session).toHaveLength(2);
  });
  it("persists the production limiter through the injected database adapter", async () => {
    const { post, store, links } = setup(true);
    for (let i = 0; i < 3; i++) expect((await post("/sign-in/magic-link", { email: EMAIL, callbackURL: BASE })).status).toBe(200);
    expect((await post("/sign-in/magic-link", { email: EMAIL, callbackURL: BASE })).status).toBe(429);
    expect(store.rateLimit.length).toBeGreaterThan(0);
    expect(links).toHaveLength(3);
  });
});
