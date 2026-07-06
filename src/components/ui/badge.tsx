import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeSize = "sm" | "default";

const sizeClasses: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-[11px]",
  default: "px-2.5 py-0.5 text-xs",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: BadgeSize;
}

/** Token-driven tag/label pill. Replaces ad-hoc tag spans across the app. */
export function Badge({ className, size = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-secondary font-medium text-secondary-foreground",
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
