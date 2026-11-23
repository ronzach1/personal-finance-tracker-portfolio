import { duration, exitOnFailure, packageBin, run, sitesEnv } from "./sites-runtime.mjs";

exitOnFailure();

let vinext;
try { vinext = await packageBin("vinext"); } catch { throw new Error("vinext is unavailable. Run npm ci and wait for it to finish before building."); }
console.log("Running bounded vinext build...");
await run(process.execPath, [vinext, "build"], {
  env: await sitesEnv(),
  timeout: duration(process.env.SITES_BUILD_TIMEOUT, "3m"),
  killAfter: duration(process.env.SITES_BUILD_KILL_AFTER, "10s"),
});
await run(process.execPath, ["scripts/validate-artifact.mjs"], { env: await sitesEnv() });
