"use client";
import type { ComponentProps } from "react";
import { cn } from "./cn";
import { controlClass, useFieldControl } from "./field";
export function Textarea({ className, ...rest }: ComponentProps<"textarea">) {
  const props = useFieldControl(rest);
  return <textarea {...props} data-slot="textarea" className={cn(controlClass, "resize-y", className)} />;
}
