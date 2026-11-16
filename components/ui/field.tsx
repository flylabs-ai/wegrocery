"use client";
import { createContext, useContext, useId, type AriaAttributes, type ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { cn, focusClass } from "./cn";
import { Label } from "./label";

type FieldState = { id: string; description?: string; invalid: boolean; disabled: boolean };
const FieldContext = createContext<FieldState | null>(null);
export const controlClass = cn("w-full min-w-0 min-h-(--control-h) rounded-(--control-radius) border border-input bg-card px-3 py-1.5 text-base text-foreground md:text-sm pointer-coarse:min-h-11 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive", focusClass);
export function describedBy(id: string, hasHint: boolean, hasError: boolean): string | undefined {
  const ids = [hasHint ? `${id}-hint` : null, hasError ? `${id}-error` : null].filter(Boolean);
  return ids.length ? ids.join(" ") : undefined;
}
type ControlProps = Pick<AriaAttributes, "aria-describedby" | "aria-invalid" | "aria-labelledby"> & { id?: string; disabled?: boolean };
/** Native and Base UI controls share explicit label and description IDs. */
export function useFieldControl<T extends ControlProps>(props: T) {
  const field = useContext(FieldContext);
  if (field && props.id && field.id !== props.id) throw new Error("Control id must match its Field id");
  const description = [...new Set([props["aria-describedby"], field?.description].filter(Boolean).join(" ").split(" ").filter(Boolean))].join(" ") || undefined;
  return { ...props, id: field?.id ?? props.id,
    disabled: field?.disabled || props.disabled,
    "aria-describedby": description,
    "aria-labelledby": props["aria-labelledby"] ?? (field ? `${field.id}-label` : undefined),
    "aria-invalid": field?.invalid || props["aria-invalid"] || undefined,
  };
}
export type FieldProps = {
  id?: string; label: ReactNode; hint?: ReactNode; error?: ReactNode; disabled?: boolean;
  className?: string; labelClassName?: string; children: ReactNode;
};
export function Field({ id: supplied, label, hint, error, disabled = false, className, labelClassName, children }: FieldProps) {
  const generated = useId(); const id = supplied ?? generated;
  const hasHint = hint !== undefined && hint !== null && hint !== false;
  const invalid = error !== undefined && error !== null && error !== false;
  return (
    <FieldContext.Provider value={{ id, description: describedBy(id, hasHint, invalid), invalid, disabled }}>
      <div data-slot="field" data-disabled={disabled || undefined} className={cn("flex flex-col gap-1.5", className)}>
        <Label id={`${id}-label`} htmlFor={id} className={labelClassName}>{label}</Label>
        {hasHint ? <p id={`${id}-hint`} className="text-sm text-muted-foreground">{hint}</p> : null}
        {children}
        {invalid ? <FieldError id={`${id}-error`}>{error}</FieldError> : null}
      </div>
    </FieldContext.Provider>
  );
}
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return <p id={id} role="alert" className="flex items-start gap-1.5 text-sm text-destructive"><CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{children}</span></p>;
}
