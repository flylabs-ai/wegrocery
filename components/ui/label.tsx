import type { ComponentProps } from "react";
import { cn } from "./cn";
export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label {...props} data-slot="label" className={cn("block text-sm font-medium text-foreground", className)} />;
}
