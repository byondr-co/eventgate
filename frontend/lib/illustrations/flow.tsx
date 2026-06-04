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

export function DeviceCreate({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <line x1="10" y1="18.5" x2="14" y2="18.5" />
      <circle cx="17.5" cy="6.5" r="4" />
      <line x1="17.5" y1="4.7" x2="17.5" y2="8.3" />
      <line x1="15.7" y1="6.5" x2="19.3" y2="6.5" />
    </>,
    className,
  );
}

export function CopyCode({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </>,
    className,
  );
}

export function OpenEnrollPage({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M3 8h18" />
      <path d="M9 21h6" />
      <path d="M12 18v3" />
    </>,
    className,
  );
}

export function EnterPin({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="8" cy="8" r="1" fill="currentColor" />
      <circle cx="12" cy="8" r="1" fill="currentColor" />
      <circle cx="16" cy="8" r="1" fill="currentColor" />
      <circle cx="8" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="16" cy="12" r="1" fill="currentColor" />
      <circle cx="8" cy="16" r="1" fill="currentColor" />
      <circle cx="12" cy="16" r="1" fill="currentColor" />
      <circle cx="16" cy="16" r="1" fill="currentColor" />
    </>,
    className,
  );
}

export function InstallPWA({ className }: IllustrationProps) {
  return base(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 7v7" />
      <path d="m9 11 3 3 3-3" />
    </>,
    className,
  );
}

export function ScanGuest({ className }: IllustrationProps) {
  return base(
    <>
      <path d="M4 7V5a1 1 0 0 1 1-1h2" />
      <path d="M17 4h2a1 1 0 0 1 1 1v2" />
      <path d="M20 17v2a1 1 0 0 1-1 1h-2" />
      <path d="M7 20H5a1 1 0 0 1-1-1v-2" />
      <path d="M4 12h16" />
    </>,
    className,
  );
}

export function WalkinInfo({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>,
    className,
  );
}

export function Registered({ className }: IllustrationProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>,
    className,
  );
}
