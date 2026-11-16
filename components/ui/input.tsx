"use client";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "./cn";
import { controlClass, useFieldControl } from "./field";
export const fieldBase = controlClass;
export function Input({ className, ...rest }: InputPrimitive.Props) {
  const props = useFieldControl(rest);
  return <InputPrimitive {...props} data-slot="input" className={typeof className === "function" ? (state) => cn(controlClass, className(state)) : cn(controlClass, className)} />;
}
