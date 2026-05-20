"use client";

import type { CheckinOutcome } from "@/lib/scanner/api";

type Props = {
  outcome: CheckinOutcome;
  onDismiss: () => void;
};

/** Full-screen, high-contrast result. 1.5s minimum on screen (parent controls).
 *  Color semantics match the MVP (green/amber/red). Tappable to dismiss early. */
export function ResultCard({ outcome, onDismiss }: Props) {
  const palette = {
    success: { bg: "bg-green-600", icon: "✓", title: "CHECKED IN" },
    duplicate: { bg: "bg-amber-500", icon: "!", title: "ALREADY IN" },
    invalid: { bg: "bg-red-600", icon: "✕", title: "INVALID" },
    session_expired: { bg: "bg-red-600", icon: "✕", title: "SESSION EXPIRED" },
    error: { bg: "bg-red-600", icon: "✕", title: "ERROR" },
  }[outcome.kind];

  let detail = "";
  let name = "";
  if (outcome.kind === "success") {
    name = outcome.guest.full_name || outcome.guest.email;
    detail = "Please enter.";
  } else if (outcome.kind === "duplicate") {
    name = outcome.guest.full_name || outcome.guest.email;
    detail = outcome.detail;
  } else if (outcome.kind === "invalid") {
    detail = outcome.detail;
  } else if (outcome.kind === "session_expired") {
    detail = "Re-enter the event PIN to continue.";
  } else {
    detail = outcome.detail;
  }

  return (
    <button
      type="button"
      onClick={onDismiss}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center px-6 text-center ${palette.bg} text-white`}
    >
      <div className="text-[8rem] leading-none">{palette.icon}</div>
      <div className="mt-4 text-3xl font-extrabold tracking-wide">{palette.title}</div>
      {name ? <div className="mt-6 text-2xl font-semibold">{name}</div> : null}
      {detail ? <div className="mt-2 text-base opacity-90">{detail}</div> : null}
      <div className="mt-12 text-xs uppercase tracking-wider opacity-70">tap to dismiss</div>
    </button>
  );
}
