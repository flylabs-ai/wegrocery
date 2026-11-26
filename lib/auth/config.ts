import { betterAuth } from "better-auth";
import { recordUsage } from "@/lib/usage/events";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { authAccounts, authRateLimits, authSessions, authUsers, authVerifications, members } from "@/lib/db/schema";
import { normalizeEmail } from "@/lib/member-email";
import { reportError } from "@/lib/observability";
import { admitEmail, findMemberByLoginEmail, memberForNewSession } from "./admission";
import { AUTH_COOKIE_PREFIX } from "./cookie";
import { DEFAULT_EMAIL_CAPS, mayEmail, type EmailCaps } from "./email-caps";
import { authEmailKind, carriesLink, type AuthEmailKind } from "./email-kind";
import { oauthIdentityRefusal } from "./identity";
import { nextAfterLogin } from "./hosts";
import { resolveAuthHosts } from "./kit/hosts";
import { authOptions } from "./kit/options";
import { resolveAuthPolicy } from "./kit/policy";
import { demoLogin, devLogin } from "./plugins";
import { PREVIEW_LOGIN_PATH, previewLogin, previewLoginConfig } from "./preview-login";

// The one Better Auth configuration (auth.ts builds the instance). Sign-in
// with an email link by default, Google where its variables are set, the
// demo's and the developer's shortcuts where they apply. Who gets in is
// lib/auth/admission.ts, checked before a link goes out, when Google hands
// an identity over, and again when any session is created.
//
// The security settings (hashed links and codes, 6 digits and 3 tries,
// sessions, rate limits, cookies, trusted origins) come from the FlyLabs
// Kit's auth module (lib/auth/kit, white-label profile); this file keeps
// WeGrocery's own parts: adapter and models, admission, the sign-in email,
// hooks and the demo/dev/preview plugins.

type Env = Record<string, string | undefined>;
type Db = ReturnType<typeof getDb>;

// The "15 minuti" of the email (link and code): change them together.
export const MAGIC_LINK_MINUTES = 15;
const DAY_SECONDS = 24 * 60 * 60;

export type AuthEmail = {
  kind: AuthEmailKind;
  email: string;
  // The confirmation page on this deploy, for the kinds that carry a link;
  // the request form (/aderisci) for "signupRequired".
  url: string | null;
  // The 6-digit code that works like the link (typed on /login), same kinds.
  code: string | null;
};

export type CreateAuthOptions = {
  sendAuthEmail: (message: AuthEmail) => Promise<void>;
  // Tests pin a local URL; the app resolves it per request among the allowed hosts.
  baseURL?: string;
  // Better Auth turns its limiter on only in production; tests switch it on here.
  rateLimit?: boolean;
  env?: Env;
  // Runs the decision and the send of a sign-in email after the response
  // (the app passes next/server's after()), so the answer takes the same time
  // for a member and a stranger. Default: right away (tests).
  defer?: (task: () => Promise<void>) => void | Promise<void>;
  emailCaps?: EmailCaps;
};

