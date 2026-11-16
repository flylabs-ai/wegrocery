import { describe, expect, it } from "vitest";
import { activeItem, mobileNavigation, type NavItem } from "./nav";
const items: NavItem[] = [
  { href: "/", label: "Reviews", icon: null, match: ["/", "/pubblicate"] },
  { href: "/voce", label: "Voice", icon: null },
  { href: "/impostazioni", label: "Settings", icon: null },
];
describe("activeItem", () => {
  it.each(["/", "/pubblicate"])("preserves Stellar's reviews alias: %s", (path) => expect(activeItem(path, items)).toBe(items[0]));
  it.each(["/impostazioni", "/impostazioni/attivita", "/impostazioni/struttura", "/impostazioni/schede", "/impostazioni/team", "/impostazioni/piano", "/impostazioni/account"])("matches whole section paths: %s", (path) => expect(activeItem(path, items)).toBe(items[2]));
  it.each(["/pubblicate-x", "/voce2", "/impostazioni-vecchie", "/impostazionix/team"])("rejects partial segment matches: %s", (path) => expect(activeItem(path, items)).toBeNull());
  it("selects the most specific matching item, including query-bearing links", () => {
    const nested = [...items, { href: "/impostazioni/team?view=all", label: "Team", icon: null }];
    expect(activeItem("/impostazioni/team/member", nested, "?view=all")).toBe(nested[3]);
    expect(activeItem("/voce?property=synthetic", items)).toBe(items[1]);
  });
  it("matches child query constraints and prefers a query over a path-only fallback", () => {
    const children: NavItem[] = [
      { href: "/section", label: "Overview", icon: null },
      { href: "/section?view=one", label: "One", icon: null },
      { href: "/section?view=two", label: "Two", icon: null },
    ];
    const parents: NavItem[] = [{ href: "/section", label: "Section", icon: null, children }];
    expect(activeItem("/section", parents, "?view=two")).toBe(parents[0]);
    expect(activeItem("/section", children, "?sort=recent&view=two")).toBe(children[2]);
    expect(activeItem("/section?view=one#details", children)).toBe(children[1]);
    expect(activeItem("/section", children, "view=one")).toBe(children[1]);
    expect(activeItem("/section", children)).toBe(children[0]);
    expect(activeItem("/section", children.slice(1), "?view=other")).toBeNull();
    expect(activeItem("/section-old", children, "?view=one")).toBeNull();
  });
  it("compares decoded values, repeated parameters and all required keys without depending on order", () => {
    const filtered: NavItem = { href: "/section?view=two&tag=a&tag=b&name=One+Two", label: "Filtered", icon: null };
    expect(activeItem("/section", [filtered], "?tag=b&name=One%20Two&tag=a&view=two&sort=recent")).toBe(filtered);
    for (const search of ["?view=two&tag=a&name=One+Two", "?view=two&tag=a&tag=b&name=Other", "?view=one&tag=a&tag=b&name=One+Two"]) {
      expect(activeItem("/section", [filtered], search)).toBeNull();
    }
    expect(activeItem("/section?view=two&tag=a&tag=b&name=One+Two", [filtered], "")).toBeNull();
  });
  it("keeps the parent active for a child destination outside its own path and preserves sibling precedence", () => {
    const parent: NavItem = { href: "/section", label: "Section", icon: null, children: [{ href: "/tools/detail", label: "Detail", icon: null }] };
    expect(activeItem("/tools/detail", [parent])).toBe(parent);
    expect(activeItem("/tools/details", [parent])).toBeNull();
    const direct: NavItem = { href: "/tools/detail", label: "Direct", icon: null };
    expect(activeItem("/tools/detail", [direct, parent])).toBe(direct);
    expect(activeItem("/tools/detail", [parent, direct])).toBe(parent);
    expect(activeItem("/section", [{ ...parent, href: "https://example.com/section" }])).toBeNull();
  });
  it("preserves literal question marks inside query values and ignores only the fragment", () => {
    const item: NavItem = { href: "/section?filter=one?two#details", label: "Filtered", icon: null };
    expect(activeItem("/section", [item], "?filter=one?two")).toBe(item);
    expect(activeItem("/section?filter=one?two#details", [item])).toBe(item);
    expect(activeItem("/section", [item], "?filter=one")).toBeNull();
  });
  it("keeps WeGrocery aliases under Home and member/admin filtering in the app", () => {
    const links: NavItem[] = [{ href: "/", label: "Home", icon: null, match: { exact: ["/"], sections: ["/ricarica", "/calendario"] } }, { href: "/ordine", label: "Order", icon: null }, { href: "/admin", label: "Admin", icon: null }];
    expect(activeItem("/ricarica/details", links)).toBe(links[0]);
    expect(activeItem("/admin/x", links)).toBe(links[2]);
    expect(activeItem("/ordine-vecchio", links)).toBeNull();
    expect(activeItem("/admin", links.slice(0, 2))).toBeNull();
  });
});
describe("mobileNavigation", () => {
  it("uses at most five destinations including More, with configurable primary count", () => {
    for (let count = 0; count <= 8; count++) {
      const list = Array.from({ length: count }, (_, i) => ({ href: `/${i}`, label: String(i), icon: null }));
      const nav = mobileNavigation(list);
      expect(nav.primary.length + (nav.more.length ? 1 : 0)).toBeLessThanOrEqual(5);
      expect([...nav.primary, ...nav.more]).toEqual(list);
    }
    expect(mobileNavigation(items, 2)).toEqual({ primary: items.slice(0, 2), more: items.slice(2) });
    expect(() => mobileNavigation(items, -1)).toThrow();
  });
});
