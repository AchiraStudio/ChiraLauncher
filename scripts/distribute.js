import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const buildType = process.argv[2]; // 'portable' or 'setup'

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

try {
    if (buildType === 'setup') {
        // Run setup build (NSIS)
        console.log('\x1b[33m[1/2] Building NSIS Installer...\x1b[0m');
        execSync('npx tauri build --bundles nsis', { stdio: 'inherit', cwd: rootDir });

        // Locate installer
        const bundleDir = path.join(rootDir, 'src-tauri', 'target', 'release', 'bundle', 'nsis');
        const files = fs.readdirSync(bundleDir);
        const installer = files.find(f => f.endsWith('.exe') && !f.includes('debug'));

        if (installer) {
            fs.copyFileSync(path.join(bundleDir, installer), path.join(targetDir, installer));
            console.log(`\x1b[32m[2/2] Success! Setup moved to dist_release/Setup/${installer}\x1b[0m`);
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
