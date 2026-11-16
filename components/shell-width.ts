export type ShellLayout = "reading" | "wide";

// Each page picks the width of its content inside the shell: a reading
// column (Guida, Profilo, Notifiche, ...) or the whole width (Home's two
// columns, Admin). Used by AppShell.

export const CONTENT_WIDTH: Record<ShellLayout, string> = {
  reading: "mx-auto w-full max-w-[640px]",
  wide: "mx-auto w-full max-w-[1120px]",
};
