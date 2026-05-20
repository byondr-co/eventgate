/**
 * Thin types for the W3C `BarcodeDetector` API used by the scan page.
 *
 * BarcodeDetector ships on Chrome (Android, ChromeOS, desktop with flag) and
 * Edge. iOS Safari and Firefox don't have it yet; the scan page falls back
 * to a manual-entry input via `hasBarcodeDetector()`.
 */

import { useSyncExternalStore } from "react";

export type DetectedBarcode = { rawValue: string };

export type BarcodeDetectorLike = {
  detect(source: HTMLVideoElement | ImageBitmap): Promise<DetectedBarcode[]>;
};

type BarcodeDetectorCtor = new (config: { formats: string[] }) => BarcodeDetectorLike;

function getCtor(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorCtor };
  return w.BarcodeDetector ?? null;
}

export function newDetector(): BarcodeDetectorLike | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  try {
    return new Ctor({ formats: ["qr_code"] });
  } catch {
    return null;
  }
}

// useSyncExternalStore-friendly snapshot. BarcodeDetector availability never
// changes within a session, so the no-op subscribe is intentional.
const subscribeNoop = () => () => {};
const getSupportClient = () => getCtor() !== null;
const getSupportServer = () => false;

export function useBarcodeDetectorSupport(): boolean {
  return useSyncExternalStore(subscribeNoop, getSupportClient, getSupportServer);
}
