import { redirect } from "next/navigation";

/**
 * `/scanner` has no UI of its own — the actual entry point is `/scanner/enroll`
 * (or whatever route the existing-device redirect picks up in layout.tsx).
 *
 * Server-side redirect here so that:
 *   - the PWA install `start_url: "/scanner/"` lands users on a working page
 *     instead of a 404,
 *   - URL-pasters get sent to the enroll flow without a client-side flash.
 */
export default function ScannerRoot(): never {
  redirect("/scanner/enroll");
}
