import { describe, expect, it, vi } from "vitest";

const { subscribeToEarlyAccess } = vi.hoisted(() => ({
  subscribeToEarlyAccess: vi.fn(),
}));

vi.mock("./db", () => ({
  subscribeToEarlyAccess,
}));

import { appRouter, earlyAccessInput } from "./routers";

describe("early-access input", () => {
  it("accepts and trims a valid subscriber email", () => {
    expect(earlyAccessInput.parse({ email: "  hello@example.com " })).toEqual({
      email: "hello@example.com",
    });
  });

  it("rejects an invalid email address", () => {
    expect(() => earlyAccessInput.parse({ email: "not-an-email" })).toThrow();
  });

  it("submits a normalized email address to the persistence layer", async () => {
    subscribeToEarlyAccess.mockResolvedValue({ email: "hello@example.com" });
    const caller = appRouter.createCaller({} as never);

    await expect(caller.earlyAccess.subscribe({ email: " Hello@Example.com " })).resolves.toEqual({
      success: true,
    });
    expect(subscribeToEarlyAccess).toHaveBeenCalledWith("Hello@Example.com");
  });
});
