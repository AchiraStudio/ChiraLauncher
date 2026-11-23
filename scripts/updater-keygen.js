// One-time setup for in-app updates.
//
//   npm run updater:keygen
//
// Generates the minisign key pair the updater uses to verify installers, then writes the
// PUBLIC key into src-tauri/tauri.conf.json (plugins.updater.pubkey). The PRIVATE key is
// stored outside the repository and must never be committed or shared.
//
// Options: --out <path>   where to write the private key (default ~/.tauri/chiralauncher-updater.key)
//          --force        overwrite an existing key (old releases can then no longer update!)
//          --ci           don't prompt for a password (empty password)
//          --no-write     don't touch tauri.conf.json (print the public key only)
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const confPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => (args.indexOf(f) >= 0 ? args[args.indexOf(f) + 1] : d);

const keyPath = path.resolve(val("--out", path.join(os.homedir(), ".tauri", "chiralauncher-updater.key")));
const pubPath = `${keyPath}.pub`;

if (fs.existsSync(keyPath) && !has("--force")) {
    console.error(`\x1b[31mA key already exists at ${keyPath}\x1b[0m`);
    console.error("Re-using it is fine: its public key is " + (fs.existsSync(pubPath) ? "in " + pubPath : "missing") + ".");
    console.error("To replace it (releases signed with the old key will NOT be able to update to new ones), re-run with --force.");
    process.exit(1);
}

fs.mkdirSync(path.dirname(keyPath), { recursive: true });
console.log("\x1b[36m[Updater] Generating signing key pair...\x1b[0m");
const gen = spawnSync("npx", ["tauri", "signer", "generate", "-w", keyPath, ...(has("--force") ? ["-f"] : []), ...(has("--ci") ? ["--ci"] : [])], {
    stdio: "inherit",
    cwd: rootDir,
    shell: process.platform === "win32",
});
if (gen.status !== 0 || !fs.existsSync(pubPath)) {
    console.error("\x1b[31m[Updater] Key generation failed.\x1b[0m");
    process.exit(gen.status || 1);
}

const pubkey = fs.readFileSync(pubPath, "utf8").trim();
if (has("--no-write")) {
    console.log("\nPublic key:\n" + pubkey);
} else {
    const conf = JSON.parse(fs.readFileSync(confPath, "utf8"));
    conf.plugins ??= {};
    conf.plugins.updater ??= {};
    conf.plugins.updater.pubkey = pubkey;
    fs.writeFileSync(confPath, JSON.stringify(conf, null, 2) + "\n");
    console.log(`\x1b[32m[Updater] Public key written to src-tauri/tauri.conf.json\x1b[0m`);
}

console.log(`
\x1b[1mNext steps\x1b[0m
  1. Keep the private key safe (back it up!):  ${keyPath}
  2. Before building a release, expose it to the build:
       PowerShell:  $env:TAURI_SIGNING_PRIVATE_KEY_PATH = "${keyPath}"
                    $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<the password you chose>"
  3. Build + sign:   npm run build:setup      (also writes dist_release/Setup/latest.json)
  4. Create a GitHub release tagged v<version> and upload BOTH the *-setup.exe and latest.json.
  5. Commit the updated src-tauri/tauri.conf.json (it only contains the PUBLIC key).
`);
