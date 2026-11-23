import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const buildType = process.argv[2]; // 'portable' or 'setup'
const REPO = 'AchiraStudio/ChiraLauncher';

if (!['portable', 'setup'].includes(buildType)) {
    console.error('Usage: node scripts/distribute.js [portable|setup]');
    process.exit(1);
}

const distDir = path.join(rootDir, 'dist_release');
const targetDir = path.join(distDir, buildType === 'portable' ? 'Portable' : 'Setup');

// Ensure clean dist directory
if (!fs.existsSync(distDir)) fs.mkdirSync(distDir);
if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true });
fs.mkdirSync(targetDir, { recursive: true });

console.log(`\x1b[36m[Distributor] Starting ${buildType} distribution...\x1b[0m`);

const version = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8')).version;

/** Release notes for `version` from CHANGELOG.md (the section under its `## x.y.z` heading). */
function readChangelog(v) {
    const file = path.join(rootDir, 'CHANGELOG.md');
    if (!fs.existsSync(file)) return `ChiraLauncher ${v}`;
    const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex((l) => new RegExp(`^##\\s*\\[?v?${v.replace(/\./g, '\\.')}\\]?(\\s|$)`).test(l));
    if (start < 0) return `ChiraLauncher ${v}`;
    let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
    if (end < 0) end = lines.length;
    return lines.slice(start + 1, end).join('\n').trim() || `ChiraLauncher ${v}`;
}

/** Signing is enabled when the Tauri signing key is available to this build. */
const signingKeyAvailable = Boolean(process.env.TAURI_SIGNING_PRIVATE_KEY || process.env.TAURI_SIGNING_PRIVATE_KEY_PATH);

try {
    if (buildType === 'setup') {
        // Run setup build (NSIS)
        console.log('\x1b[33m[1/2] Building NSIS Installer...\x1b[0m');
        // Updater artifacts (.sig) are only requested when a signing key is present, so plain
        // builds keep working for people who haven't set up updates yet.
        let buildCmd = 'npx tauri build --bundles nsis';
        if (signingKeyAvailable) {
            const cfg = path.join(distDir, '.updater-build-config.json');
            fs.writeFileSync(cfg, JSON.stringify({ bundle: { createUpdaterArtifacts: true } }));
            buildCmd += ` --config "${cfg}"`;
        } else {
            console.log('\x1b[33m[Distributor] No TAURI_SIGNING_PRIVATE_KEY(_PATH) set: building WITHOUT update signature. Run `npm run updater:keygen` once to enable in-app updates.\x1b[0m');
        }
        execSync(buildCmd, { stdio: 'inherit', cwd: rootDir });

        // Locate installer
        const bundleDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
        const files = fs.readdirSync(bundleDir);
        const installer = files.find(f => f.endsWith('.exe') && !f.includes('debug'));

        if (installer) {
            fs.copyFileSync(path.join(bundleDir, installer), path.join(targetDir, installer));
            console.log(`\x1b[32m[2/2] Success! Setup moved to dist_release/Setup/${installer}\x1b[0m`);

            const sigFile = path.join(bundleDir, `${installer}.sig`);
            if (signingKeyAvailable && fs.existsSync(sigFile)) {
                fs.copyFileSync(sigFile, path.join(targetDir, `${installer}.sig`));
                // The manifest the in-app updater downloads from the latest GitHub release.
                const manifest = {
                    version,
                    notes: readChangelog(version),
                    pub_date: new Date().toISOString(),
                    platforms: {
                        'windows-x86_64': {
                            signature: fs.readFileSync(sigFile, 'utf8').trim(),
                            url: `https://github.com/${REPO}/releases/download/v${version}/${installer}`,
                        },
                    },
                };
                fs.writeFileSync(path.join(targetDir, 'latest.json'), JSON.stringify(manifest, null, 2));
                console.log(`\x1b[32m[Updater] Wrote dist_release/Setup/latest.json for v${version}\x1b[0m`);
                console.log(`Upload ${installer} and latest.json to the GitHub release tagged v${version}.`);
            } else if (signingKeyAvailable) {
                console.warn('\x1b[33m[Updater] Signing key was set but no .sig was produced; latest.json not written.\x1b[0m');
            }
        }
    } else {
        // Run portable build (no-bundle)
        console.log('\x1b[33m[1/2] Building Portable Executable...\x1b[0m');
        execSync('npx tauri build --no-bundle', { stdio: 'inherit', cwd: rootDir });

        const releaseDir = path.join(rootDir, 'src-tauri', 'target', 'release');
        const exeName = 'chiralauncher.exe';
        const sourceExe = path.join(releaseDir, exeName);

        if (fs.existsSync(sourceExe)) {
            // Copy Exe
            fs.copyFileSync(sourceExe, path.join(targetDir, exeName));

            // Copy necessary sidecars/resources
            // Note: In Tauri 2.0, resources are often embedded or in a _root_ folder
            // For portable, we typically want the scanner directory
            const scannerSource = path.join(rootDir, 'src-tauri', 'resources', 'scanner.py');
            if (fs.existsSync(scannerSource)) {
                const scannerDestDir = path.join(targetDir, 'scanner');
                if (!fs.existsSync(scannerDestDir)) fs.mkdirSync(scannerDestDir);
                fs.copyFileSync(scannerSource, path.join(scannerDestDir, 'scanner.py'));
            }

            console.log(`\x1b[32m[2/2] Success! Portable files moved to dist_release/Portable/\x1b[0m`);
        }
    }
} catch (err) {
    console.error('\x1b[31m[Error] Build or distribution failed:\x1b[0m', err.message);
    process.exit(1);
}
