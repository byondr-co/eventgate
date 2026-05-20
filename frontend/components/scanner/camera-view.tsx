"use client";

import { useEffect, useRef, useState } from "react";

import { newDetector } from "@/lib/scanner/camera";

type Props = {
  /** When true, the scan loop is paused (e.g. while showing a result card). */
  paused?: boolean;
  /** Fires once per distinct token detection. Debounced so a held QR isn't
   *  re-fired until the QR leaves the camera frame for ~1 second. */
  onScan: (rawToken: string) => void;
};

const SCAN_INTERVAL_MS = 250;
const EMPTY_FRAMES_TO_CLEAR = 4; // 4 * 250ms = ~1s of "no QR" → clear last-seen

export function CameraView({ paused, onScan }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastTokenRef = useRef<string | null>(null);
  const pausedRef = useRef<boolean>(!!paused);
  const onScanRef = useRef(onScan);

  // Keep refs in sync without restarting the camera every render.
  useEffect(() => {
    pausedRef.current = !!paused;
  }, [paused]);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const detector = newDetector();
    let active = true;
    let stream: MediaStream | null = null;
    let timer: number | null = null;
    let consecutiveEmpty = 0;

    const detect = async (): Promise<void> => {
      if (!active) return;
      if (!pausedRef.current && detector && video.readyState >= 2) {
        try {
          const results = await detector.detect(video);
          if (results.length > 0) {
            consecutiveEmpty = 0;
            const token = results[0].rawValue;
            if (token && token !== lastTokenRef.current) {
              lastTokenRef.current = token;
              onScanRef.current(token);
            }
          } else {
            consecutiveEmpty += 1;
            if (consecutiveEmpty >= EMPTY_FRAMES_TO_CLEAR) {
              lastTokenRef.current = null;
            }
          }
        } catch {
          // Ignore transient detection errors; keep looping.
        }
      }
      timer = window.setTimeout(detect, SCAN_INTERVAL_MS);
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        video.srcObject = stream;
        await video.play();
        detect();
      } catch (e) {
        setError(
          (e as Error).name === "NotAllowedError"
            ? "Camera permission denied. Use manual entry below."
            : `Camera error: ${(e as Error).message}`,
        );
      }
    };

    start();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
    // Intentional empty deps — see refs above. We do NOT want to restart the
    // camera when `paused` toggles; we just read the latest value via the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className="w-full rounded-lg bg-black object-cover aspect-[3/4]"
        autoPlay
        playsInline
        muted
      />
      {/* Centered viewfinder hint */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-3/5 w-3/5 rounded-lg border-2 border-white/60" />
      </div>
      {error ? <p className="mt-3 text-sm text-amber-400">{error}</p> : null}
    </div>
  );
}
