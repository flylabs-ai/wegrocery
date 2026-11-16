"use client";
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn, focusClass } from "./cn";

const primary = "bg-primary text-primary-foreground";
export const buttonVariants = cva(
  cn("inline-flex shrink-0 items-center justify-center gap-2 rounded-(--control-radius) border border-transparent text-sm font-medium whitespace-nowrap select-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 min-h-(--control-h) pointer-coarse:min-h-11", focusClass),
  { variants: {
    variant: {
      default: primary,
      /** @deprecated Use default. Kept for WeGrocery's existing role name. */
      brand: primary,
      inverse: "bg-inverse text-inverse-foreground",
      secondary: "border-input bg-secondary text-secondary-foreground",
      outline: "border-input bg-transparent text-foreground hover:bg-secondary",
      ghost: "bg-transparent text-foreground hover:bg-secondary",
      destructive: "bg-destructive text-destructive-foreground hover:bg-[oklch(from_var(--destructive)_calc(l*0.9)_c_h)]",
      "destructive-soft": "bg-danger-bg text-destructive",
      accent: "bg-accent text-accent-foreground",
    },
    size: { default: "px-4 py-1.5", sm: "px-3 py-1", icon: "min-w-(--control-h) px-2 pointer-coarse:min-w-11" },
    block: { true: "w-full" },
  }, defaultVariants: { variant: "default", size: "default" } },
);
type Variants = VariantProps<typeof buttonVariants>;
export type ButtonProps = Omit<ButtonPrimitive.Props, "className"> & Omit<Variants, "size"> & { className?: string } & (
  | { size: "icon"; "aria-label": string }
  | { size?: Exclude<Variants["size"], "icon"> }
);
export function Button({ className, variant, size, block, type = "button", ...props }: ButtonProps) {
  if (size === "icon" && !props["aria-label"]?.trim()) throw new Error("An icon button requires an aria-label");
  return <ButtonPrimitive {...props} type={type} data-slot="button" className={cn(buttonVariants({ variant, size, block }), className)} />;
}
