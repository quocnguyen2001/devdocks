interface LogoProps {
  size?: number;
  className?: string;
}

/** DevDock "Stacked" mark — layered rounded boxes on the Indigo brand squircle.
 *  Uses the `--brand` token (with a hard fallback) so it tracks the design system. */
export function Logo({ size = 20, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role="img"
      aria-label="DevDock"
    >
      <rect x="6" y="6" width="88" height="88" rx="22" fill="var(--brand, #5457e5)" />
      <g fill="#ffffff">
        <rect x="30" y="26" width="34" height="34" rx="8" opacity="0.38" />
        <rect x="38" y="34" width="34" height="34" rx="8" opacity="0.64" />
        <rect x="46" y="42" width="28" height="28" rx="7" />
      </g>
    </svg>
  );
}
