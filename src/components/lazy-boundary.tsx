import { Component, Suspense, type ReactNode } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LazyBoundaryProps {
  /** Loading placeholder shown while the lazy chunk is fetched. */
  fallback: ReactNode;
  children: ReactNode;
}

interface LazyBoundaryState {
  failed: boolean;
}

/**
 * Suspense + error boundary for a lazily-loaded screen. If the dynamic import
 * fails — a stale Vite optimize-dep chunk during `tauri dev`, or a missing asset
 * in a packaged build — the user gets a recoverable Reload prompt instead of
 * being trapped on the loading skeleton forever. React.lazy caches a rejected
 * import promise, so recovery is a full reload (rebuilds the module graph), not
 * a re-render of the boundary.
 */
export class LazyBoundary extends Component<
  LazyBoundaryProps,
  LazyBoundaryState
> {
  state: LazyBoundaryState = { failed: false };

  static getDerivedStateFromError(): LazyBoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">This screen failed to load</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              A part of the app couldn’t be fetched. Reloading usually fixes it.
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>
            <RotateCw className="h-4 w-4" /> Reload
          </Button>
        </div>
      );
    }
    return <Suspense fallback={this.props.fallback}>{this.props.children}</Suspense>;
  }
}
