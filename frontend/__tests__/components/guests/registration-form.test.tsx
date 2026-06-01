import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks must be hoisted before component imports.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, _params?: Record<string, string>) => {
    const map: Record<string, string> = {
      title: "Register",
      subtitle: "Fill in your details",
      submit: "Register",
      submitting: "Registering…",
      selectPlaceholder: "Choose an option…",
      fieldRequired: "This field is required.",
    };
    return map[key] ?? key;
  },
  useLocale: () => "en",
}));

vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  extractApiError: (err: unknown) => (err instanceof Error ? err.message : "Something went wrong."),
  extractFieldErrors: vi.fn(),
  API_BASE: "http://localhost:8000",
}));

vi.mock("@/lib/guests", () => ({
  useRegisterPublic: vi.fn(),
}));

import { extractFieldErrors } from "@/lib/api";
import { useRegisterPublic } from "@/lib/guests";
import { RegistrationForm } from "@/components/guests/registration-form";
import type { PublicEventField } from "@/lib/events";

const mockExtractFieldErrors = vi.mocked(extractFieldErrors);
const mockUseRegisterPublic = vi.mocked(useRegisterPublic);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const nameField: PublicEventField = {
  field_key: "name",
  label_en: "Full name",
  label_km: "ឈ្មោះពេញ",
  field_type: "text",
  required: true,
  options: [],
  order_index: 0,
};

const emailField: PublicEventField = {
  field_key: "email",
  label_en: "Email",
  label_km: "អ៊ីមែល",
  field_type: "email",
  required: true,
  options: [],
  order_index: 1,
};

const phoneField: PublicEventField = {
  field_key: "phone_or_chat",
  label_en: "Phone or Chat ID",
  label_km: "លេខទូរស័ព្ទ",
  field_type: "text",
  required: false,
  options: [],
  order_index: 2,
};

const customTextField: PublicEventField = {
  field_key: "company",
  label_en: "Company",
  label_km: "ក្រុមហ៊ុន",
  field_type: "text",
  required: false,
  options: [],
  order_index: 3,
};

// A required custom field not in the preset set.
const requiredCustomField: PublicEventField = {
  field_key: "job_title",
  label_en: "Job Title",
  label_km: "",
  field_type: "text",
  required: true,
  options: [],
  order_index: 4,
};

function makeMutation(overrides: Record<string, unknown> = {}) {
  return {
    mutateAsync: vi.fn().mockResolvedValue({ guest_id: "g1", entry_token: "tok" }),
    isPending: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseRegisterPublic.mockReturnValue(makeMutation() as never);
  mockExtractFieldErrors.mockReturnValue({ fieldErrors: {}, formError: null });
});

// ---------------------------------------------------------------------------
// Data-driven rendering
// ---------------------------------------------------------------------------

describe("RegistrationForm data-driven rendering", () => {
  it("renders only the fields provided in the fields prop (name + email)", () => {
    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, emailField]}
      />,
    );
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    // phone_or_chat is NOT in fields — must not render
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it("renders a field that was removed from the preset list (phone_or_chat absent)", () => {
    // Only name + email, phone_or_chat intentionally deleted from builder
    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, emailField]}
      />,
    );
    expect(screen.queryByLabelText(/phone or chat/i)).not.toBeInTheDocument();
  });

  it("renders all three preset fields when all are provided", () => {
    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, emailField, phoneField]}
      />,
    );
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone or chat/i)).toBeInTheDocument();
  });

  it("renders custom fields sorted by order_index", () => {
    const reversed = [customTextField, phoneField, emailField, nameField].map((f, i) => ({
      ...f,
      order_index: 3 - i,
    }));
    wrap(
      <RegistrationForm orgSlug="org" eventSlug="evt" eventName="Test Event" fields={reversed} />,
    );
    const inputs = screen.getAllByRole("textbox");
    // All inputs should be present regardless of order
    expect(inputs.length).toBe(4);
  });

  it("renders a select element for select field_type", () => {
    const selectField: PublicEventField = {
      field_key: "session",
      label_en: "Session",
      label_km: "",
      field_type: "select",
      required: false,
      options: ["Morning", "Afternoon"],
      order_index: 5,
    };
    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, selectField]}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByText("Morning")).toBeInTheDocument();
    expect(screen.getByText("Afternoon")).toBeInTheDocument();
  });

  it("renders a textarea for textarea field_type", () => {
    const textareaField: PublicEventField = {
      field_key: "bio",
      label_en: "Bio",
      label_km: "",
      field_type: "textarea",
      required: false,
      options: [],
      order_index: 6,
    };
    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[textareaField]}
      />,
    );
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    // textarea has rows attribute
    const textarea = screen.getByRole("textbox");
    expect(textarea.tagName.toLowerCase()).toBe("textarea");
  });

  it("renders with no fields gracefully (no inputs, just the submit button)", () => {
    wrap(<RegistrationForm orgSlug="org" eventSlug="evt" eventName="Test Event" fields={[]} />);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /register/i })).toBeInTheDocument();
  });

  it("form element has noValidate to suppress native browser validation bubbles", () => {
    const { container } = wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[emailField]}
      />,
    );
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("novalidate");
  });
});

