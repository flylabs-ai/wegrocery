import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "./cn";
export const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-(--control-radius) border px-2.5 py-0.5 text-xs font-medium", {
  variants: { variant: {
    default: "border-border bg-secondary text-secondary-foreground",
    primary: "border-border bg-primary-bg text-primary-text",
    brand: "border-border bg-primary-bg text-primary-text",
    accent: "border-border bg-accent-bg text-accent-text",
    destructive: "border-border bg-danger-bg text-destructive",
    success: "border-border bg-success-bg text-success",
    warning: "border-border bg-warning-bg text-warning",
    info: "border-border bg-card text-foreground",
  } }, defaultVariants: { variant: "default" },
});
const toneVariant = { neutral: "default", success: "success", info: "info", warning: "warning", danger: "destructive" } as const;
export function Badge({ className, variant, tone, dot, children, ...props }: ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { tone?: keyof typeof toneVariant; dot?: boolean }) {
  return <span {...props} data-slot="badge" className={cn(badgeVariants({ variant: variant ?? (tone ? toneVariant[tone] : undefined) }), className)}>{dot ? <span aria-hidden="true" className="size-1.5 rounded-full bg-current" /> : null}{children}</span>;
}
