import { createHash, timingSafeEqual } from "node:crypto";
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { normalizeEmail } from "@/lib/member-email";

// A way in for automated checks of a Vercel preview (staging): an agent signs
// in as one of two test members without an email. It exists only on a
// preview deploy with both variables set; production, the demo and a local
// machine never register it (see previewLoginConfig and its tests).
//
// POST /api/auth/preview/sign-in { profile: "user" | "admin" }
// header x-preview-login-secret: PREVIEW_LOGIN_SECRET
//
// Only the two addresses of PREVIEW_LOGIN_EMAILS ("user@example.com,
// admin@example.com"), only on example.com so a real member can never be one,
// and only when that member already exists and is active: nothing is created
// here besides the sign-in identity of that member.

type Env = Record<string, string | undefined>;

export const PREVIEW_LOGIN_PATH = "/preview/sign-in";
export const PREVIEW_LOGIN_HEADER = "x-preview-login-secret";
export const PREVIEW_LOGIN_MIN_SECRET = 32;
export const PREVIEW_SESSION_SECONDS = 2 * 60 * 60;
const TEST_DOMAIN = "@example.com";

export type PreviewLoginConfig = { secret: string; emails: { user: string; admin: string } };

export function previewLoginConfig(env: Env): PreviewLoginConfig | null {
  if (env.VERCEL_ENV !== "preview" || env.DEMO_MODE === "true") return null;
  const secret = env.PREVIEW_LOGIN_SECRET?.trim() ?? "";
  if (secret.length < PREVIEW_LOGIN_MIN_SECRET) return null;
  const [user, admin, ...rest] = (env.PREVIEW_LOGIN_EMAILS ?? "").split(",").map((v) => normalizeEmail(v));
  if (rest.length > 0 || !user || !admin || user === admin) return null;
  if (![user, admin].every((email) => email.endsWith(TEST_DOMAIN) && email.indexOf("@") === email.lastIndexOf("@"))) {
    return null;
  }
  return { secret, emails: { user, admin } };
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function secretMatches(given: string | null | undefined, secret: string): boolean {
  return timingSafeEqual(digest(given ?? ""), digest(secret));
}

export type FindActiveMember = (email: string) => Promise<{ active: boolean } | null>;

export function previewLogin(config: PreviewLoginConfig, findMember: FindActiveMember): BetterAuthPlugin {
  return {
    id: "preview-login",
    endpoints: {
      previewSignIn: createAuthEndpoint(PREVIEW_LOGIN_PATH, { method: "POST" }, async (ctx) => {
        if (!secretMatches(ctx.headers?.get(PREVIEW_LOGIN_HEADER), config.secret)) throw new APIError("FORBIDDEN");
        const profile = (ctx.body as { profile?: unknown } | undefined)?.profile === "admin" ? "admin" : "user";
        const email = config.emails[profile];
        const member = await findMember(email);
        if (!member?.active) throw new APIError("FORBIDDEN");
        const adapter = ctx.context.internalAdapter;
        const found = await adapter.findUserByEmail(email);
        const user = found?.user ?? (await adapter.createUser({ email, name: "", emailVerified: true }, { method: "admin" }));
        const session = await adapter.createSession(user.id, true, {
          expiresAt: new Date(Date.now() + PREVIEW_SESSION_SECONDS * 1000),
        });
        if (!session) throw new APIError("FORBIDDEN");
        await setSessionCookie(ctx, { session, user }, true);
        console.info(`preview-login profile=${profile}`);
        return ctx.json({ ok: true, profile });
      }),
    },
  };
}
