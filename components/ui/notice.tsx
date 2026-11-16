import type { ComponentProps } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "./cn";
const tones = {
  danger: { Icon: CircleAlert, box: "bg-danger-bg text-destructive" },
  warning: { Icon: TriangleAlert, box: "bg-warning-bg text-warning" },
  success: { Icon: CircleCheck, box: "bg-success-bg text-success" },
  info: { Icon: Info, box: "bg-card text-foreground" },
};
export function Notice({ tone = "info", className, children, role, ...props }: ComponentProps<"div"> & { tone?: keyof typeof tones }) {
  const { Icon, box } = tones[tone];
  return <div {...props} role={role ?? (tone === "danger" ? "alert" : "status")} data-slot="notice" data-tone={tone} className={cn("flex items-start gap-2 rounded-(--radius) border border-border p-3 text-sm", box, className)}><Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><div className="min-w-0 flex-1">{children}</div></div>;
}
