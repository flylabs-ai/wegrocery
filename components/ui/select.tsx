"use client";
import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "./cn";
import { controlClass, useFieldControl } from "./field";
export type SelectProps = ComponentProps<"select"> & { wrapperClassName?: string };
export function Select({ className, wrapperClassName, ...rest }: SelectProps) {
  const props = useFieldControl(rest);
  return (
    <div data-slot="native-select-wrapper" className={cn("relative w-full", wrapperClassName)}>
      <select {...props} data-slot="native-select" className={cn(controlClass, "appearance-none pr-9", className)} />
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
export const NativeSelect = Select;

export function NativeSelectOption(props: ComponentProps<"option">) { return <option {...props} />; }
