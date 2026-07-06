import type { ReactNode } from "react";

/** A titled dashboard section (Favorites / Recent / All) with a count and a
 *  responsive card grid. Renders nothing when it has no children rows. */
export function DashboardSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (count === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
        <span className="tabular text-muted-foreground/70">{count}</span>
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}
