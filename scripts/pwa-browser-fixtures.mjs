// Load only in the isolated Chromium check. Satisfy the login page's read-only
// settings lookups without a database or access to a Neon project.
process.env.DATABASE_URL = "postgresql://fixture:fixture@fixture.example.test/fixture";
process.env.AUTH_SECRET = "synthetic-pwa-browser-fixture-only";
process.env.AUTH_GOOGLE_ID = "synthetic";
process.env.AUTH_GOOGLE_SECRET = "synthetic";
process.env.PWA_SW_ENABLED = "true";

const fetchWithoutFixtures = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.pathname !== "/sql" || !["fixture.example.test", "api.example.test"].includes(url.hostname)) {
    return fetchWithoutFixtures(input, init);
  }
  const { query } = JSON.parse(init.body);
  if (typeof query !== "string" || !/^select\b/i.test(query)) throw new Error("The Chromium fixture allows database reads only");
  return Promise.resolve(Response.json({ fields: [], rows: [], rowCount: 0, command: "SELECT" }));
};
