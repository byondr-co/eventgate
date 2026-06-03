import { beforeEach, describe, expect, it } from "vitest";

import {
  claimedKey,
  getDeviceId,
  markInfoCompleted,
  readClaim,
  writeClaim,
} from "@/lib/walkin-device";

beforeEach(() => {
  localStorage.clear();
});

describe("walkin-device storage", () => {
  it("builds a readable per-event key", () => {
    expect(claimedKey("byondr-co", "launch-pilot")).toBe(
      "eventgate.walkin.claimed:byondr-co/launch-pilot",
    );
  });

  it("round-trips a claimed token per event", () => {
    expect(readClaim("o", "e")).toBeNull();
    writeClaim("o", "e", "tok-1");
    const stored = readClaim("o", "e");
    expect(stored?.token).toBe("tok-1");
    expect(typeof stored?.claimedAt).toBe("number");
    // A different event is independent.
    expect(readClaim("o", "other")).toBeNull();
  });

  it("tracks info completion per claim", () => {
    writeClaim("o", "e", "tok-1");
    expect(readClaim("o", "e")?.infoCompleted).toBe(false);
    markInfoCompleted("o", "e", "tok-1");
    expect(readClaim("o", "e")?.infoCompleted).toBe(true);
  });

  it("preserves info-completed when re-writing the same token, resets on a new token", () => {
    markInfoCompleted("o", "e", "tok-1");
    writeClaim("o", "e", "tok-1");
    expect(readClaim("o", "e")?.infoCompleted).toBe(true);
    writeClaim("o", "e", "tok-2");
    expect(readClaim("o", "e")?.infoCompleted).toBe(false);
  });

  it("returns a stable device id across calls", () => {
    const a = getDeviceId();
    const b = getDeviceId();
    expect(a).not.toBe("");
    expect(a).toBe(b);
  });
});
