import { describe, expect, it } from "vitest";
import { createCspReportHandler } from "./csp-report";

const report = (blocked: string, page = "https://app.example/x?t=secret") =>
  JSON.stringify({ "csp-report": { "violated-directive": "img-src", "blocked-uri": blocked, "document-uri": page } });
const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://app.example/api/csp-report", { method: "POST", body, headers });

describe("createCspReportHandler", () => {
  it("logs one line per distinct violation, without query strings", async () => {
    const lines: string[] = [];
    const handle = createCspReportHandler({ log: (l) => lines.push(l) });
    expect((await handle(post(report("https://img.example/a.png?k=1")))).status).toBe(204);
    await handle(post(report("https://img.example/b.png")));
    expect(lines).toEqual([`csp-report {"directive":"img-src","blocked":"https://img.example","page":"/x"}`]);
    expect(lines.join()).not.toContain("secret");
  });

  it("refuses a body over the limit, declared or streamed", async () => {
    const handle = createCspReportHandler({ maxBytes: 100, log: () => {} });
    expect((await handle(post("x".repeat(101)))).status).toBe(413);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("x".repeat(80)));
        c.enqueue(new TextEncoder().encode("x".repeat(80)));
        c.close();
      },
    });
    const chunked = new Request("https://app.example/api/csp-report", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect((await handle(chunked)).status).toBe(413);
  });

  it("answers 400 to a body that is not JSON", async () => {
    expect((await createCspReportHandler({ log: () => {} })(post("{"))).status).toBe(400);
  });

  it("stops logging at the limit and starts again in the next window", async () => {
    let clock = 0;
    const lines: string[] = [];
    const handle = createCspReportHandler({ logLimit: 2, windowMs: 1000, now: () => clock, log: (l) => lines.push(l) });
    for (const host of ["a", "b", "c"]) await handle(post(report(`https://${host}.example/`)));
    expect(lines).toHaveLength(2);
    clock = 1001;
    await handle(post(report("https://c.example/")));
    await handle(post(report("https://a.example/")));
    expect(lines).toHaveLength(4);
  });
});
