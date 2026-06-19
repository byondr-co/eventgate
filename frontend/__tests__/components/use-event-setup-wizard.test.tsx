import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useEventSetupWizard } from "@/components/wizard/use-event-setup-wizard";

it("walks steps and defaults to native", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  expect(result.current.stepId).toBe("basics");
  expect(result.current.registrationKind).toBe("native");
  act(() => result.current.goNext());
  expect(result.current.stepId).toBe("registration");
});

it("goBack does not go before first step", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  expect(result.current.stepId).toBe("basics");
  act(() => result.current.goBack());
  expect(result.current.stepId).toBe("basics");
});

it("goTo jumps to a specific step", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  act(() => result.current.goTo("review"));
  expect(result.current.stepId).toBe("review");
});

it("goNext does not go past last step", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  act(() => result.current.goTo("live"));
  act(() => result.current.goNext());
  expect(result.current.stepId).toBe("live");
});

it("setRegistrationKind updates registrationKind", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  expect(result.current.registrationKind).toBe("native");
  act(() => result.current.setRegistrationKind("google"));
  expect(result.current.registrationKind).toBe("google");
});

it("setEventSlug updates eventSlug", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  expect(result.current.eventSlug).toBeNull();
  act(() => result.current.setEventSlug("my-event"));
  expect(result.current.eventSlug).toBe("my-event");
});

it("steps contains all 5 step ids", () => {
  const { result } = renderHook(() => useEventSetupWizard("acme"));
  const ids = result.current.steps.map((s) => s.id);
  expect(ids).toEqual(["basics", "registration", "configure", "review", "live"]);
});
