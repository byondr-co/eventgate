import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/events", () => ({
  useFields: vi.fn(),
}));
vi.mock("@/lib/google-form-bridge", () => ({
  useGoogleFormBridges: vi.fn(),
  useCreateGoogleFormBridge: vi.fn(),
  useUpdateGoogleFormBridge: vi.fn(),
  useRotateGoogleFormBridgeSecret: vi.fn(),
}));

import { GoogleFormBridgeCard } from "@/components/integrations/google-form-bridge-card";
import { useFields } from "@/lib/events";
import {
  useCreateGoogleFormBridge,
  useGoogleFormBridges,
  useRotateGoogleFormBridgeSecret,
  useUpdateGoogleFormBridge,
} from "@/lib/google-form-bridge";

const mockFields = vi.mocked(useFields);
const mockBridges = vi.mocked(useGoogleFormBridges);
const mockCreate = vi.mocked(useCreateGoogleFormBridge);
const mockUpdate = vi.mocked(useUpdateGoogleFormBridge);
const mockRotate = vi.mocked(useRotateGoogleFormBridgeSecret);

beforeEach(() => {
  vi.clearAllMocks();
  mockFields.mockReturnValue({
    data: {
      results: [
        {
          field_key: "name",
          label_en: "Full name",
          label_km: "",
          field_type: "text",
          required: true,
        },
        {
          field_key: "email",
          label_en: "Email",
          label_km: "",
          field_type: "email",
          required: true,
        },
        {
          field_key: "phone_or_chat",
          label_en: "Phone",
          label_km: "",
          field_type: "phone",
          required: false,
        },
      ],
    },
  } as never);
  mockCreate.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
  mockUpdate.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
  mockRotate.mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
  } as never);
});

