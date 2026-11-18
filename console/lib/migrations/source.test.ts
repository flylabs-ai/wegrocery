import { describe, expect, it } from "vitest";
import type { FetchLike } from "@/lib/http";
import { gitBlobSha, githubSource, validRef } from "./source";

const SHA = "a".repeat(40);
const REPO = "flylabs-ai/wegrocery";

const enc = (s: string) => new TextEncoder().encode(s);

/** A fake GitHub: routes by URL, records them. */
function fakeGithub(opts: { compare?: Record<string, string>; files?: Record<string, string>; tamper?: string } = {}) {
  const files = opts.files ?? { "0001_a.sql": "SELECT 1;", "0001_a_down.sql": "SELECT 0;", "0002_b.sql": "SELECT 2;" };
  const urls: string[] = [];
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const f: FetchLike = async (url) => {
    urls.push(url);
    const u = new URL(url);
    if (u.host === "raw.githubusercontent.com") {
      const name = decodeURIComponent(u.pathname.split("/").pop()!);
      const body = name === opts.tamper ? `${files[name]} -- changed` : files[name];
      return body === undefined ? new Response("", { status: 404 }) : new Response(enc(body));
    }
    if (u.pathname.endsWith("/commits/staging") || u.pathname.endsWith(`/commits/${SHA}`)) return json({ sha: SHA });
    const cmp = u.pathname.match(/\/compare\/[a-f0-9]+\.\.\.(\w+)$/);
    if (cmp) return json({ status: opts.compare?.[cmp[1]] ?? "ahead" });
    if (u.pathname.endsWith("/contents/drizzle")) {
      return json([
        ...Object.entries(files).map(([name, sql]) => ({ name, type: "file", sha: gitBlobSha(enc(sql)) })),
        { name: "meta", type: "dir", sha: "b".repeat(40) },
      ]);
    }
    return json({ message: "Not Found" }, 404);
  };
  return { f, urls };
}

describe("validRef", () => {
  it("accepts branches, tags and commits, refuses traversal", () => {
    expect(validRef("staging")).toBe(true);
    expect(validRef("v1.50.0")).toBe(true);
    expect(validRef(SHA)).toBe(true);
    expect(validRef("../main")).toBe(false);
    expect(validRef("a b")).toBe(false);
    expect(validRef("")).toBe(false);
  });
});

describe("gitBlobSha", () => {
  it("matches git hash-object", () => {
    // printf 'hello\n' | git hash-object --stdin
    expect(gitBlobSha(enc("hello\n"))).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  });
});

describe("githubSource.load", () => {
  it("resolves the commit on staging and returns its migration files, without _down", async () => {
    const { f, urls } = fakeGithub();
    const b = await githubSource({ repo: REPO, fetchImpl: f }).load("staging");
    expect(b.sha).toBe(SHA);
    expect(b.branch).toBe("staging");
    expect(b.files).toEqual([
      { name: "0001_a.sql", sql: "SELECT 1;" },
      { name: "0002_b.sql", sql: "SELECT 2;" },
    ]);
    expect(urls).toContain(`https://api.github.com/repos/${REPO}/contents/drizzle?ref=${SHA}`);
    expect(urls).toContain(`https://raw.githubusercontent.com/${REPO}/${SHA}/drizzle/0002_b.sql`);
  });

  it("falls back to main and refuses a commit on neither branch", async () => {
    const onMain = fakeGithub({ compare: { staging: "diverged", main: "identical" } });
    expect((await githubSource({ repo: REPO, fetchImpl: onMain.f }).load(SHA)).branch).toBe("main");
    const nowhere = fakeGithub({ compare: { staging: "diverged", main: "behind" } });
    await expect(githubSource({ repo: REPO, fetchImpl: nowhere.f }).load(SHA)).rejects.toThrow(/non è su staging né su main/);
  });

  it("refuses a file that is not the one in the commit", async () => {
    const { f } = fakeGithub({ tamper: "0002_b.sql" });
    await expect(githubSource({ repo: REPO, fetchImpl: f }).load("staging")).rejects.toThrow(/non corrisponde/);
  });

  it("refuses a bad ref or repository before any call", async () => {
    const { f, urls } = fakeGithub();
    await expect(githubSource({ repo: REPO, fetchImpl: f }).load("../x")).rejects.toThrow(/non valido/);
    expect(() => githubSource({ repo: "not a repo", fetchImpl: f })).toThrow();
    expect(urls).toEqual([]);
  });
});
