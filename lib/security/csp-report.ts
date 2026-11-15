import { parseCspReports, type CspViolation } from "./csp";

// The handler of the app's public CSP report endpoint (app/api/csp-report/route.ts):
//   export const runtime = "nodejs";
//   export const dynamic = "force-dynamic";
//   export const POST = createCspReportHandler();
// It reads at most `maxBytes`, keeps only the directive, the origin of what
// was blocked and the page path (parseCspReports), and logs one line per
// distinct violation, at most `logLimit` per window and per instance, so a
// script posting reports cannot fill the log.

export interface CspReportOptions {
  maxBytes?: number;
  logLimit?: number;
  windowMs?: number;
  log?: (line: string) => void;
  now?: () => number;
}

async function readLimited(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

export function createCspReportHandler({
  maxBytes = 16 * 1024,
  logLimit = 200,
  windowMs = 60 * 60 * 1000,
  log = (line) => console.info(line),
  now = Date.now,
}: CspReportOptions = {}): (request: Request) => Promise<Response> {
  let windowStart = now();
  let seen = new Set<string>();
  return async (request) => {
    const text = await readLimited(request, maxBytes);
    if (text === null) return new Response(null, { status: 413 });
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return new Response(null, { status: 400 });
    }
    if (now() - windowStart > windowMs) {
      windowStart = now();
      seen = new Set();
    }
    for (const v of parseCspReports(payload)) {
      const key = `${v.directive} ${v.blocked} ${v.page}`;
      if (seen.has(key) || seen.size >= logLimit) continue;
      seen.add(key);
      log(`csp-report ${JSON.stringify(v satisfies CspViolation)}`);
    }
    return new Response(null, { status: 204 });
  };
}
