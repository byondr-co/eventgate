"use client";

import { useState } from "react";

type Props = {
  busy?: boolean;
  onSubmit: (token: string) => void;
};

export function ManualTokenEntry({ busy, onSubmit }: Props) {
  const [token, setToken] = useState("");

  const handle = (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    onSubmit(t);
    setToken("");
  };

  return (
    <form onSubmit={handle} className="space-y-3">
      <label className="block">
        <span className="text-sm text-neutral-400">Manual token entry</span>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={2}
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="off"
          placeholder="Paste the token from the email"
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm break-all"
        />
      </label>
      <button
        type="submit"
        disabled={busy || !token.trim()}
        className="w-full rounded-md bg-white px-4 py-3 text-base font-medium text-neutral-950 disabled:opacity-50"
      >
        {busy ? "Checking in…" : "Check in"}
      </button>
    </form>
  );
}
