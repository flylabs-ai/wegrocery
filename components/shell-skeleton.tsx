// Mirror the kit shell's frame (components/shell/app-shell.tsx, as used by
// components/app-nav.tsx) so the streamed page doesn't shift when it
// replaces this: rail or sidebar from md, header and bottom bar on phones.
export function ShellSkeleton() {
  return (
    <div className="min-h-dvh bg-background md:flex">
      {/* The rail (tablet) or sidebar (PC), without items. */}
      <div className="sticky top-0 hidden h-dvh w-20 shrink-0 border-r border-border bg-card md:block lg:w-56" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <div className="h-[26px] w-28 animate-pulse rounded-md bg-tint/[0.05]" />
          {/* The bell and the avatar. */}
          <div className="flex gap-2">
            <div className="size-(--control-h) animate-pulse rounded-full bg-tint/[0.04]" />
            <div className="size-(--control-h) animate-pulse rounded-full bg-tint/[0.05]" />
          </div>
        </div>
        <div className="flex-1 px-4 py-4 pb-[calc(4rem+env(safe-area-inset-bottom)+1rem)] md:px-6 md:py-6">
          <div className="space-y-3.5">
            <div className="h-[140px] animate-pulse rounded-card bg-tint/[0.05]" />
            <div className="h-[100px] animate-pulse rounded-card bg-tint/[0.04]" />
            <div className="h-[80px] animate-pulse rounded-card bg-tint/[0.03]" />
          </div>
        </div>
      </div>
      {/* The bottom bar's strip, without items: with no session yet the
          skeleton cannot know whether there are four or five. */}
      <div className="fixed inset-x-0 bottom-0 h-[calc(4rem+1px+env(safe-area-inset-bottom))] border-t border-border bg-card md:hidden" />
    </div>
  );
}
