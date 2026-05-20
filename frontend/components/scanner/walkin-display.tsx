"use client";

import { QRCodeSVG } from "qrcode.react";

type Props = {
  claimUrl: string;
  gate: string;
  scanner: string;
};

/** Full-bleed walk-in QR display.
 *
 *  Lives on a tablet in landscape orientation. The QR is intentionally
 *  enormous (~85% of the shorter screen dimension) so a phone camera can
 *  read it from across a small table.
 */
export function WalkinDisplay({ claimUrl, gate, scanner }: Props) {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white text-neutral-950">
      <div className="flex w-full max-w-[85vmin] aspect-square items-center justify-center rounded-2xl bg-white p-6 shadow-xl">
        <QRCodeSVG
          value={claimUrl}
          // size in pixels — using a high base value; CSS scales it to fit.
          size={2048}
          level="M"
          className="h-full w-full"
        />
      </div>
      <p className="mt-6 text-center text-lg text-neutral-700">
        Scan this code, then enter the hall.
      </p>
      <p className="mt-2 text-center text-sm text-neutral-500">
        Gate: <span className="font-mono">{gate}</span>
        {" · "}
        Lane: <span className="font-mono">{scanner}</span>
      </p>
    </div>
  );
}
