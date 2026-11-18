import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The console runs the FlyLabs Kit runner (module `migrazioni` 1.0) copied
// unchanged, like the main app's scripts/. Any difference fails here: update
// both copies from the kit together.

const FILES = ["db-migrate-lib.mjs", "db-migrate-lib.d.mts", "db-migrate.mjs", "db-migrate.d.mts"];

describe("kit runner copy", () => {
  it.each(FILES)("%s is the same as the app's scripts/", (file) => {
    const here = readFileSync(join(__dirname, "kit", file));
    const app = readFileSync(join(__dirname, "..", "..", "..", "scripts", file));
    expect(here.equals(app)).toBe(true);
  });
});
