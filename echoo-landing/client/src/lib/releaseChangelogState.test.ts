import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHANGELOG_ITEM,
  resolveChangelogSelection,
} from "./releaseChangelogState";

describe("release changelog accordion state", () => {
  const availableItems = ["listener-controls", "creator-broadcast"] as const;

  it("provides a useful initial detailed changelog entry", () => {
    expect(DEFAULT_CHANGELOG_ITEM).toBe("listener-controls");
  });

  it("keeps valid selections and allows the accordion to collapse", () => {
    expect(resolveChangelogSelection("creator-broadcast", availableItems)).toBe(
      "creator-broadcast"
    );
    expect(resolveChangelogSelection("", availableItems)).toBe("");
  });

  it("does not retain an invalid accordion entry", () => {
    expect(resolveChangelogSelection("unknown", availableItems)).toBe("");
  });
});
