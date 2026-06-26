// frontend/__tests__/lib/guests-hooks.test.ts
import { describe, expect, it } from "vitest";
import type { GuestEditInput } from "@/lib/guests";

describe("guest hooks types", () => {
  it("GuestEditInput allows contact + custom fields", () => {
    const input: GuestEditInput = {
      full_name: "Ana Lim",
      email: "ana@x.com",
      phone_or_chat: "@ana",
      custom_fields: { company: "Acme" },
    };
    expect(input.email).toBe("ana@x.com");
  });
});