describe("GoogleFormBridgeCard", () => {
  it("shows the empty setup state", () => {
    mockBridges.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);

    expect(screen.getByText("Google Form bridge")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create bridge" })).toBeInTheDocument();
  });

  it("creates a bridge and displays the one-time secret", async () => {
    const create = vi.fn().mockResolvedValue({
      id: "b1",
      name: "Click Cam Form",
      enabled: false,
      field_mapping: {},
      duplicate_policy: "upsert_by_email",
      webhook_url: "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
      last_seen_at: null,
      recent_submissions: [],
      created_at: "2026-06-07T00:00:00Z",
      updated_at: "2026-06-07T00:00:00Z",
      secret: "secret-123",
    });
    mockBridges.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
    } as never);
    mockCreate.mockReturnValue({
      mutateAsync: create,
      isPending: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);
    fireEvent.click(screen.getByRole("button", { name: "Create bridge" }));

    expect(await screen.findByText(/secret-123/)).toBeInTheDocument();
    expect(create).toHaveBeenCalledWith({
      name: "Google Form",
      enabled: false,
      duplicate_policy: "upsert_by_email",
      field_mapping: {},
    });
  });

  it("shows existing webhook URL and Apps Script snippet", () => {
    mockBridges.mockReturnValue({
      data: {
        count: 1,
        results: [
          {
            id: "b1",
            name: "Click Cam Form",
            enabled: true,
            field_mapping: { "Full Name": "name" },
            duplicate_policy: "upsert_by_email",
            webhook_url: "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
            last_seen_at: null,
            recent_submissions: [],
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);

    expect(screen.getByLabelText("Webhook URL")).toHaveValue(
      "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
    );
    expect(screen.getByText(/function onFormSubmit/)).toBeInTheDocument();
    const script = screen.getByLabelText("Apps Script") as HTMLTextAreaElement;
    expect(script.value).toContain("sheet.getSheetId()");
    expect(script.value).toContain("function postToEventgate");
    expect(script.value).not.toContain('values["Email"]');
  });

  it("adds a Google Form label mapping by patching the bridge field_mapping", async () => {
    const update = vi.fn().mockResolvedValue({});
    mockBridges.mockReturnValue({
      data: {
        count: 1,
        results: [
          {
            id: "b1",
            name: "Click Cam Form",
            enabled: false,
            field_mapping: {},
            duplicate_policy: "upsert_by_email",
            webhook_url: "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
            last_seen_at: null,
            recent_submissions: [],
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as never);
    mockUpdate.mockReturnValue({
      mutateAsync: update,
      isPending: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);

    fireEvent.change(screen.getByLabelText("Google Form label"), {
      target: { value: "Ticket Email" },
    });
    fireEvent.change(screen.getByLabelText("Eventgate field"), {
      target: { value: "email" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add/update mapping" }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        field_mapping: { "Ticket Email": "email" },
      }),
    );
  });

  it("warns and prevents enabling while required fields are not mapped", () => {
    const update = vi.fn();
    mockBridges.mockReturnValue({
      data: {
        count: 1,
        results: [
          {
            id: "b1",
            name: "Click Cam Form",
            enabled: false,
            field_mapping: { "Full Name": "name" },
            duplicate_policy: "upsert_by_email",
            webhook_url: "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
            last_seen_at: null,
            recent_submissions: [],
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as never);
    mockUpdate.mockReturnValue({
      mutateAsync: update,
      isPending: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);

    expect(screen.getByText(/Map required fields before enabling: Email/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Enabled" })).toBeDisabled();
    expect(update).not.toHaveBeenCalled();
  });

  it("prevents enabling while event fields have not loaded", () => {
    const update = vi.fn();
    mockFields.mockReturnValue({
      isLoading: true,
    } as never);
    mockBridges.mockReturnValue({
      data: {
        count: 1,
        results: [
          {
            id: "b1",
            name: "Click Cam Form",
            enabled: false,
            field_mapping: {},
            duplicate_policy: "upsert_by_email",
            webhook_url: "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
            last_seen_at: null,
            recent_submissions: [],
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as never);
    mockUpdate.mockReturnValue({
      mutateAsync: update,
      isPending: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);

    const checkbox = screen.getByRole("checkbox", { name: "Enabled" });
    expect(checkbox).toBeDisabled();
    fireEvent.click(checkbox);
    expect(update).not.toHaveBeenCalled();
  });

  it("allows disabling an enabled bridge even when required mappings are missing", async () => {
    const update = vi.fn().mockResolvedValue({});
    mockBridges.mockReturnValue({
      data: {
        count: 1,
        results: [
          {
            id: "b1",
            name: "Click Cam Form",
            enabled: true,
            field_mapping: { "Full Name": "name" },
            duplicate_policy: "upsert_by_email",
            webhook_url: "https://api.test/api/v1/integrations/google-forms/b1/submissions/",
            last_seen_at: null,
            recent_submissions: [],
            created_at: "2026-06-07T00:00:00Z",
            updated_at: "2026-06-07T00:00:00Z",
          },
        ],
      },
      isLoading: false,
    } as never);
    mockUpdate.mockReturnValue({
      mutateAsync: update,
      isPending: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);

    const checkbox = screen.getByRole("checkbox", { name: "Enabled" });
    expect(checkbox).not.toBeDisabled();
    fireEvent.click(checkbox);

    await waitFor(() => expect(update).toHaveBeenCalledWith({ enabled: false }));
  });

  it("shows create errors", async () => {
    const create = vi.fn().mockRejectedValue(new Error("Bridge limit reached."));
    mockBridges.mockReturnValue({
      data: { count: 0, results: [] },
      isLoading: false,
    } as never);
    mockCreate.mockReturnValue({
      mutateAsync: create,
      isPending: false,
    } as never);

    render(<GoogleFormBridgeCard orgSlug="acme" eventSlug="launch" />);
    fireEvent.click(screen.getByRole("button", { name: "Create bridge" }));

    expect(await screen.findByText("Bridge limit reached.")).toBeInTheDocument();
  });
});
