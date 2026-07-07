import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder for the lazily-loaded workspace editor. Mirrors the
 *  editor's pinned-header / scroll-body / footer shape so the swap is calm. */
export function WorkspaceEditorSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <header className="shrink-0 border-b border-border px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-md" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto max-w-5xl space-y-3 px-6 py-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border border-border bg-elevated/40 px-3.5 py-3"
            >
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-4 w-4" />
            </div>
          ))}
        </div>
      </div>
      <footer className="shrink-0 border-t border-border px-6 py-3">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-2">
          <Skeleton className="h-9 w-20 rounded-md" />
          <Skeleton className="h-9 w-16 rounded-md" />
        </div>
      </footer>
    </div>
  );
}
