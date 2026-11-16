// Pure HTML renderer. App identity, labels and light-theme tokens are injected.
export type EmailColors = Record<"background" | "mutedForeground" | "primary" | "primaryForeground" | "primaryText", string>;
export type EmailTheme = EmailColors & Record<"card" | "foreground" | "border", string>;
export type EmailIdentity = { name: string; logoUrl: string | null; showName: boolean; colors: EmailColors };
export type EmailConfig = {
  appName: string;
  logo: { url: string; width: number; height: number };
  flylabsUrl: string;
  theme: EmailTheme;
  buttonText: { app: string; link: string; preferences: string };
  pageLabels: readonly (readonly [path: string, label: string])[];
  preferencesPath: string;
  identity?: EmailIdentity | null;
  /** Plain preserves Stellar's existing HTML; rich enables buttons and code boxes. */
  textMode?: "plain" | "rich";
};
export type EmailOptions = { subject: string; baseUrl: string; signature?: boolean; heading?: string | null };

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// SVG does not show in Gmail or Outlook: such a logo leaves the name alone.
const MAIL_IMAGE = /\.(png|jpe?g|gif|webp)(\?.*)?$/i;

/** A logo as a mail client can fetch it: absolute, and an image type it shows; null otherwise. */
export function emailLogoUrl(logoUrl: string, baseUrl: string): string | null {
  const absolute = /^https?:\/\//i.test(logoUrl)
    ? logoUrl
    : baseUrl && logoUrl.startsWith("/")
      ? `${baseUrl.replace(/\/+$/, "")}${logoUrl}`
      : null;
  return absolute && MAIL_IMAGE.test(absolute) ? absolute : null;
}

// A URL in the text becomes a link; the punctuation that closes a sentence
// ("...qui: https://x.example/a.") stays outside it.
const URL_RE = /https?:\/\/[^\s<>"]+/g;
const TRAILING = /[.,;:!?)\]]+$/;

function linkify(escaped: string, color: string): string {
  return escaped.replace(URL_RE, (match) => {
    const url = match.replace(TRAILING, "");
    const rest = match.slice(url.length);
    return `<a href="${url}" style="color:${color};text-decoration:underline;word-break:break-all">${url}</a>${rest}`;
  });
}

function pathIn(url: string, baseUrl: string): string | null {
  try {
    const u = new URL(url);
    if (!baseUrl || u.origin !== new URL(baseUrl).origin) return null;
    return u.pathname;
  } catch {
    return null;
  }
}

/** What a button says: the page it opens in the app, else the words before the link, else a plain "open". */
export function buttonLabel(url: string, baseUrl: string, words: string | null, config: EmailConfig): string {
  const path = pathIn(url, baseUrl);
  if (path !== null) {
    const page = config.pageLabels.find(([p]) => path === p || path.startsWith(`${p}/`));
    return page ? page[1] : config.buttonText.app;
  }
  return words || config.buttonText.link;
}

