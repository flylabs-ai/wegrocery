import type { MetadataRoute } from "next";

export type IconPaths = { icon192: string; icon512: string; maskable512: string; apple180: string };
export type PwaIcon = { file: string; src: string; size: number; purpose: "any" | "maskable"; logoScale: number };

/** Paths belong to the app; sizes and the maskable safe zone come from WeGrocery. */
export function buildIcons(paths: IconPaths): {
  manifest: NonNullable<MetadataRoute.Manifest["icons"]>;
  appleTouch: { url: string; sizes: string; type: string };
  all: PwaIcon[];
} {
  const all: PwaIcon[] = [
    { file: "192.png", src: paths.icon192, size: 192, purpose: "any", logoScale: 0.86 },
    { file: "512.png", src: paths.icon512, size: 512, purpose: "any", logoScale: 0.86 },
    { file: "maskable-512.png", src: paths.maskable512, size: 512, purpose: "maskable", logoScale: 0.56 },
    { file: "apple-180.png", src: paths.apple180, size: 180, purpose: "any", logoScale: 0.8 },
  ];
  return {
    manifest: all.slice(0, 3).map((icon) => ({ src: icon.src, sizes: `${icon.size}x${icon.size}`, type: "image/png", purpose: icon.purpose })),
    appleTouch: { url: paths.apple180, sizes: "180x180", type: "image/png" }, all,
  };
}
export function findIcon(file: string, icons: readonly PwaIcon[]): PwaIcon | null { return icons.find((icon) => icon.file === file) ?? null; }
export function localLogoPath(logoUrl: string): string | null {
  if (!logoUrl.startsWith("/") || logoUrl.startsWith("//")) return null;
  const path = logoUrl.split(/[?#]/)[0];
  return path.split("/").some((part) => part === "..") ? null : path;
}
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", gif: "image/gif" };
export function logoMimeType(path: string): string { return MIME[path.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? ""] ?? "image/png"; }
export function fallbackInitial(shortName: string): string { return (shortName.trim()[0] ?? "?").toUpperCase(); }
