export const dynamic = "force-static";

// This document needs no script, stylesheet, font or authenticated layout.
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>You are offline · WeGrocery</title>
</head>
<body style="color-scheme:light dark;font:1rem/1.5 system-ui,sans-serif;margin:0">
  <main style="max-width:32rem;margin:12vh auto;padding:1.5rem">
    <p>WeGrocery</p>
    <h1>You are offline</h1>
    <p>Reload this page when your connection returns.</p>
  </main>
</body>
</html>`;

export function GET() {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
