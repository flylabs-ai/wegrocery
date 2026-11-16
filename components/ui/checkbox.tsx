"use client";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import { cn, focusClass } from "./cn";
import { useFieldControl } from "./field";
export function Checkbox({ className, ...rest }: Omit<CheckboxPrimitive.Root.Props, "className"> & { className?: string }) {
  const props = useFieldControl(rest);
  return (
    <CheckboxPrimitive.Root {...props} data-slot="checkbox" className={cn("flex min-h-(--control-h) min-w-(--control-h) shrink-0 items-center justify-center rounded-(--control-radius) border border-input bg-card text-foreground pointer-coarse:min-h-11 pointer-coarse:min-w-11 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive", focusClass, className)}>
      <CheckboxPrimitive.Indicator><Check aria-hidden="true" className="size-4" /></CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
