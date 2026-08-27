import { describe, expect, it } from "vitest";
import {
  CURATED_HELP_SUGGESTIONS,
  getCuratedHelpWelcome,
  resolveCuratedHelpResponse,
} from "./curatedHelp";

describe("curated help responses", () => {
  it("provides exact public release guidance without using an external service", () => {
    const result = resolveCuratedHelpResponse("Where is the Linux .deb download?", "website");

    expect(result.topic).toBe("Downloads");
    expect(result.answer).toContain("Ubuntu/Debian .deb");
    expect(result.answer).toContain("not a generative AI service");
  });

  it("gives listener playback guidance without claiming access to playback state", () => {
    const result = resolveCuratedHelpResponse("I cannot hear any audio. How do I pause?", "listener");

    expect(result.topic).toBe("Playback");
    expect(result.answer).toContain("persistent player");
    expect(result.answer).toContain("does not access account, room, or message data");
  });

  it("gives creators a privacy-aware broadcast checklist", () => {
    const result = resolveCuratedHelpResponse("Give me a checklist before I go live", "creator");

    expect(result.topic).toBe("Broadcast checklist");
    expect(result.answer).toContain("microphone input");
    expect(result.answer).toContain("does not access account, room, or message data");
  });

  it("returns a deterministic safe fallback for unsupported questions", () => {
    const first = resolveCuratedHelpResponse("What is the weather on Mars?", "creator");
    const second = resolveCuratedHelpResponse("What is the weather on Mars?", "creator");

    expect(first).toEqual(second);
    expect(first.answer).toContain("cannot access your private room, chat, or account data");
  });

  it("exposes a local welcome and bounded suggested prompts for every context", () => {
    expect(getCuratedHelpWelcome("website").answer).toContain("not a generative AI service");
    expect(CURATED_HELP_SUGGESTIONS.website).toHaveLength(3);
    expect(CURATED_HELP_SUGGESTIONS.listener).toHaveLength(3);
    expect(CURATED_HELP_SUGGESTIONS.creator).toHaveLength(3);
  });
});
