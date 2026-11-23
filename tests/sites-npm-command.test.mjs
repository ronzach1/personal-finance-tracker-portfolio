import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { npmInstallCommand } from "../scripts/sites-runtime.mjs";

async function withFakeNode(testCase) {
  const root = await mkdtemp(path.join(tmpdir(), "finance-npm-cli-"));
  try {
    const nodeExecutable = path.join(root, "node.exe");
    const fallback = path.join(root, "node_modules", "npm", "bin", "npm-cli.js");
    await mkdir(path.dirname(fallback), { recursive: true });
    await writeFile(fallback, "/* fake npm CLI for command-resolution tests */");
    await testCase({ root, nodeExecutable, fallback });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("Windows launches npm via Node and prefers the active npm JS entrypoint", async () => {
  await withFakeNode(async ({ root, nodeExecutable }) => {
    const activeCli = path.join(root, "npm", "npm-cli.js");
    await mkdir(path.dirname(activeCli), { recursive: true });
    await writeFile(activeCli, "/* active npm */");
    assert.deepEqual(
      await npmInstallCommand({ platform: "win32", nodeExecutable, npmExecPath: activeCli }),
      { command: nodeExecutable, prefixArgs: [activeCli] },
    );
  });
});

test("Windows ignores npm.cmd and falls back to the Node-adjacent JS CLI", async () => {
  await withFakeNode(async ({ root, nodeExecutable, fallback }) => {
    const cmd = path.join(root, "npm.cmd");
    await writeFile(cmd, "@echo off");
    assert.deepEqual(
      await npmInstallCommand({ platform: "win32", nodeExecutable, npmExecPath: cmd }),
      { command: nodeExecutable, prefixArgs: [fallback] },
    );
    assert.deepEqual(
      await npmInstallCommand({ platform: "win32", nodeExecutable, npmExecPath: null }),
      { command: nodeExecutable, prefixArgs: [fallback] },
    );
  });
});

test("Windows fails with an actionable message if the npm JS CLI is missing", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "finance-npm-missing-"));
  try {
    await assert.rejects(
      npmInstallCommand({ platform: "win32", nodeExecutable: path.join(root, "node.exe"), npmExecPath: null }),
      /Cannot locate npm's JavaScript CLI on Windows/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Non-Windows npm execution remains unchanged", async () => {
  assert.deepEqual(
    await npmInstallCommand({ platform: "linux", nodeExecutable: "/fake/node", npmExecPath: null }),
    { command: "npm", prefixArgs: [] },
  );
});

test("Sites installation uses the resolved command without spawning npm.cmd directly", async () => {
  const source = await readFile(new URL("../scripts/install-ci.mjs", import.meta.url), "utf8");
  assert.match(source, /await npmInstallCommand\(\)/);
  assert.match(source, /await run\(npmCommand, \[\.\.\.prefixArgs, "ci"/);
  assert.doesNotMatch(source, /run\([^\n]*"npm\.cmd"/);
});
