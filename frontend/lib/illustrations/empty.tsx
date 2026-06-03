type IllustrationProps = { className?: string };

function base(children: React.ReactNode, className?: string) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function NoDevices({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <line x1="10" y1="18.5" x2="14" y2="18.5" />
    </>,
    className,
  );
}

export function NoGuests({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.5" />
      <path d="M17 14.5a6 6 0 0 1 4 5.5" />
    </>,
    className,
  );
}

export function NoEvents({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="3" y="4.5" width="18" height="16" rx="2" />
      <path d="M3 9h18" />
      <path d="M8 2.5v4" />
      <path d="M16 2.5v4" />
    </>,
    className,
  );
}

export function NoLinks({ className }: IllustrationProps) {
  return base(
    <>
      <path d="M9 12a3 3 0 0 1 3-3h3a3 3 0 0 1 0 6h-1" />
      <path d="M15 12a3 3 0 0 1-3 3H9a3 3 0 0 1 0-6h1" />
    </>,
    className,
  );
}
