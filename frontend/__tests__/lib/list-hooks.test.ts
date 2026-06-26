import { describe, expect, it } from "vitest";
import type { EventListFilters } from "@/lib/events";
import type { MemberListFilters } from "@/lib/orgs";
import type { GuestFilters } from "@/lib/guests";

describe("list filter types", () => {
  it("event/member/guest filters carry pagination + ordering", () => {
    const e: EventListFilters = { search: "x", ordering: "name", page: 2, pageSize: 50 };
    const m: MemberListFilters = { ordering: "user__email", page: 1, pageSize: 25 };
    const g: GuestFilters = { ordering: "full_name" };
    expect([e.ordering, m.ordering, g.ordering]).toEqual(["name", "user__email", "full_name"]);
  });
});
