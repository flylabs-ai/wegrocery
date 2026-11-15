import { parseCspReports } from "@/lib/security/csp";

// Where browsers send what the Content Security Policy would have blocked
// (lib/security/csp.ts). Public, like any CSP endpoint: it reads at most 16 KB,
// keeps only the directive, the origin of what was blocked and the page path,
// and writes one log line per distinct violation. Each instance logs at most
// LOG_LIMIT lines per hour, so a script posting reports cannot fill the log.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY = 16 * 1024;
const LOG_LIMIT = 200;
const WINDOW_MS = 60 * 60 * 1000;

let windowStart = Date.now();
let seen = new Set<string>();

export async function POST(request: Request): Promise<Response> {
  const text = await request.text();
  if (text.length > MAX_BODY) return new Response(null, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (Date.now() - windowStart > WINDOW_MS) {
    windowStart = Date.now();
    seen = new Set();
  }
  for (const v of parseCspReports(payload)) {
    const key = `${v.directive} ${v.blocked} ${v.page}`;
    if (seen.has(key) || seen.size >= LOG_LIMIT) continue;
    seen.add(key);
    console.info(`csp-report ${JSON.stringify(v)}`);
  }
  return new Response(null, { status: 204 });
}
