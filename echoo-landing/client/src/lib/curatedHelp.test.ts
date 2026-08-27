import { describe, expect, it } from "vitest";
import {
  CURATED_HELP_SUGGESTIONS,
  getCuratedHelpWelcome,
  HUMAN_SUPPORT_EMAIL_DRAFT,
  resolveCuratedHelpResponse,
} from "./curatedHelp";

describe("curated help responses", () => {
  it("provides exact public release guidance without using an external service", () => {
    const result = resolveCuratedHelpResponse("Where is the Linux .deb download?", "website");

    expect(result.topic).toBe("Downloads");
    expect(result.answer).toContain("Ubuntu/Debian .deb");
    expect(result.answer).toContain("not a generative AI service");
  });

  it("provides a safer public installer-warning troubleshooting response", () => {
    const result = resolveCuratedHelpResponse("Why does macOS Gatekeeper block the installer?", "website");

    expect(result.topic).toBe("Installer warnings");
    expect(result.answer).toContain("official Release page");
    expect(result.answer).toContain("do not enter a password");
  });

  it("gives listener playback guidance without claiming access to playback state", () => {
    const result = resolveCuratedHelpResponse("I cannot hear any audio. How do I pause?", "listener");

    expect(result.topic).toBe("Playback");
    expect(result.answer).toContain("persistent player");
    expect(result.answer).toContain("does not access account, room, or message data");
  });

  it("gives listener connection troubleshooting without claiming a room is live", () => {
    const result = resolveCuratedHelpResponse("My room keeps reconnecting and loading", "listener");

    expect(result.topic).toBe("Connection troubleshooting");
    expect(result.answer).toContain("cannot inspect the room’s live connection state");
  });

  it("gives creators a privacy-aware broadcast checklist", () => {
    const result = resolveCuratedHelpResponse("Give me a checklist before I go live", "creator");

    expect(result.topic).toBe("Broadcast checklist");
    expect(result.answer).toContain("microphone input");
    expect(result.answer).toContain("does not access account, room, or message data");
  });

  it("gives creators a safe microphone-permission troubleshooting response", () => {
    const result = resolveCuratedHelpResponse("My browser permission for microphone is blocked", "creator");

    expect(result.topic).toBe("Microphone permissions");
    expect(result.answer).toContain("site-permission controls");
    expect(result.answer).toContain("cannot see device permissions");
  });

  it("returns a deterministic safe fallback for unsupported questions", () => {
    const first = resolveCuratedHelpResponse("What is the weather on Mars?", "creator");
    const second = resolveCuratedHelpResponse("What is the weather on Mars?", "creator");

    expect(first).toEqual(second);
    expect(first.answer).toContain("cannot access your private room, chat, or account data");
  });

  it("uses a recipient-free human-support draft with no prefilled user message", () => {
    expect(HUMAN_SUPPORT_EMAIL_DRAFT).toBe("mailto:?subject=Echoo%20human%20support%20request");
    expect(HUMAN_SUPPORT_EMAIL_DRAFT).not.toContain("body=");
  });

  it("exposes local welcome copy and bounded suggested prompts for every context", () => {
    expect(getCuratedHelpWelcome("website").answer).toContain("not a generative AI service");
    expect(CURATED_HELP_SUGGESTIONS.website).toHaveLength(4);
    expect(CURATED_HELP_SUGGESTIONS.listener).toHaveLength(4);
    expect(CURATED_HELP_SUGGESTIONS.creator).toHaveLength(4);
  });
});
