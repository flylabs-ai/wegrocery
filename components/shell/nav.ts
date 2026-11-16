import type { ReactNode } from "react";

export type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  /** Exact aliases, or exact and section aliases. Data only: safe across an RSC boundary. */
  match?: readonly string[] | { exact?: readonly string[]; sections?: readonly string[] };
  children?: readonly NavItem[];
  badge?: ReactNode;
  ariaLabel?: string;
};
const pathOnly = (path: string): string => path.split(/[?#]/)[0].replace(/\/$/, "") || "/";
const under = (path: string, href: string): boolean => path === href || href !== "/" && path.startsWith(`${href}/`);

type MatchScore = readonly [pathLength: number, queryCount: number];
const moreSpecific = (next: MatchScore, previous: MatchScore): boolean => next[0] > previous[0] || next[0] === previous[0] && next[1] > previous[1];
function queryOnly(href: string): string {
  const withoutHash = href.split("#")[0]; const start = withoutHash.indexOf("?");
  return start < 0 ? "" : withoutHash.slice(start + 1);
}
function matchesQuery(required: URLSearchParams, actual: URLSearchParams): boolean {
  for (const key of new Set(required.keys())) {
    const expected = required.getAll(key).sort(); const received = actual.getAll(key).sort();
    if (expected.length !== received.length || expected.some((value, index) => value !== received[index])) return false;
  }
  return true;
}
function itemScore(path: string, query: URLSearchParams, item: NavItem): MatchScore {
  if (!item.href.startsWith("/") || item.href.startsWith("//")) return [-1, -1];
  const href = pathOnly(item.href); const aliases = item.match;
  const rules = aliases as { exact?: readonly string[]; sections?: readonly string[] } | undefined;
  const matchesPath = aliases === undefined ? under(path, href) : Array.isArray(aliases)
    ? aliases.some((alias) => path === pathOnly(alias))
    : rules?.exact?.some((alias) => path === pathOnly(alias)) || rules?.sections?.some((alias) => under(path, pathOnly(alias)));
  const required = new URLSearchParams(queryOnly(item.href));
  let score: MatchScore = matchesPath && matchesQuery(required, query) ? [href.length, required.size] : [-1, -1];
  for (const child of item.children ?? []) {
    const childScore = itemScore(path, query, child);
    if (moreSpecific(childScore, score)) score = childScore;
  }
  return score;
}

/** Longest destination wins, then most query constraints; ties preserve order.
 * A matching descendant selects its parent among the supplied items. */
export function activeItem<T extends NavItem>(pathname: string, items: readonly T[], search?: string): T | null {
  const path = pathOnly(pathname); const query = new URLSearchParams(search ?? queryOnly(pathname));
  let active: T | null = null; let score: MatchScore = [-1, -1];
  for (const item of items) {
    const next = itemScore(path, query, item);
    if (moreSpecific(next, score)) { active = item; score = next; }
  }
  return active;
}

/** At most five buttons, including More when anything is left over. */
export function mobileNavigation<T>(items: readonly T[], primaryCount = items.length <= 5 ? 5 : 4): { primary: T[]; more: T[] } {
  if (!Number.isInteger(primaryCount) || primaryCount < 0 || primaryCount > 5) throw new Error("Invalid mobile primary count");
  const count = Math.min(primaryCount, items.length > primaryCount ? 4 : 5);
  return { primary: items.slice(0, count), more: items.slice(count) };
}
