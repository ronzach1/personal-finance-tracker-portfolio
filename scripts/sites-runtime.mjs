import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const runtimeRoot = process.env.SITES_RUNTIME_ROOT
  ? path.resolve(process.env.SITES_RUNTIME_ROOT)
  : path.join(projectRoot, ".sites-runtime");

export async function sitesEnv(baseEnv = process.env) {
  const home = path.join(runtimeRoot, "home");
  const cache = path.join(runtimeRoot, "npm-cache");
  await Promise.all([home, cache, path.join(runtimeRoot, "xdg-config"), path.join(runtimeRoot, "tmp"), path.join(runtimeRoot, "wrangler", "logs")].map((directory) => mkdir(directory, { recursive: true })));
  const env = { ...baseEnv };
  delete env.NPM_CONFIG_CACHE;
  delete env.npm_config_cache;
  Object.assign(env, {
    SITES_ENV_READY: "1",
    SITES_PROJECT_ROOT: projectRoot,
    HOME: home,
    XDG_CONFIG_HOME: path.join(runtimeRoot, "xdg-config"),
    TMPDIR: path.join(runtimeRoot, "tmp"),
    TMP: path.join(runtimeRoot, "tmp"),
    TEMP: path.join(runtimeRoot, "tmp"),
    WRANGLER_WRITE_LOGS: "false",
    WRANGLER_LOG_PATH: path.join(runtimeRoot, "wrangler", "logs"),
    MINIFLARE_REGISTRY_PATH: path.join(runtimeRoot, "wrangler", "registry"),
    npm_config_cache: cache,
    npm_config_audit: "false",
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
  });
  for (const key of ["npm_config_proxy", "npm_config_http_proxy", "npm_config_https_proxy", "NPM_CONFIG_PROXY", "NPM_CONFIG_HTTP_PROXY", "NPM_CONFIG_HTTPS_PROXY"]) delete env[key];
  return env;
}

export async function verifyWritableSitesEnv(env) {
  const probes = [path.join(env.HOME, ".sites-write-test"), path.join(env.npm_config_cache, ".sites-write-test")];
  await Promise.all(probes.map((probe) => writeFile(probe, "")));
  await Promise.all(probes.map((probe) => rm(probe, { force: true })));
}

export function exitOnFailure() {
  const exit = (error) => {
    console.error(error?.stack ?? error);
    process.exit(error?.exitCode ?? 1);
  };
  process.once("uncaughtException", exit);
  process.once("unhandledRejection", exit);
}

export async function packageBin(command) {
  const packageName = command;
  const packageDirectory = path.join(projectRoot, "node_modules", packageName);
  const manifest = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[command];
  if (!bin) throw new Error(`${packageName} does not declare a ${command} executable.`);
  return path.resolve(packageDirectory, bin);
}

export function duration(value, fallback) {
  const source = value ?? fallback;
  const match = /^(\d+)(ms|s|m)?$/.exec(source);
  if (!match) throw new Error(`Invalid timeout value: ${source}`);
  return Number(match[1]) * ({ ms: 1, s: 1_000, m: 60_000 }[match[2] ?? "s"]);
}

// Windows .cmd wrappers are not executable by spawn() without a shell.
// Launch npm's JavaScript CLI using Node instead; keep the Unix path unchanged.
export async function npmInstallCommand({
  platform = process.platform,
  nodeExecutable = process.execPath,
  npmExecPath = process.env.npm_execpath,
} = {}) {
  if (platform !== "win32") return { command: "npm", prefixArgs: [] };

  const candidates = [
    npmExecPath,
    path.join(path.dirname(nodeExecutable), "node_modules", "npm", "bin", "npm-cli.js"),
  ].filter((candidate) => typeof candidate === "string" && [".js", ".cjs", ".mjs"].some((ext) => candidate.toLowerCase().endsWith(ext)));

  for (const candidate of candidates) {
    try {
      await access(candidate);
      return { command: nodeExecutable, prefixArgs: [candidate] };
    } catch {
      // Try the next conventional npm CLI location.
    }
  }
  throw new Error("Cannot locate npm's JavaScript CLI on Windows. Run via npm run install:ci or install npm alongside Node.js.");
}

export async function run(command, args, { env = process.env, timeout, killAfter = 10_000 } = {}) {
  const child = spawn(command, args, {
    cwd: projectRoot,
    env,
    stdio: "inherit",
  });
  let timer;
  let forceKillTimer;
  let timedOut = false;
  const result = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
    if (timeout) timer = setTimeout(() => {
      timedOut = true;
      console.error(`Command exceeded its ${Math.round(timeout / 1000)} second timeout.`);
      if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T"], { stdio: "ignore" });
      else child.kill("SIGTERM");
      forceKillTimer = setTimeout(() => {
        if (process.platform === "win32") spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        else child.kill("SIGKILL");
      }, killAfter);
    }, timeout);
  });
  clearTimeout(timer);
  clearTimeout(forceKillTimer);
  if (result.code !== 0) {
    const error = new Error(`${command} failed${result.signal ? ` (${result.signal})` : ""}.`);
    error.exitCode = timedOut ? 124 : (result.code ?? 1);
    throw error;
  }
}
