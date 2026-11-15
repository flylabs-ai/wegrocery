import { describe, expect, it } from "vitest";
import { findEmDashLines, findChangelogEmDashLines } from "./no-em-dash";

const dash = "\u2014";

describe("findEmDashLines", () => {
  it("returns one-based file/line locations, including source strings inside functions", () => {
    expect(findEmDashLines("it.ts", `const title = 'ok';\nconst fn = () => 'a${dash}b${dash}c';\n`)).toEqual([
      { file: "it.ts", line: 2 },
    ]);
  });

  it("handles CRLF and CR without changing line numbers", () => {
    expect(findEmDashLines("en.ts", `ok\r\na${dash}b\rok${dash}`)).toEqual([
      { file: "en.ts", line: 2 }, { file: "en.ts", line: 3 },
    ]);
    expect(findEmDashLines("en.ts", "A - B\nA \u2013 B\n")).toEqual([]);
  });
});

describe("findChangelogEmDashLines", () => {
  it("checks new text and every version heading, preserving historical release bodies", () => {
    const text = `# Changelog${dash}\n## [Unreleased]\n- New${dash}text\n## [2.0.0] - date\n- Published${dash}text\n## [1.0.0] ${dash} date\n- Old${dash}text\n`;
    expect(findChangelogEmDashLines("CHANGELOG.md", text)).toEqual([
      { file: "CHANGELOG.md", line: 1 }, { file: "CHANGELOG.md", line: 3 }, { file: "CHANGELOG.md", line: 6 },
    ]);
  });

  it("recognizes the kit's unbracketed headings and a release on the first line", () => {
    expect(findChangelogEmDashLines("CHANGELOG.md", `## 0.14 (date)\n- Published${dash}text\n`)).toEqual([]);
    expect(findChangelogEmDashLines("CHANGELOG.md", `## 0.14 ${dash} date\n- Published\n`)).toEqual([{ file: "CHANGELOG.md", line: 1 }]);
  });

  it("checks all text when no released version is present", () => {
    expect(findChangelogEmDashLines("CHANGELOG.md", `# Changelog\n## Unreleased\n- New${dash}text`)).toEqual([
      { file: "CHANGELOG.md", line: 3 },
    ]);
  });

  it("does not treat an unclosed version bracket as a published release", () => {
    expect(findChangelogEmDashLines("CHANGELOG.md", `## [1.0.0\n- New${dash}text`)).toEqual([
      { file: "CHANGELOG.md", line: 2 },
    ]);
  });
});
