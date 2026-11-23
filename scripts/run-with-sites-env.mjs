import { exitOnFailure, packageBin, run, sitesEnv } from "./sites-runtime.mjs";

exitOnFailure();

const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Usage: node scripts/run-with-sites-env.mjs <local-command> [args...]");
await run(process.execPath, [await packageBin(command), ...args], { env: await sitesEnv() });
