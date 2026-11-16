import type { ComponentProps } from "react";
import { cn } from "./cn";
export function Card({ className, size = "default", ...props }: ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return <div {...props} data-slot="card" data-size={size} className={cn("group/card rounded-(--radius) border border-border bg-card text-card-foreground", className)} />;
}
export function CardHeader({ className, ...props }: ComponentProps<"div">) { return <div {...props} data-slot="card-header" className={cn("flex flex-col gap-2 p-4 group-data-[size=sm]/card:p-3", className)} />; }
export function CardTitle({ className, ...props }: ComponentProps<"h2">) { return <h2 {...props} data-slot="card-title" className={cn("font-heading text-lg font-semibold", className)} />; }
export function CardDescription({ className, ...props }: ComponentProps<"p">) { return <p {...props} data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} />; }
export function CardAction({ className, ...props }: ComponentProps<"div">) { return <div {...props} data-slot="card-action" className={cn("self-end", className)} />; }
export function CardContent({ className, ...props }: ComponentProps<"div">) { return <div {...props} data-slot="card-content" className={cn("p-4 group-data-[size=sm]/card:p-3", className)} />; }
export function CardFooter({ className, ...props }: ComponentProps<"div">) { return <div {...props} data-slot="card-footer" className={cn("flex items-center gap-2 border-t border-border p-4 group-data-[size=sm]/card:p-3", className)} />; }
