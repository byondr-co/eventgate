import { describe, expect, it } from "vitest";

import { eventStatusVariant } from "@/components/events/events-table";
import type { EventStatus } from "@/lib/events";

describe("eventStatusVariant", () => {
  const cases: Array<[EventStatus, string]> = [
    ["draft", "secondary"],
    ["open", "default"],
    ["live", "default"],
    ["closed", "outline"],
    ["archived", "outline"],
  ];

  it.each(cases)("status '%s' → variant '%s'", (status, expectedVariant) => {
    expect(eventStatusVariant(status)).toBe(expectedVariant);
  });
});
