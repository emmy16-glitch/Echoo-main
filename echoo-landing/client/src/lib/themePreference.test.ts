import { describe, expect, it } from "vitest";
import { nextTheme, readThemePreference, readThemePreview } from "./themePreference";

describe("theme preference", () => {
  it("accepts only the supported stored theme values", () => {
    expect(readThemePreference("dark")).toBe("dark");
    expect(readThemePreference("light")).toBe("light");
    expect(readThemePreference("system")).toBe("light");
    expect(readThemePreference(null)).toBe("light");
  });

  it("alternates between the two Echoo themes", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("accepts only explicit theme preview values", () => {
    expect(readThemePreview("dark")).toBe("dark");
    expect(readThemePreview("light")).toBe("light");
    expect(readThemePreview("system")).toBeNull();
    expect(readThemePreview(null)).toBeNull();
  });
});
