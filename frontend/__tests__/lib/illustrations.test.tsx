import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import * as illustrations from "@/lib/illustrations";

const NAMES = [
  "DeviceCreate",
  "CopyCode",
  "OpenEnrollPage",
  "EnterPin",
  "InstallPWA",
  "ScanGuest",
  "WalkinInfo",
  "Registered",
  "NoDevices",
  "NoGuests",
  "NoEvents",
  "NoLinks",
] as const;

describe("illustrations", () => {
  it.each(NAMES)("%s renders an svg using currentColor and no hardcoded fill", (name) => {
    const Comp = (illustrations as Record<string, React.FC<{ className?: string }>>)[name];
    expect(Comp).toBeTypeOf("function");
    const { container } = render(<Comp className="size-10" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toBeTruthy();
    expect(svg.getAttribute("stroke")).toBe("currentColor");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.className.baseVal).toContain("size-10");
    expect(container.innerHTML).not.toMatch(/fill="#/);
  });
});
