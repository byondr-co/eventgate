import type { SVGProps } from "react";

function Base({ children, className, ...rest }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden className={className} {...rest}>
      {children}
    </svg>
  );
}

export const IllustrationBasics = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect x="24" y="28" width="72" height="64" rx="8" style={{ fill: "var(--color-muted)" }} />
    <rect x="34" y="42" width="52" height="6" rx="3" style={{ fill: "var(--color-primary)" }} />
    <rect x="34" y="56" width="40" height="6" rx="3" style={{ fill: "var(--color-border)" }} />
  </Base>
);

export const IllustrationChoice = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect
      x="16"
      y="40"
      width="40"
      height="40"
      rx="8"
      style={{
        fill: "color-mix(in oklch, var(--color-primary) 20%, transparent)",
        stroke: "var(--color-primary)",
      }}
    />
    <rect
      x="64"
      y="40"
      width="40"
      height="40"
      rx="8"
      style={{
        fill: "var(--color-muted)",
        stroke: "var(--color-border)",
      }}
    />
  </Base>
);

export const IllustrationGoogleInstall = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle cx="60" cy="60" r="34" style={{ fill: "var(--color-muted)" }} />
    <path
      d="M48 60l8 8 18-18"
      style={{ stroke: "var(--color-primary)" }}
      strokeWidth="6"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Base>
);

export const IllustrationSuccess = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <circle
      cx="60"
      cy="60"
      r="40"
      style={{
        fill: "color-mix(in oklch, var(--color-success) 20%, transparent)",
      }}
    />
    <path
      d="M44 62l12 12 22-26"
      style={{ stroke: "var(--color-success)" }}
      strokeWidth="7"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Base>
);

export const IllustrationEmpty = (p: SVGProps<SVGSVGElement>) => (
  <Base {...p}>
    <rect
      x="28"
      y="36"
      width="64"
      height="48"
      rx="8"
      style={{
        fill: "var(--color-muted)",
        stroke: "var(--color-border)",
      }}
    />
    <line
      x1="40"
      y1="96"
      x2="80"
      y2="96"
      style={{ stroke: "var(--color-border)" }}
      strokeWidth="4"
      strokeLinecap="round"
    />
  </Base>
);
