import type { ComponentProps } from "react";
import { cn } from "./cn";
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return <div {...props} data-slot="skeleton" aria-hidden="true" className={cn("rounded-(--radius) bg-secondary motion-safe:animate-pulse", className)} />;
}
