import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { runtimeRoot, sitesEnv } from "../scripts/sites-runtime.mjs";

const developmentPreviewMeta =
  /<meta(?=[^>]*\bname=["']codex-preview["'])(?=[^>]*\bcontent=["']development["'])[^>]*>/i;

test("renders development preview metadata", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), developmentPreviewMeta);
});

test("sites environment makes the project-local npm cache authoritative", async () => {
  const env = await sitesEnv({
    NPM_CONFIG_CACHE: "C:\\inherited-cache",
    npm_config_cache: "inherited-cache",
  });

  assert.equal(env.NPM_CONFIG_CACHE, undefined);
  assert.equal(env.npm_config_cache, path.join(runtimeRoot, "npm-cache"));
});
