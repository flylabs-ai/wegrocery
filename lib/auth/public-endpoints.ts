import { googleCredentials } from "./config";
import { isPublicAuthEndpoint as isKitPublicAuthEndpoint } from "./kit/public-endpoints";

// The only Better Auth endpoints that answer over HTTP, from the FlyLabs
// Kit's auth module (lib/auth/kit): the email link (send and verify) and its
// code always, Google's redirect and way back where its variables are set.
// Everything else (listing or revoking sessions...) is called server-side
// through its API, or not at all. WeGrocery adds the demo's sign-in on the
// demo and the developer's outside production.
export function isPublicAuthEndpoint(
  method: string,
  pathname: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  const post: string[] = [];
  if (env.DEMO_MODE === "true") post.push("/api/auth/demo/sign-in");
  if (env.NODE_ENV !== "production" && env.AUTH_DEV_LOGIN_EMAIL?.trim()) post.push("/api/auth/dev/sign-in");
  const methods = { magicLink: true, emailOtp: true, google: Boolean(googleCredentials(env)) };
  return isKitPublicAuthEndpoint(method, pathname, methods, { POST: post });
}
