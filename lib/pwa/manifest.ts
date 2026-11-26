import type { MetadataRoute } from "next";

export type ManifestOptions = {
  name: string; shortName: string; description: string; startUrl: string; lang: string;
  /** Resolved page backgrounds from tema.statusBarColors, not primary fills or CSS var() references. */
  themeColors: { light: string; dark: string };
  icons: NonNullable<MetadataRoute.Manifest["icons"]>;
  id?: string; scope?: string; orientation?: MetadataRoute.Manifest["orientation"];
};
/** A manifest has one theme colour; the initial light background is shared by both apps. */
export function buildManifest({ name, shortName, description, startUrl, themeColors, icons, lang, id, scope = "/", orientation }: ManifestOptions): MetadataRoute.Manifest {
  return {
    name, short_name: shortName, description, ...(id === undefined ? {} : { id }), start_url: startUrl, scope,
    display: "standalone", background_color: themeColors.light, theme_color: themeColors.light,
    ...(orientation === undefined ? {} : { orientation }), lang, icons: icons.map((icon) => ({ ...icon })),
  };
}
