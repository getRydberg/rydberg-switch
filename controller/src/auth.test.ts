import assert from "node:assert/strict";
import test from "node:test";
import { resolveValue } from "./config.js";

test("resolveValue substitutes complete environment placeholders", () => {
  assert.equal(resolveValue("${GAME_PASSWORD}", { GAME_PASSWORD: "secret" }), "secret");
  assert.equal(resolveValue("prefix-${GAME_PASSWORD}", { GAME_PASSWORD: "secret" }), "prefix-${GAME_PASSWORD}");
  assert.equal(resolveValue("${MISSING}", {}), "");
});

