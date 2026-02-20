import { execSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const isWindows = process.platform === 'win32';

// Get repo root from script location (packages/tools/src/install-global-cli.ts -> repo root)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

export function installGlobalCli() {
  // Detect if running directly or via tools dispatcher
  const isDirectInvocation = process.argv[1]?.endsWith('install-global-cli.ts');
  const args = process.argv.slice(isDirectInvocation ? 2 : 3);

  const { values } = parseArgs({
    allowPositionals: false,
    args,
    options: {
      tgz: {
        type: 'string',
        short: 't',
      },
    },
  });

  console.log('Installing global CLI: vp');

  let tempDir: string | undefined;
  let tgzPath: string;

  if (values.tgz) {
    // Use provided tgz file directly
    tgzPath = path.resolve(values.tgz);
    if (!existsSync(tgzPath)) {
      console.error(`Error: tgz file not found: ${tgzPath}`);
      process.exit(1);
    }
    console.log(`Using provided tgz: ${tgzPath}`);
  } else {
    // Create temp directory for pnpm pack output
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'vite-plus-cli-'));

    // Use pnpm pack to create tarball
    // - Auto-resolves catalog: dependencies
    execSync(`pnpm pack --pack-destination "${tempDir}"`, {
      cwd: path.join(repoRoot, 'packages/cli'),
      stdio: 'inherit',
    });

    // Find the generated tgz file (name includes version)
    const tgzFile = readdirSync(tempDir).find((f) => f.endsWith('.tgz'));
    if (!tgzFile) {
      throw new Error('pnpm pack did not create a .tgz file');
    }
    tgzPath = path.join(tempDir, tgzFile);
  }

  try {
    const installDir = path.join(os.homedir(), '.vite-plus');

    // Locate the Rust vp binary (built by cargo or copied by CI)
    const binaryName = isWindows ? 'vp.exe' : 'vp';
    const binaryPath = path.join(repoRoot, 'target', 'release', binaryName);
    if (!existsSync(binaryPath)) {
      console.error(`Error: vp binary not found at ${binaryPath}`);
      console.error('Run "cargo build -p vite_global_cli --release" first.');
      process.exit(1);
    }

    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      VITE_PLUS_LOCAL_TGZ: tgzPath,
      VITE_PLUS_LOCAL_BINARY: binaryPath,
      VITE_PLUS_HOME: installDir,
      VITE_PLUS_VERSION: 'local-dev',
      CI: 'true',
      // Skip vp install in install.sh — we set up node_modules manually below
      // because workspace:* deps resolve to 0.0.0 which don't exist on npm
      VITE_PLUS_SKIP_DEPS_INSTALL: '1',
    };

    // Run platform-specific install script (use absolute paths)
    const installScriptDir = path.join(repoRoot, 'packages/cli');
    if (isWindows) {
      // Use pwsh (PowerShell Core) for better UTF-8 handling
      const ps1Path = path.join(installScriptDir, 'install.ps1');
      execSync(`pwsh -ExecutionPolicy Bypass -File "${ps1Path}"`, {
        stdio: 'inherit',
        env,
      });
    } else {
      const shPath = path.join(installScriptDir, 'install.sh');
      execSync(`bash "${shPath}"`, {
        stdio: 'inherit',
        env,
      });
    }

    // Set up node_modules for local dev by rewriting workspace deps to file: protocol
    // and running pnpm install. Production installs use `vp install` in install.sh directly.
    const versionDir = path.join(installDir, 'local-dev');
    setupLocalDevDeps(versionDir);
  } finally {
    // Cleanup temp dir only if we created it
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

/**
 * Set up dependencies for local dev by symlinking the monorepo's node_modules.
 * This avoids issues with workspace:* protocol deps that don't exist on npm at 0.0.0.
 * Production installs use `vp install` in install.sh which resolves real versions.
 */
function setupLocalDevDeps(versionDir: string) {
  const nodeModulesLink = path.join(versionDir, 'node_modules');
  // Use packages/cli/node_modules which has the cli's resolved deps (not root,
  // since pnpm doesn't hoist workspace packages' deps to root node_modules)
  const cliNodeModules = path.join(repoRoot, 'packages', 'cli', 'node_modules');

  rmSync(nodeModulesLink, { recursive: true, force: true });
  symlinkSync(cliNodeModules, nodeModulesLink, 'dir');
}

// Allow running directly via: npx tsx install-global-cli.ts <args>
if (import.meta.main) {
  installGlobalCli();
}
