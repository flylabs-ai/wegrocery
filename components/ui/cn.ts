import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Both apps extend Tailwind's named type scale. Keep the union when merging colours.
const merge = extendTailwindMerge({ extend: { theme: {
  text: ["label", "display", "title", "heading", "subheading", "body", "meta"],
  radius: ["card"], shadow: ["card"],
} } });
export function cn(...inputs: ClassValue[]): string { return merge(clsx(inputs)); }

export const focusClass = "focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2";
