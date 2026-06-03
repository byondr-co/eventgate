"use client";

import { QRCodeSVG } from "qrcode.react";

type ReadyProps = {
  kind?: "ready";
  claimUrl: string;
  scanner: string;
  eventName?: string;
  walkinCount?: number;
  walkinCapacity?: number;
};

type FullProps = {
  kind: "full";
  scanner: string;
  eventName?: string;
  walkinCount: number;
  walkinCapacity: number;
};

type Props = ReadyProps | FullProps;

/** Full-bleed walk-in QR display.
 *
 *  Lives on a tablet in landscape orientation. The QR flexes to fill the
 *  vertical space left by the event title (top) and the capacity counter
 *  (bottom), capped at ~85% of the shorter screen dimension, so a phone
 *  camera can still read it from across a small table.
 *
 *  When the event's `walkin_capacity` is reached, the API returns a `full`
 *  state instead of a QR — we render an alternate stop screen so the greeter
 *  knows to halt the line.
 */
export function WalkinDisplay(props: Props) {
  if (props.kind === "full") {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-amber-50 px-6 text-amber-950">
        {props.eventName ? (
          <h1 className="text-center text-3xl font-bold leading-tight">{props.eventName}</h1>
        ) : null}
        <div className="text-center">
          <p className="text-5xl font-semibold">Walk-ins are full</p>
          <p className="mt-6 font-mono text-3xl tabular-nums">
            {`${props.walkinCount} / ${props.walkinCapacity}`}
          </p>
          <p className="mt-8 text-lg text-amber-800">Please direct guests to the help desk.</p>
        </div>
        <p className="text-center text-sm text-amber-700">
          Station: <span className="font-mono">{props.scanner}</span>
        </p>
      </div>
    );
  }

  const showCounter =
    typeof props.walkinCapacity === "number" &&
    props.walkinCapacity > 0 &&
    typeof props.walkinCount === "number";

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-white px-6 py-6 text-neutral-950">
      <div className="shrink-0 text-center">
        {props.eventName ? (
          <h1 className="text-3xl font-bold leading-tight">{props.eventName}</h1>
        ) : null}
        <p className="mt-1 text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Walk-in registration — scan to enter
        </p>
      </div>

      <div className="flex aspect-square min-h-0 w-full max-w-[85vmin] flex-1 items-center justify-center rounded-2xl bg-white p-4 shadow-xl">
        <QRCodeSVG
          value={props.claimUrl}
          // size in pixels — high base value; CSS scales it to fit.
          size={2048}
          level="M"
          className="h-full w-full"
        />
      </div>

      <div className="shrink-0 text-center">
        <p className="text-lg text-neutral-700">Scan this code, then enter the hall.</p>
        {showCounter ? (
          <div className="mt-3">
            <p className="font-mono text-4xl font-semibold tabular-nums">
              {`${props.walkinCount} / ${props.walkinCapacity}`}
            </p>
            <p className="mt-0.5 text-xs tracking-wide text-neutral-500 uppercase">
              Walk-ins registered
            </p>
          </div>
        ) : null}
        <p className="mt-3 text-sm text-neutral-500">
          Station: <span className="font-mono">{props.scanner}</span>
        </p>
      </div>
    </div>
  );
}
