"use client";

import { QRCodeSVG } from "qrcode.react";

type ReadyProps = {
  kind?: "ready";
  claimUrl: string;
  gate: string;
  scanner: string;
  walkinCount?: number;
  walkinCapacity?: number;
};

type FullProps = {
  kind: "full";
  gate: string;
  scanner: string;
  walkinCount: number;
  walkinCapacity: number;
};

type Props = ReadyProps | FullProps;

/** Full-bleed walk-in QR display.
 *
 *  Lives on a tablet in landscape orientation. The QR is intentionally
 *  enormous (~85% of the shorter screen dimension) so a phone camera can
 *  read it from across a small table.
 *
 *  When the event's `walkin_capacity` is reached, the API returns a `full`
 *  state instead of a QR — we render an alternate full-screen view so the
 *  greeter knows to stop the line.
 */
export function WalkinDisplay(props: Props) {
  if (props.kind === "full") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-amber-50 text-amber-950">
        <div className="text-center">
          <p className="text-5xl font-semibold">Walk-ins are full</p>
          <p className="mt-6 font-mono text-3xl">
            {props.walkinCount} / {props.walkinCapacity}
          </p>
          <p className="mt-8 text-lg text-amber-800">Please direct guests to the help desk.</p>
        </div>
        <p className="mt-12 text-center text-sm text-amber-700">
          Gate: <span className="font-mono">{props.gate}</span>
          {" · "}
          Lane: <span className="font-mono">{props.scanner}</span>
        </p>
      </div>
    );
  }

  const showCounter =
    typeof props.walkinCapacity === "number" &&
    props.walkinCapacity > 0 &&
    typeof props.walkinCount === "number";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-white text-neutral-950">
      <div className="flex w-full max-w-[85vmin] aspect-square items-center justify-center rounded-2xl bg-white p-6 shadow-xl">
        <QRCodeSVG
          value={props.claimUrl}
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
        Gate: <span className="font-mono">{props.gate}</span>
        {" · "}
        Lane: <span className="font-mono">{props.scanner}</span>
      </p>
      {showCounter ? (
        <p className="mt-4 text-center font-mono text-sm text-neutral-500">
          {props.walkinCount} / {props.walkinCapacity}
        </p>
      ) : null}
    </div>
  );
}
