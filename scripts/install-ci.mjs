import { access, cp, mkdir, readFile, readdir, readlink, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { duration, exitOnFailure, packageBin, projectRoot, npmInstallCommand, run, runtimeRoot, sitesEnv, verifyWritableSitesEnv } from "./sites-runtime.mjs";

const lockPath = path.join(runtimeRoot, "install.lock");
exitOnFailure();

async function acquireInstallLock() {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockPath);
      await writeFile(path.join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid }));
      return;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const { pid } = JSON.parse(await readFile(path.join(lockPath, "owner.json"), "utf8"));
        process.kill(pid, 0);
        throw new Error(`Another dependency install is already running for ${projectRoot}.`);
      } catch (ownerError) {
        if (ownerError.message.startsWith("Another dependency install")) throw ownerError;
        await rm(lockPath, { recursive: true, force: true });
      }
    }
  }
  throw new Error(`Could not acquire the dependency-install lock for ${projectRoot}.`);
}

async function rejectVisibleNpmCi() {
  if (process.platform !== "linux") return;
  for (const entry of await readdir("/proc")) {
    if (!/^\d+$/.test(entry) || Number(entry) === process.pid || Number(entry) === process.ppid) continue;
    try {
      if (await readlink(`/proc/${entry}/cwd`) !== projectRoot) continue;
      if ((await readFile(`/proc/${entry}/cmdline`, "utf8")).replaceAll("\0", " ").includes("npm ci")) {
        throw new Error(`Another npm ci is visible in ${projectRoot}; refusing to overlap installs.`);
      }
    } catch (error) {
      if (error.message.startsWith("Another npm ci")) throw error;
    }
  }
}

async function npmRegistry(env) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) return "https://registry.npmjs.org/";
  const { spawn } = await import("node:child_process");
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn(process.execPath, [npmCli, "config", "get", "registry"], { cwd: projectRoot, env, stdio: ["ignore", "pipe", "inherit"] });
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve(output.trim()) : reject(new Error("Could not read the npm registry for the locked-tarball preflight.")));
  });
}

await mkdir(runtimeRoot, { recursive: true });
await acquireInstallLock();
try {
  const env = await sitesEnv();
  console.log("[sites] validating writable install environment");
  await verifyWritableSitesEnv(env);
  console.log(`[sites] environment passed: HOME=${env.HOME}, cache=${env.npm_config_cache}`);
  await rejectVisibleNpmCi();
  const lockfile = path.join(projectRoot, "package-lock.json");
  const lockfileSha256 = createHash("sha256").update(await readFile(lockfile)).digest("hex");
  const cache = env.npm_config_cache;
  const seed = process.env.SITES_NPM_CACHE_SEED;
  let preferOffline = false;
  if (seed) {
    try {
      if ((await readFile(path.join(seed, ".sites-lockfile-sha256"), "utf8")).trim() === lockfileSha256) {
        console.log("[sites] restoring image-seeded npm cache");
        await cp(seed, cache, { recursive: true, force: true });
        preferOffline = true;
      }
    } catch { console.log("[sites] image cache seed does not match this lockfile; using the network path"); }
  }
  const lock = JSON.parse(await readFile(lockfile, "utf8"));
  const vinext = lock.packages?.["node_modules/vinext"];
  if (!vinext?.resolved || !vinext.integrity) throw new Error("package-lock.json does not contain a resolved, integrity-pinned vinext tarball");
  if (!preferOffline) {
    console.log("[sites] downloading and verifying the locked vinext tarball");
    const tarballUrl = new URL(vinext.resolved);
    if (tarballUrl.hostname === "registry.npmjs.org") {
      const registry = new URL(await npmRegistry(env));
      tarballUrl.protocol = registry.protocol;
      tarballUrl.host = registry.host;
      tarballUrl.pathname = `${registry.pathname.replace(/\/$/, "")}${tarballUrl.pathname}`;
    }
    const response = await fetch(tarballUrl, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Locked vinext preflight failed: ${response.status} ${response.statusText}`);
    const [algorithm, expected] = vinext.integrity.split("-", 2);
    const actual = createHash(algorithm).update(Buffer.from(await response.arrayBuffer())).digest("base64");
    if (actual !== expected) throw new Error(`vinext tarball integrity mismatch for ${algorithm}`);
  }
  console.log("[sites] running exactly one bounded npm ci");
  const { command: npmCommand, prefixArgs } = await npmInstallCommand();
  await run(npmCommand, [...prefixArgs, "ci", "--cache", cache, ...(preferOffline ? ["--prefer-offline"] : [])], {
    env: { ...env, NPM_CONFIG_MAXSOCKETS: "1", NPM_CONFIG_FETCH_RETRIES: "0", NPM_CONFIG_FETCH_TIMEOUT: "30000" },
    timeout: duration(process.env.SITES_INSTALL_TIMEOUT, "8m"),
    killAfter: duration(process.env.SITES_INSTALL_KILL_AFTER, "15s"),
  });
  await access(await packageBin("vinext"));
  await writeFile(path.join(projectRoot, "node_modules", ".sites-install.json"), `${JSON.stringify({ lockfile_sha256: lockfileSha256, node: process.version, platform: `${process.platform}-${process.arch}` }, null, 2)}\n`);
  console.log("[sites] npm ci passed and vinext is available");
} finally { await rm(lockPath, { recursive: true, force: true }); }
