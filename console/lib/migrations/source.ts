import { createHash } from "node:crypto";
import { fetchWithTimeout, ProviderError, requestJson, type FetchLike } from "@/lib/http";
import { isMigrationFile, type MigrationSource } from "./kit/db-migrate-lib.mjs";

// The migration files of one WeGrocery commit, read from GitHub. The commit
// must be on one of the release branches (`staging` or `main`) of the
// upstream repository, so nobody can point the console at a fork or a
// feature branch. The directory listing (one API call) gives each file's git
// blob id; every file is then downloaded from raw.githubusercontent.com and
// its blob id recomputed, so a file that is not the one in that commit is
// refused before anything touches a database.

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";
const SERVICE = "GitHub";

export const RELEASE_BRANCHES = ["staging", "main"] as const;
export const MIGRATIONS_DIR = "drizzle";
const DOWNLOAD_BATCH = 8;

export class SourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceError";
  }
}

/** A branch name, a tag or a commit id: letters, digits, `.`, `_`, `-`, `/`, never `..`. */
export function validRef(ref: string): boolean {
  return /^[A-Za-z0-9._/-]{1,100}$/.test(ref) && !ref.includes("..") && !ref.startsWith("/") && !ref.startsWith("-");
}

/** `owner/name`, as WEGROCERY_REPO holds it. */
export function validRepo(repo: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(repo) && !repo.includes("..");
}

/** Git's object id for a blob: sha1 of `blob <size>\0<bytes>`. */
export function gitBlobSha(bytes: Uint8Array): string {
  return createHash("sha1").update(`blob ${bytes.byteLength}\0`).update(bytes).digest("hex");
}

export interface ResolvedCommit {
  sha: string;
  /** The first release branch that contains it. */
  branch: (typeof RELEASE_BRANCHES)[number];
}

export interface MigrationBundle extends ResolvedCommit {
  files: MigrationSource[];
}

interface ContentEntry {
  name: string;
  sha: string;
  type: string;
}

export function githubSource({ repo, token, fetchImpl = fetch }: { repo: string; token?: string | null; fetchImpl?: FetchLike }) {
  if (!validRepo(repo)) throw new SourceError("Repository non valida.");
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "wegrocery-console",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const api = <T>(path: string) => requestJson<T>({ service: SERVICE, fetchImpl, url: `${API}/repos/${repo}${path}`, headers });

  async function resolve(ref: string): Promise<ResolvedCommit> {
    if (!validRef(ref)) throw new SourceError("Riferimento non valido: usa un ramo, un tag o un commit.");
    const commit = await api<{ sha: string }>(`/commits/${encodeURIComponent(ref)}`);
    const sha = commit.sha;
    if (!/^[a-f0-9]{40}$/.test(sha)) throw new SourceError("GitHub ha risposto con un commit non valido.");
    for (const branch of RELEASE_BRANCHES) {
      // base = the commit, head = the branch: "ahead" or "identical" means the branch contains it.
      const cmp = await api<{ status: string }>(`/compare/${sha}...${branch}`);
      if (cmp.status === "ahead" || cmp.status === "identical") return { sha, branch };
    }
    throw new SourceError(`Il commit ${sha.slice(0, 7)} non è su ${RELEASE_BRANCHES.join(" né su ")}.`);
  }

  async function download(sha: string, entry: ContentEntry): Promise<MigrationSource> {
    let res: Response;
    try {
      res = await fetchWithTimeout(fetchImpl, `${RAW}/${repo}/${sha}/${MIGRATIONS_DIR}/${encodeURIComponent(entry.name)}`, {
        headers: { "User-Agent": "wegrocery-console" },
      });
    } catch {
      throw new ProviderError(SERVICE, 0, `download di ${entry.name} non riuscito`);
    }
    if (!res.ok) throw new ProviderError(SERVICE, res.status, `download di ${entry.name} non riuscito`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (gitBlobSha(bytes) !== entry.sha) throw new SourceError(`Il file ${entry.name} non corrisponde al commit: niente è stato applicato.`);
    let sql: string;
    try {
      sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new SourceError(`Il file ${entry.name} non è UTF-8 valido.`);
    }
    return { name: entry.name, sql };
  }

  return {
    resolve,

    /** The commit, checked against the release branches, and its migration files (no `_down`). */
    async load(ref: string): Promise<MigrationBundle> {
      const commit = await resolve(ref);
      const listing = await api<ContentEntry[]>(`/contents/${MIGRATIONS_DIR}?ref=${commit.sha}`);
      if (!Array.isArray(listing)) throw new SourceError(`${MIGRATIONS_DIR}/ non è una cartella in quel commit.`);
      const entries = listing.filter((e) => e.type === "file" && isMigrationFile(e.name) && /^[a-f0-9]{40}$/.test(e.sha));
      if (!entries.length) throw new SourceError(`Nessuna migrazione in ${MIGRATIONS_DIR}/ a quel commit.`);
      const files: MigrationSource[] = [];
      for (let i = 0; i < entries.length; i += DOWNLOAD_BATCH) {
        files.push(...(await Promise.all(entries.slice(i, i + DOWNLOAD_BATCH).map((e) => download(commit.sha, e)))));
      }
      return { ...commit, files };
    },
  };
}
