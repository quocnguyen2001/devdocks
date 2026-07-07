import { cn } from "@/lib/utils";

/** Pulsing placeholder block. Pulse honors reduced-motion via the global media
 *  rule in index.css. Compose several to shape a loading state. */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded bg-muted", className)}
      {...props}
    />
  );
}
