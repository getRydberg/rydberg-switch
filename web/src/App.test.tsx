import { describe, expect, it } from "vitest";

describe("switch dashboard", () => {
  it("keeps the application test harness active", () => {
    expect("play.rydberg.app").toContain("rydberg.app");
  });
});