// A paragraph that is one link and at most a few words before it:
// "https://..." or "Apri nell'app: https://...".
const LINK_LINE = /^(?:([^\n:]{1,60}):\s*)?(https?:\/\/[^\s<>"]+)$/;
const CODE_LINE = /^\d{6}$/;

type Render = { baseUrl: string; colors: EmailColors; config: EmailConfig };

function button(href: string, label: string, c: EmailColors): string {
  // A table cell carries the fill, so Outlook paints it too.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-radius:12px;background:${c.primary}"><a href="${href}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:${c.primaryForeground};text-decoration:none;border-radius:12px">${escapeHtml(label)}</a></td></tr></table>`;
}

function paragraph(text: string, margin: string, r: Render): string {
  const c = r.colors;
  const config = r.config;
  if (CODE_LINE.test(text)) {
    return `<div style="margin:${margin};padding:14px 16px;background:${c.background};border:1px solid ${config.theme.border};border-radius:12px;text-align:center;font-family:'SF Mono', Menlo, Consolas, monospace;font-size:30px;line-height:36px;font-weight:700;letter-spacing:8px;color:${config.theme.foreground}">${text}</div>`;
  }
  const link = LINK_LINE.exec(text);
  if (link) {
    const url = link[2].replace(TRAILING, "");
    const words = link[1]?.trim() || null;
    const href = escapeHtml(url);
    if (pathIn(url, r.baseUrl) === config.preferencesPath) {
      return `<p style="margin:${margin};font-size:13px;line-height:20px;color:${c.mutedForeground}"><a href="${href}" style="color:${c.mutedForeground};text-decoration:underline">${escapeHtml(words ?? config.buttonText.preferences)}</a></p>`;
    }
    return `<div style="margin:${margin}">${button(href, buttonLabel(url, r.baseUrl, words, config), c)}</div>`;
  }
  const body = text
    .split("\n")
    .map((line) => linkify(escapeHtml(line), c.primaryText))
    .join("<br>");
  return `<p style="margin:${margin}">${body}</p>`;
}

// Paragraphs on blank lines, a <br> on a single newline.
export function textToHtml(text: string, config: EmailConfig, render: Partial<Pick<Render, "baseUrl" | "colors">> = {}): string {
  const r: Render = { baseUrl: (render.baseUrl ?? "").replace(/\/+$/, ""), colors: render.colors ?? config.theme, config };
  return text
    .replace(/\r\n/g, "\n")
    .trim()
    .split(/\n{2,}/)
    // The card's padding closes the last one.
    .map((p, i, all) => {
      const margin = i === all.length - 1 ? "0" : "0 0 16px 0";
      if (config.textMode !== "plain") return paragraph(p.trim(), margin, r);
      const body = p.split("\n").map((line) => linkify(escapeHtml(line), r.colors.primaryText)).join("<br>");
      return `<p style="margin:${margin}">${body}</p>`;
    })
    .join("\n");
}

// A white-label app's group, above the card: its logo linked to the app, and its name.
function header(baseUrl: string, identity: EmailIdentity, config: EmailConfig): string {
  const name = escapeHtml(identity.name);
  const img = identity.logoUrl
    ? `<img src="${escapeHtml(identity.logoUrl)}" height="40" alt="${name}" style="display:block;border:0;height:40px;width:auto;max-width:200px">`
    : "";
  const text =
    identity.showName || !img
      ? `<span style="font-family:${FONT};font-size:18px;line-height:24px;font-weight:700;color:${config.theme.foreground}">${name}</span>`
      : "";
  const cells = [img, text]
    .filter(Boolean)
    .map((cell, i) => `<td style="vertical-align:middle${i > 0 ? ";padding-left:10px" : ""}">${cell}</td>`)
    .join("");
  const row = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table>`;
  return `<tr><td style="padding:0 8px 16px 8px">${baseUrl ? `<a href="${baseUrl}" style="text-decoration:none">${row}</a>` : row}</td></tr>`;
}

function footer(baseUrl: string, signature: boolean, colors: EmailColors, config: EmailConfig): string {
  const logoUrl = /^https?:\/\//i.test(config.logo.url) ? config.logo.url : `${baseUrl}${config.logo.url}`;
  const flylabs = signature
    ? `<div style="padding-top:8px;font-family:${FONT};font-size:13px;line-height:20px"><a href="${config.flylabsUrl}" style="color:${colors.mutedForeground};text-decoration:none">by <span style="text-decoration:underline">flylabs.ai</span></a></div>`
    : "";
  // Without a base URL there is no address for the logo: the name in text.
  const logo = baseUrl
    ? `<a href="${baseUrl}"><img src="${escapeHtml(logoUrl)}" width="${config.logo.width}" height="${config.logo.height}" alt="${escapeHtml(config.appName)}" style="display:block;border:0;width:${config.logo.width}px;height:${config.logo.height}px"></a>`
    : `<span style="font-weight:600;color:${config.theme.foreground}">${escapeHtml(config.appName)}</span>`;
  return `<tr><td style="padding:24px 8px 0 8px">${logo}${flylabs}</td></tr>`;
}

/**
 * `signature`: "by flylabs.ai" under the logo, on unless a white-label app's
 * group switched it off (Playbook 2.11). `identity`: the group of a
 * white-label app, none for a FlyLabs product. `heading`: a title on top of
 * the card (a notification's).
 */
export function emailHtml(
  text: string,
  config: EmailConfig,
  opts: EmailOptions,
): string {
  const baseUrl = opts.baseUrl.replace(/\/+$/, "");
  const c = config.identity?.colors ?? config.theme;
  const heading = opts.heading
    ? `<h1 style="margin:0 0 12px 0;font-family:${FONT};font-size:20px;line-height:28px;font-weight:700;color:${config.theme.foreground}">${escapeHtml(opts.heading)}</h1>\n`
    : "";
  const topLine = config.identity ? `;border-top:4px solid ${c.primary}` : "";
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${c.background}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.background}">
<tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">
${config.identity ? `${header(baseUrl, config.identity, config)}\n` : ""}<tr><td style="background:${config.theme.card};border:1px solid ${config.theme.border}${topLine};border-radius:16px;padding:28px 24px;font-family:${FONT};font-size:15px;line-height:24px;color:${config.theme.foreground}">
${heading}${textToHtml(text, config, { baseUrl, colors: c })}
</td></tr>
${footer(baseUrl, opts.signature ?? true, c, config)}
</table>
</td></tr>
</table>
</body>
</html>`;
}
