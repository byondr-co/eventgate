"use client";

import Link from "next/link";

type Props = {
  infoFormUrl: string;
};

/** Full-bleed "ENTRY CONFIRMED" hero. Designed to be unmistakable at a glance
 *  from arm's length under venue lighting — that's the door staff's UX, not
 *  the guest's. The guest mainly wants permission to walk past. */
export function ClaimConfirmation({ infoFormUrl }: Props) {
  return (
    <main className="min-h-screen bg-green-600 text-white">
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center">
        <div className="text-[10rem] leading-none">✓</div>
        <h1 className="mt-4 text-4xl font-extrabold tracking-wide">ENTRY CONFIRMED</h1>
        <p className="mt-6 text-lg">Please enter the hall.</p>
        <p className="mt-2 text-base opacity-90">
          Complete the form below once you&apos;re inside.
        </p>
        <Link
          href={infoFormUrl}
          className="mt-10 inline-block rounded-md bg-white px-6 py-3 text-base font-medium text-green-700 shadow-md"
        >
          Complete my info
        </Link>
      </div>
    </main>
  );
}
