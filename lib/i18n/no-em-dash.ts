export interface TextLocation {
  file: string;
  line: number;
}

const EM_DASH = "\u2014";
const linesOf = (text: string): string[] => text.split(/\r\n|\r|\n/);
const VERSION = String.raw`\d+(?:\.\d+)+(?:-[a-zA-Z0-9.-]+)?`;
const VERSION_HEADING = new RegExp(`^## (?:\\[${VERSION}\\]|${VERSION})(?=\\s|$)`);
const isVersionHeading = (line: string): boolean => VERSION_HEADING.test(line);

/** Read source text, including literals in functions; return no file contents. */
export function findEmDashLines(file: string, text: string): TextLocation[] {
  return linesOf(text).flatMap((line, index) => line.includes(EM_DASH) ? [{ file, line: index + 1 }] : []);
}

/** Keep published release bodies intact; check version headings and new text. */
export function findChangelogEmDashLines(file: string, text: string): TextLocation[] {
  const lines = linesOf(text);
  const firstRelease = lines.findIndex(isVersionHeading);
  return findEmDashLines(file, text).filter(({ line }) =>
    firstRelease === -1 || line - 1 < firstRelease || isVersionHeading(lines[line - 1]),
  );
}
