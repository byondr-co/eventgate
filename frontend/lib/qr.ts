import { API_BASE } from "./api";

export function qrPngUrl(guestId: string, token: string): string {
  return `${API_BASE}/api/v1/guests/${guestId}/qr.png?token=${encodeURIComponent(token)}`;
}
