import assert from "node:assert/strict";
import test from "node:test";
import { decodeDockerLogs } from "./docker-controller.js";

test("decodeDockerLogs decodes multiplexed Docker frames", () => {
  const content = Buffer.from("hello\n");
  const header = Buffer.alloc(8);
  header[0] = 1;
  header.writeUInt32BE(content.length, 4);
  assert.equal(decodeDockerLogs(Buffer.concat([header, content])), "hello\n");
});

test("decodeDockerLogs accepts plain tty output", () => {
  assert.equal(decodeDockerLogs(Buffer.from("plain\n")), "plain\n");
});

