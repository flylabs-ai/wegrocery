import type { ComponentProps } from "react";
import { cn } from "@/components/ui/cn";
import { Label as KitLabel } from "@/components/ui/label";

/**
 * The kit's field caption (FlyLabs Kit ui 1.1: sentence case, medium weight)
 * with the gap WeGrocery's forms expect above a control. For a caption on a
 * <span>, <p> or <legend> inside a wrapping <label> or fieldset, use labelClass.
 */
export const labelClass = "mb-1.5 block text-sm font-medium text-foreground";

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <KitLabel {...props} className={cn("mb-1.5", className)} />;
}