export function googleCredentials(env: Env): { clientId: string; clientSecret: string } | null {
  const clientId = env.AUTH_GOOGLE_ID?.trim() ?? "";
  const clientSecret = env.AUTH_GOOGLE_SECRET?.trim() ?? "";
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

// The link in the email opens a page with a button (app/login/conferma), not
// Better Auth's verify endpoint: mail scanners open links, and a link that
// works once would be spent before the member clicks it.
export function confirmationURL(verifyUrl: string, token: string): string {
  const verify = new URL(verifyUrl);
  const confirm = new URL("/login/conferma", verify.origin);
  confirm.searchParams.set("token", token);
  confirm.searchParams.set("next", nextAfterLogin(verify.searchParams.get("callbackURL")));
  return confirm.toString();
}

export function createAuth(db: Db, options: CreateAuthOptions) {
  const env = options.env ?? process.env;
  const google = googleCredentials(env);
  const devEmail = normalizeEmail(env.AUTH_DEV_LOGIN_EMAIL);
  const preview = previewLoginConfig(env);

  // The code goes out in the link's email, so it is issued here rather than
  // through the plugin's own send endpoint (closed, see public-endpoints.ts).
  // Only the latest code of an address works: earlier ones are dropped.
  async function issueSignInCode(email: string): Promise<string> {
    await db.delete(authVerifications).where(eq(authVerifications.identifier, `sign-in-otp-${email.toLowerCase()}`));
    return instance.api.createVerificationOTP({ body: { email, type: "sign-in" } });
  }

  const production = env.NODE_ENV === "production";
  const policy = resolveAuthPolicy({
    profile: "white-label",
    production,
    session: { expiresIn: 30 * DAY_SECONDS, updateAge: DAY_SECONDS },
    magicLink: { expiresIn: MAGIC_LINK_MINUTES * 60 },
    emailOtp: { expiresIn: MAGIC_LINK_MINUTES * 60 },
    methods: { google: Boolean(google) },
    rateLimit: {
      // Better Auth turns its limiter on only in production; tests switch it on here.
      enabled: options.rateLimit ?? production,
      // On top of the kit's /sign-in/magic-link 3 and /sign-in/email-otp 5
      // a minute (the 3 tries a code allows and email-caps.ts come first).
      rules: { "/demo/sign-in": { window: 60, max: 30 }, [PREVIEW_LOGIN_PATH]: { window: 60, max: 10 } },
    },
  });
  // Tests pin a local URL; the app resolves it per request among the allowed hosts.
  const hosts = options.baseURL ? { baseURL: options.baseURL, trustedOrigins: [options.baseURL] } : resolveAuthHosts(env);

  const plugins = [
    ...(env.DEMO_MODE === "true" ? [demoLogin()] : []),
    ...(env.NODE_ENV !== "production" && devEmail ? [devLogin(devEmail)] : []),
    // Automated checks of a preview (staging) only: lib/auth/preview-login.ts.
    ...(preview ? [previewLogin(preview, findMemberByLoginEmail)] : []),
    // Last, as Better Auth wants: lets Server Actions set its cookies.
    nextCookies(),
  ];

  const instance = betterAuth(
    authOptions(policy, {
      adapter: drizzleAdapter(db, {
        provider: "pg",
        schema: { authUsers, authSessions, authAccounts, authVerifications, authRateLimits },
      }),
      secret: env.AUTH_SECRET ?? "",
      ...hosts,
      google: google
        ? {
            clientId: google.clientId,
            clientSecret: google.clientSecret,
            disableIdTokenSignIn: true,
            prompt: "select_account",
            // Name and email only: no profile picture.
            mapProfileToUser: () => ({ image: undefined }),
          }
        : undefined,
      // Better Auth answers every request the same way; which email goes
      // out (a link, an invitation, or why not) is decided here.
      sendMagicLink: async ({ email, url, token, metadata }) => {
        const task = async () => {
          try {
            const admission = await admitEmail(email, { emailVerified: true });
            const kind = authEmailKind(admission, metadata?.invite === true);
            if (!(await mayEmail(db, email, carriesLink(kind), options.emailCaps ?? DEFAULT_EMAIL_CAPS))) return;
            const withLink = carriesLink(kind);
            await options.sendAuthEmail({
              kind,
              email,
              // The request form on this deploy, for the email that explains how to ask.
              url: withLink ? confirmationURL(url, token) : kind === "signupRequired" ? new URL("/aderisci", url).toString() : null,
              code: withLink ? await issueSignInCode(email) : null,
            });
          } catch (e) {
            reportError("auth email", e);
          }
        };
        await (options.defer ?? ((t) => t()))(task);
      },
      // The code of the link's email (issueSignInCode). The plugin's own sends
      // are off: its email would carry no admission decision.
      sendVerificationOTP: async () => {},
      plugins,
      appOptions: {
        user: {
          modelName: "authUsers",
          // Google (every time) and a first email-link or code sign-in: the same gate as
          // the email link itself. A refusal lands on /login?error=<code>.
          validateUserInfo: async ({ user, source }) => {
            if (source.method !== "oauth" && source.method !== "magic-link" && source.method !== "email-otp") return;
            const refusal = oauthIdentityRefusal(user, source);
            if (refusal) return refusal;
            const email = typeof user.email === "string" ? user.email : "";
            const admission = await admitEmail(email, { emailVerified: true });
            if (admission.kind === "deny") return { error: admission.error };
          },
        },
        session: { modelName: "authSessions" },
        account: {
          modelName: "authAccounts",
          // Google's tokens are never kept nor refreshed: the app never calls
          // Google after the sign-in.
          updateAccountOnSignIn: false,
          // Google links to an existing identity only when Google verified the
          // address (Better Auth's rule without trusted providers).
          accountLinking: { enabled: true },
        },
        verification: { modelName: "authVerifications" },
        // A code is issued only to an address the admission let in; this rechecks
        // it when the code is typed, so an address refused since gets the same 400
        // as a wrong code instead of a session the hook below refuses (a 500).
        hooks: {
          before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== "/sign-in/email-otp") return;
            const email = typeof ctx.body?.email === "string" ? ctx.body.email : "";
            if ((await admitEmail(email, { emailVerified: true })).kind === "deny") {
              throw new APIError("BAD_REQUEST", { message: "Invalid OTP" });
            }
          }),
        },
        onAPIError: { errorURL: "/login?error=AccessDenied" },
        rateLimit: { modelName: "authRateLimits" },
        advanced: {
          cookiePrefix: AUTH_COOKIE_PREFIX,
          database: { generateId: () => crypto.randomUUID() },
          // Vercel overwrites this header: a client cannot fake its address.
          ipAddress: { ipAddressHeaders: ["x-vercel-forwarded-for"] },
        },
        databaseHooks: {
          session: {
            create: {
              // Every way in ends here: a session exists only for an active
              // member (created now for a card holder the check admitted), and it
              // keeps no IP address or browser.
              before: async (session) => {
                const [identity] = await db
                  .select({ email: authUsers.email, name: authUsers.name })
                  .from(authUsers)
                  .where(eq(authUsers.id, session.userId))
                  .limit(1);
                if (!identity) return false;
                // The name in a sign-in request is whatever the requester typed: never
                // use it for a new member.
                const memberId = await memberForNewSession(identity.email, null);
                if (!memberId) return false;
                return { data: { ...session, ipAddress: null, userAgent: null } };
              },
              after: async (session) => {
                await db.execute(sql`
                  UPDATE ${members} SET last_login_at = now()
                  WHERE member_id = (
                    SELECT m.member_id FROM ${members} m, ${authUsers} u
                    WHERE u.id = ${session.userId}
                      AND (lower(m.email) = lower(u.email) OR lower(m.alias_email) = lower(u.email))
                    LIMIT 1
                  )`);
                await recordUsage("login");
              },
            },
          },
          account: {
            create: {
              before: async (account) => ({
                data: { ...account, accessToken: null, refreshToken: null, idToken: null },
              }),
            },
          },
        },
      },
    }),
  );
  return instance;
}

export type Auth = ReturnType<typeof createAuth>;
