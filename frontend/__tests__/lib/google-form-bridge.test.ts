import { describe, expect, it } from "vitest";
import type { GoogleFormBridge } from "@/lib/google-form-bridge";

describe("bridge types", () => {
  it("includes seen_labels and test_mode", () => {
    const b: GoogleFormBridge = {
      id: "1",
      name: "G",
      enabled: false,
      test_mode: false,
      field_mapping: {},
      duplicate_policy: "upsert_by_email",
      webhook_url: "/x",
      seen_labels: [],
      last_seen_at: null,
      recent_submissions: [],
      created_at: "",
      updated_at: "",
    };
    expect(b.seen_labels).toEqual([]);
    expect(b.test_mode).toBe(false);
  });
});
