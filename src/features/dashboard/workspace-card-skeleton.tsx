import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder card shown while workspaces load. Sized to the real card so the
 *  grid doesn't shift when data arrives (CLS). Pulse honors reduced-motion via
 *  the global media rule in index.css. */
export function WorkspaceCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-elevated/40 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <Skeleton className="h-4 w-4" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-4 w-12 rounded-full" />
        <Skeleton className="h-4 w-10 rounded-full" />
      </div>
      <div className="mt-auto flex items-center justify-between">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-4 w-16" />
      </div>
    </div>
  );
}
