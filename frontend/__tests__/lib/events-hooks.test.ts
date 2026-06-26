import { describe, expect, it } from "vitest";
import type { UpdateEventInput } from "@/lib/events";

describe("event hooks types", () => {
  it("UpdateEventInput allows the editable fields", () => {
    const input: UpdateEventInput = {
      name: "Gala",
      slug: "gala-2026",
      venue: "Hall A",
      starts_at: "2026-07-01T10:00:00Z",
      ends_at: "2026-07-01T18:00:00Z",
      timezone: "Asia/Phnom_Penh",
      walkin_capacity: 100,
    };
    expect(input.slug).toBe("gala-2026");
  });
});
