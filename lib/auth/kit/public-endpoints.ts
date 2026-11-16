export type AuthMethods = { magicLink: boolean; emailOtp: boolean; google: boolean };
export type ExtraAuthEndpoints = { GET?: readonly string[]; POST?: readonly string[] };

const paths = Object.freeze({
  magicLink: Object.freeze({ GET: "/api/auth/magic-link/verify", POST: "/api/auth/sign-in/magic-link" }),
  emailOtp: Object.freeze({ POST: "/api/auth/sign-in/email-otp" }),
  google: Object.freeze({ GET: "/api/auth/callback/google", POST: "/api/auth/sign-in/social" }),
});
const reserved = Object.values(paths).flatMap((entries) => Object.values(entries));
export const PUBLIC_AUTH_ENDPOINTS = Object.freeze({
  GET: Object.freeze([paths.magicLink.GET]),
  POST: Object.freeze([paths.magicLink.POST, paths.emailOtp.POST]),
});
export const GOOGLE_AUTH_ENDPOINTS = Object.freeze({ GET: Object.freeze([paths.google.GET]), POST: Object.freeze([paths.google.POST]) });

function validateExtras(extras: ExtraAuthEndpoints): void {
  if (Object.keys(extras).some((method) => method !== "GET" && method !== "POST")) throw new Error("Invalid extra auth method");
  for (const list of Object.values(extras)) {
    if (!Array.isArray(list) || list.some((path) => !/^\/api\/auth\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path) || reserved.includes(path))) {
      throw new Error("Extra auth endpoints must be exact app-owned paths");
    }
  }
}

export function isPublicAuthEndpoint(method: string, pathname: string, methods: AuthMethods, extras: ExtraAuthEndpoints = {}): boolean {
  validateExtras(extras);
  if (method !== "GET" && method !== "POST") return false;
  if (methods.magicLink && (method === "GET" ? pathname === paths.magicLink.GET : pathname === paths.magicLink.POST)) return true;
  if (methods.emailOtp && method === "POST" && pathname === paths.emailOtp.POST) return true;
  if (methods.google && (method === "GET" ? pathname === paths.google.GET : pathname === paths.google.POST)) return true;
  return extras[method]?.includes(pathname) ?? false;
}

/** Wrap the HTTP route only; the app retains its server-only auth.api calls. */
export function createAuthEndpointGuard(handler: (request: Request) => Response | Promise<Response>, methods: AuthMethods, extras: ExtraAuthEndpoints = {}) {
  validateExtras(extras);
  const allowed = { ...extras, GET: [...(extras.GET ?? [])], POST: [...(extras.POST ?? [])] };
  const selected = { ...methods };
  return async (request: Request): Promise<Response> => {
    if (!isPublicAuthEndpoint(request.method, new URL(request.url).pathname, selected, allowed)) return new Response(null, { status: 404 });
    return handler(request);
  };
}
