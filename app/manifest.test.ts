import { describe, expect, it, vi } from "vitest";
import manifest from "./manifest";

vi.mock("@/lib/brand/get-brand", () => ({
  getBrand: async () => ({
    appName: "Example Food Co-op",
    shortName: "Example Co-op",
    description: "A test installation",
    theme: { background: "#f0eadd", primary: "#354236" },
  }),
}));

describe("web app manifest", () => {
  it("preserves every field from the installed app's manifest except orientation", async () => {
    const before = {
      name: "Example Food Co-op",
      short_name: "Example Co-op",
      description: "A test installation",
      id: "/",
      start_url: "/",
      scope: "/",
      display: "standalone",
      background_color: "#f0eadd",
      theme_color: "#354236",
      orientation: "portrait",
      icons: [
        { src: "/icons/192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/icons/512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    const actual = await manifest();

    expect(actual).not.toHaveProperty("orientation");
    expect({ ...actual, orientation: "portrait" }).toStrictEqual(before);
  });
});
