// Run with the intended deployment variables in the environment.
// Output contains only the VAPID check and the public-key fingerprint.
import { tsImport } from "tsx/esm/api";

const { pushKeys, vapidFingerprint } = await tsImport("../lib/push/config.ts", import.meta.url);

const coherent = Boolean(pushKeys());
console.log(`VAPID: ${coherent ? "coherent" : "not coherent"} · public ${vapidFingerprint(process.env) ?? "-"}`);
process.exitCode = coherent ? 0 : 1;
