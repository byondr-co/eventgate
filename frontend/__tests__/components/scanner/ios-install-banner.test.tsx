import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IOSInstallBanner } from "@/components/scanner/ios-install-banner";

function mockMatchMedia(displayMode: "browser" | "standalone") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (q: string) => ({
      matches: q.includes(`display-mode: ${displayMode}`),
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

function mockUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });
}

describe("IOSInstallBanner", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders when iOS UA + display-mode browser", () => {
    mockUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    mockMatchMedia("browser");
    render(<IOSInstallBanner />);
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });

  it("does not render in standalone mode", () => {
    mockUA("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");
    mockMatchMedia("standalone");
    render(<IOSInstallBanner />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });

  it("does not render on Android Chrome", () => {
    mockUA("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0");
    mockMatchMedia("browser");
    render(<IOSInstallBanner />);
    expect(screen.queryByText(/Add to Home Screen/i)).not.toBeInTheDocument();
  });
});
