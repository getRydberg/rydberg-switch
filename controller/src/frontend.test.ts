import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { registerFrontendRoutes } from "./frontend.js";

test("frontend fallback serves root and client routes without swallowing unknown API routes", async () => {
  const staticPath = await mkdtemp(join(tmpdir(), "rydberg-switch-frontend-"));
  await writeFile(join(staticPath, "index.html"), "<!doctype html><title>Switch test shell</title>");

  const app = express();
  app.get("/api/health", (_request, response) => response.json({ ok: true }));
  registerFrontendRoutes(app, staticPath);

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolveReady) => server.once("listening", resolveReady));
  const { port } = server.address() as AddressInfo;

  try {
    const root = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Switch test shell/);

    const clientRoute = await fetch(`http://127.0.0.1:${port}/games/minecraft`);
    assert.equal(clientRoute.status, 200);
    assert.match(await clientRoute.text(), /Switch test shell/);

    const health = await fetch(`http://127.0.0.1:${port}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const unknownApi = await fetch(`http://127.0.0.1:${port}/api/unknown`);
    assert.equal(unknownApi.status, 404);
    assert.match(unknownApi.headers.get("content-type") ?? "", /application\/json/);
    assert.deepEqual(await unknownApi.json(), { error: "API route not found" });
  } finally {
    await new Promise<void>((resolveClosed, reject) => {
      server.close((error) => error ? reject(error) : resolveClosed());
    });
    await rm(staticPath, { recursive: true, force: true });
  }
});

