import { describe, expect, it } from "vitest";
import { APPLICATION_DELETED_ACTION, APPLICATION_RESTORED_ACTION, isApplicationHidden } from "./visibility";

describe("application visibility", () => {
  it("keeps applications visible when no lifecycle marker exists", () => {
    expect(isApplicationHidden([{ metadata: { action: "opened_apply_url" } }])).toBe(false);
  });

  it("hides an application after the user deletes it", () => {
    expect(isApplicationHidden([{ metadata: { action: APPLICATION_DELETED_ACTION } }])).toBe(true);
  });

  it("restores an application when a newer restore marker exists", () => {
    expect(isApplicationHidden([
      { metadata: { action: APPLICATION_RESTORED_ACTION } },
      { metadata: { action: APPLICATION_DELETED_ACTION } },
    ])).toBe(false);
  });

  it("uses the newest lifecycle marker", () => {
    expect(isApplicationHidden([
      { metadata: { action: APPLICATION_DELETED_ACTION } },
      { metadata: { action: APPLICATION_RESTORED_ACTION } },
    ])).toBe(true);
  });
});
