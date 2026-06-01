import { describe, expect, it } from "vitest";

import { extractApiError, extractFieldErrors } from "@/lib/api";

// ---------------------------------------------------------------------------
// extractApiError
// ---------------------------------------------------------------------------

describe("extractApiError", () => {
  it("(a) parses {detail} from a JSON error body", () => {
    const err = new Error('400 Bad Request: {"detail":"This email is already a member."}');
    expect(extractApiError(err)).toBe("This email is already a member.");
  });

  it("(b) joins non_field_errors from a JSON error body", () => {
    const err = new Error('400 Bad Request: {"non_field_errors":["A","B"]}');
    expect(extractApiError(err)).toBe("A · B");
  });

  it("(c) HTML 500 page body → generic message with no angle brackets", () => {
    const err = new Error(
      "500 Internal Server Error: <html><body>Internal Server Error</body></html>",
    );
    const result = extractApiError(err);
    expect(result).not.toContain("<");
    expect(result).toBe("Something went wrong. Please try again.");
  });

  it("(c2) <!DOCTYPE html> body → generic message", () => {
    const err = new Error("503 Service Unavailable: <!DOCTYPE html><html><body>down</body></html>");
    const result = extractApiError(err);
    expect(result).not.toContain("<");
    expect(result).toBe("Something went wrong. Please try again.");
  });

  it("(d) non-Error input → generic 'Something went wrong.'", () => {
    expect(extractApiError(undefined)).toBe("Something went wrong.");
    expect(extractApiError("nope")).toBe("Something went wrong.");
    expect(extractApiError(null)).toBe("Something went wrong.");
    expect(extractApiError(42)).toBe("Something went wrong.");
  });

  it("unknown JSON shape (no detail/non_field_errors) → generic", () => {
    const err = new Error('400 Bad Request: {"other":"x"}');
    expect(extractApiError(err)).toBe("Something went wrong. Please try again.");
  });

  it("plain non-apiFetch message → returned as-is", () => {
    const err = new Error("Network request failed");
    expect(extractApiError(err)).toBe("Network request failed");
  });
});

// ---------------------------------------------------------------------------
// extractFieldErrors
// ---------------------------------------------------------------------------

describe("extractFieldErrors", () => {
  it("(e) {email: ['Enter a valid email.']} → fieldErrors.email set, formError null", () => {
    const err = new Error('400 Bad Request: {"email":["Enter a valid email."]}');
    const { fieldErrors, formError } = extractFieldErrors(err);
    expect(fieldErrors.email).toBe("Enter a valid email.");
    expect(formError).toBeNull();
  });

  it("(f) {detail: '...'} → folded into formError, empty fieldErrors", () => {
    const err = new Error('403 Forbidden: {"detail":"You do not have permission."}');
    const { fieldErrors, formError } = extractFieldErrors(err);
    expect(Object.keys(fieldErrors)).toHaveLength(0);
    expect(formError).toBe("You do not have permission.");
  });

  it("non_field_errors → folded into formError, empty fieldErrors", () => {
    const err = new Error('400 Bad Request: {"non_field_errors":["Passwords do not match."]}');
    const { fieldErrors, formError } = extractFieldErrors(err);
    expect(Object.keys(fieldErrors)).toHaveLength(0);
    expect(formError).toBe("Passwords do not match.");
  });

  it("(g) HTML body → empty fieldErrors + generic formError", () => {
    const err = new Error(
      "500 Internal Server Error: <html><body>Internal Server Error</body></html>",
    );
    const { fieldErrors, formError } = extractFieldErrors(err);
    expect(Object.keys(fieldErrors)).toHaveLength(0);
    expect(formError).toBe("Something went wrong. Please try again.");
  });

  it("non-Error → empty fieldErrors + generic formError", () => {
    const { fieldErrors, formError } = extractFieldErrors("oops");
    expect(Object.keys(fieldErrors)).toHaveLength(0);
    expect(formError).toBe("Something went wrong. Please try again.");
  });

  it("multiple field errors → first message per field", () => {
    const err = new Error(
      '400 Bad Request: {"username":["Too short.","Must be unique."],"password":["Too weak."]}',
    );
    const { fieldErrors, formError } = extractFieldErrors(err);
    expect(fieldErrors.username).toBe("Too short.");
    expect(fieldErrors.password).toBe("Too weak.");
    expect(formError).toBeNull();
  });
});
