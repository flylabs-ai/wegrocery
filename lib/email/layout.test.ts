import { describe, expect, it } from "vitest";
import { buttonLabel, emailHtml, emailLogoUrl, escapeHtml, textToHtml } from "./layout";
import { BASE, WG, STELLAR, OPTIONS } from "./layout.test.data";

describe("layout", () => {
  it("escapes text, preserves paragraphs and leaves URL punctuation outside links", () => {
    expect(escapeHtml(`<b>"Tom" & 'Ann'</b>`)).toBe("&lt;b&gt;&quot;Tom&quot; &amp; &#39;Ann&#39;&lt;/b&gt;");
    expect(textToHtml("Ciao,\r\nriga due\n\n\nSecondo", WG)).toBe('<p style="margin:0 0 16px 0">Ciao,<br>riga due</p>\n<p style="margin:0">Secondo</p>');
    const html = textToHtml("Il link è https://other.example.test/a?x=1&y=2.", WG);
    expect(html).toContain('href="https://other.example.test/a?x=1&amp;y=2"');
    expect(html).toMatch(/<\/a>\.<\/p>$/);
  });
  it("uses configured page labels, fallback text and identity colours", () => {
    expect(buttonLabel(`${BASE}/ordine/1`, BASE, null, WG)).toBe("Vai all'ordine");
    expect(buttonLabel(`${BASE}/other`, BASE, "Other", WG)).toBe(WG.buttonText.app);
    expect(buttonLabel("https://other.example.test/ordine", BASE, "Visit", WG)).toBe("Visit");
    expect(buttonLabel("https://other.example.test/a", BASE, null, WG)).toBe(WG.buttonText.link);
    const html = emailHtml(`Open: ${BASE}/ordine/1`, WG, OPTIONS);
    expect(html).toContain("background:#2e7d32");
    expect(html).toContain("border-top:4px solid #2e7d32");
    expect(html).toContain("Vai all&#39;ordine");
  });
  it("keeps preferences small and highlights only a standalone six-digit code", () => {
    const html = textToHtml(`482913\n\n${BASE}${WG.preferencesPath}`, WG, { baseUrl: BASE });
    expect(html).toContain("letter-spacing:8px");
    expect(html).toContain("font-size:13px");
    expect(html).toContain("Gestisci le notifiche");
    expect(textToHtml("Code: 482913", WG)).not.toContain("letter-spacing");
  });
  it("keeps the plain mode's standalone URLs and codes as paragraphs", () => {
    const html = textToHtml(`482913\n\n${BASE}/login`, STELLAR);
    expect(html).not.toContain("letter-spacing");
    expect(html).not.toContain("<table");
    expect(html).toContain(`>${BASE}/login</a>`);
  });
  it("renders the injected app logo and signature and supports an absolute logo URL", () => {
    const html = emailHtml("Example", STELLAR, OPTIONS);
    expect(html).toContain(`${BASE}/mail/stellar-logo.png`);
    expect(html).toContain('alt="Stellar Reviews"');
    expect(html).toContain(STELLAR.flylabsUrl);
    expect(html).not.toContain("border-top:4px");
    expect(emailHtml("T", { ...STELLAR, logo: { ...STELLAR.logo, url: "https://cdn.example.test/logo.png" } }, OPTIONS)).toContain('src="https://cdn.example.test/logo.png"');
  });
  it("can hide the name next to a wordmark but never when the logo is absent", () => {
    const identity = { ...WG.identity!, showName: false };
    expect(emailHtml("T", { ...WG, identity }, OPTIONS)).not.toContain(">Gruppo Esempio</span>");
    expect(emailHtml("T", { ...WG, identity: { ...identity, logoUrl: null } }, OPTIONS)).toContain(">Gruppo Esempio</span>");
  });
  it("replaces the footer logo with the app name without a base URL", () => {
    const html = emailHtml("Example", STELLAR, { ...OPTIONS, baseUrl: "" });
    expect(html).not.toContain("<img");
    expect(html).toContain("Stellar Reviews</span>");
  });
  it("escapes the subject and heading and can disable the signature", () => {
    const html = emailHtml("Text", STELLAR, { ...OPTIONS, heading: "News <1>", signature: false });
    expect(html).toContain("<title>Oggetto &lt;1&gt;</title>");
    expect(html).toContain("News &lt;1&gt;</h1>");
    expect(html).not.toContain("by <span");
  });
  it("makes image URLs absolute and excludes unsupported SVGs", () => {
    expect(emailLogoUrl("/brand/logo.webp", `${BASE}/`)).toBe(`${BASE}/brand/logo.webp`);
    expect(emailLogoUrl("https://cdn.example.test/logo.png?v=2", "")).toBe("https://cdn.example.test/logo.png?v=2");
    expect(emailLogoUrl("/logo.svg", BASE)).toBeNull();
    expect(emailLogoUrl("/logo.png", "")).toBeNull();
  });
});
