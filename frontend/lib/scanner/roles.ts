import type { ScannerRole } from "./session";

/** Where each role lands after unlocking. */
export const ROLE_LANDING: Record<ScannerRole, string> = {
  scanner: "/scanner/scan",
  walkin_display: "/scanner/walkin",
  helpdesk: "/scanner/enroll", // Plan F lands the help-desk lane; bounce for now
};

export const ROLE_LABELS: Record<ScannerRole, string> = {
  scanner: "Pre-reg scanner",
  walkin_display: "Walk-in display",
  helpdesk: "Help desk",
};
