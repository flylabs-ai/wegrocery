import { createCspReportHandler } from "@/lib/security/csp-report";

// Where browsers send what the Content Security Policy would have blocked
// (lib/security/csp.ts). Public, like any CSP endpoint: the kit's handler
// reads at most 16 KB, keeps only the directive, the origin of what was
// blocked and the page path, and writes one log line per distinct violation,
// at most 200 per hour and per instance.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createCspReportHandler();