// ---------------------------------------------------------------------------
// Client-side required validation
// ---------------------------------------------------------------------------

describe("RegistrationForm client-side validation", () => {
  it("blocks submit and shows inline error for empty required field", async () => {
    const mutateAsync = vi.fn();
    mockUseRegisterPublic.mockReturnValue({ mutateAsync, isPending: false } as never);

    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, emailField]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/this field is required/i).length).toBeGreaterThanOrEqual(1);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("shows per-field inline errors (one per missing required field)", async () => {
    const mutateAsync = vi.fn();
    mockUseRegisterPublic.mockReturnValue({ mutateAsync, isPending: false } as never);

    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, emailField, requiredCustomField]}
      />,
    );

    // Leave all blank and submit
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      const errors = screen.getAllByText(/this field is required/i);
      // 3 required fields → 3 errors
      expect(errors).toHaveLength(3);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("allows submit when all required fields are filled", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ guest_id: "g1", entry_token: "t" });
    mockUseRegisterPublic.mockReturnValue({ mutateAsync, isPending: false } as never);

    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });
    expect(screen.queryByText(/this field is required/i)).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Server error handling (inline, D1)
// ---------------------------------------------------------------------------

describe("RegistrationForm server error display", () => {
  it("shows field-level errors under the correct field on 400", async () => {
    // Use a text field (not email type) so client-side validation passes and mutateAsync is called.
    const textEmailField: PublicEventField = {
      ...emailField,
      field_type: "text",
    };
    const err = new Error('400 Bad Request: {"email":["Enter a valid email."]}');
    const mutateAsync = vi.fn().mockRejectedValue(err);
    mockUseRegisterPublic.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockExtractFieldErrors.mockReturnValue({
      fieldErrors: { email: "Enter a valid email." },
      formError: null,
    });

    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField, textEmailField]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByText("Enter a valid email.")).toBeInTheDocument();
    });
  });

  it("shows a form-level error at the top when formError is set", async () => {
    const err = new Error('403 Forbidden: {"detail":"Registration is closed."}');
    const mutateAsync = vi.fn().mockRejectedValue(err);
    mockUseRegisterPublic.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockExtractFieldErrors.mockReturnValue({
      fieldErrors: {},
      formError: "Registration is closed.",
    });

    wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByText("Registration is closed.")).toBeInTheDocument();
    });
    // form-level error must carry role="alert" for screen-reader parity
    expect(screen.getByText("Registration is closed.").closest("p")).toHaveAttribute(
      "role",
      "alert",
    );
  });

  it("never renders raw JSON/HTML from the server error", async () => {
    const err = new Error("500 Internal Server Error: <html><body>crash</body></html>");
    const mutateAsync = vi.fn().mockRejectedValue(err);
    mockUseRegisterPublic.mockReturnValue({ mutateAsync, isPending: false } as never);
    mockExtractFieldErrors.mockReturnValue({
      fieldErrors: {},
      formError: "Something went wrong. Please try again.",
    });

    const { container } = wrap(
      <RegistrationForm
        orgSlug="org"
        eventSlug="evt"
        eventName="Test Event"
        fields={[nameField]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/full name/i), { target: { value: "Alice" } });
    fireEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByText("Something went wrong. Please try again.")).toBeInTheDocument();
    });
    // No raw HTML in DOM
    expect(container.innerHTML).not.toContain("<html>");
    expect(container.innerHTML).not.toContain("crash");
  });
});
