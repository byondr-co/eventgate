import { describe, expect, it } from "vitest";

import { extractApiError } from "@/lib/api";

describe("extractApiError", () => {
  it("parses `detail` from a JSON error body", () => {
    const err = new Error('400 Bad Request: {"detail":"This email is already a member."}');
    expect(extractApiError(err)).toBe("This email is already a member.");
  });

  it("joins non_field_errors when detail is missing", () => {
    const err = new Error('400 Bad Request: {"non_field_errors":["A","B"]}');
    expect(extractApiError(err)).toBe("A · B");
  });

  it("falls back to the raw message on non-JSON body", () => {
    const err = new Error("500 Server Error: <html>boom</html>");
    expect(extractApiError(err)).toBe("500 Server Error: <html>boom</html>");
  });

  it("returns a generic string on non-Error input", () => {
    expect(extractApiError(undefined)).toBe("Something went wrong.");
    expect(extractApiError("nope")).toBe("Something went wrong.");
  });

  it("returns the raw message when JSON parses but has no detail and no non_field_errors", () => {
    const err = new Error('400 Bad Request: {"other":"x"}');
    expect(extractApiError(err)).toBe(err.message);
  });
});
