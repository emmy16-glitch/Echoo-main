import { describe, expect, it } from "vitest";
import { buildSocialShareUrl } from "./socialShare";

describe("buildSocialShareUrl", () => {
  const pageUrl = "https://echoo.example/release?version=1.0.5";
  const message = "Discover Echoo Studio";

  it("builds an X sharing URL with separately encoded text and page URL", () => {
    expect(buildSocialShareUrl("x", pageUrl, message)).toBe(
      "https://twitter.com/intent/tweet?text=Discover%20Echoo%20Studio&url=https%3A%2F%2Fechoo.example%2Frelease%3Fversion%3D1.0.5",
    );
  });

  it("builds a LinkedIn sharing URL with the exact release URL", () => {
    expect(buildSocialShareUrl("linkedin", pageUrl, message)).toBe(
      "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fechoo.example%2Frelease%3Fversion%3D1.0.5",
    );
  });

  it("builds a WhatsApp sharing URL with a combined message and release URL", () => {
    expect(buildSocialShareUrl("whatsapp", pageUrl, message)).toBe(
      "https://wa.me/?text=Discover%20Echoo%20Studio%20https%3A%2F%2Fechoo.example%2Frelease%3Fversion%3D1.0.5",
    );
  });
});
