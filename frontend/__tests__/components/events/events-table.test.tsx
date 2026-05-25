import { describe, expect, it } from "vitest";

import { eventStatusVariant } from "@/components/events/events-table";
import type { EventStatus } from "@/lib/events";

describe("eventStatusVariant", () => {
  const cases: Array<[EventStatus, string]> = [
    ["draft", "outline"],
    ["open", "secondary"],
    ["live", "default"],
    ["closed", "destructive"],
    ["archived", "ghost"],
  ];

  it.each(cases)("status '%s' → variant '%s'", (status, expectedVariant) => {
    expect(eventStatusVariant(status)).toBe(expectedVariant);
  });
});
