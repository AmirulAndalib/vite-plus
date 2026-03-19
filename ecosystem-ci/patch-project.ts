import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ecosystemCiDir, tgzDir } from './paths.ts';
import repos from './repo.json' with { type: 'json' };

const projects = Object.keys(repos);

const project = process.argv[2];

if (!projects.includes(project)) {
  console.error(`Project ${project} is not defined in repo.json`);
  process.exit(1);
}

const repoRoot = join(ecosystemCiDir, project);
const repoConfig = repos[project as keyof typeof repos];
const directory = 'directory' in repoConfig ? repoConfig.directory : undefined;
const cwd = directory ? join(repoRoot, directory) : repoRoot;
// run vp migrate
const cli = process.env.VITE_PLUS_CLI_BIN ?? 'vp';

const tgzPaths = {
  vite: `file:${tgzDir}/voidzero-dev-vite-plus-core-0.0.0.tgz`,
  vitest: `file:${tgzDir}/voidzero-dev-vite-plus-test-0.0.0.tgz`,
  'vite-plus': `file:${tgzDir}/vite-plus-0.0.0.tgz`,
  '@voidzero-dev/vite-plus-core': `file:${tgzDir}/voidzero-dev-vite-plus-core-0.0.0.tgz`,
  '@voidzero-dev/vite-plus-test': `file:${tgzDir}/voidzero-dev-vite-plus-test-0.0.0.tgz`,
};

// Projects that already have vite-plus need it removed before migration so
// vp migrate treats them as fresh and applies tgz overrides. Without this,
// vp migrate detects "already using Vite+" and skips override injection.
const forceFreshMigration = 'forceFreshMigration' in repoConfig && repoConfig.forceFreshMigration;
if (forceFreshMigration) {
  const pkgPath = join(cwd, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
  delete pkg.devDependencies?.['vite-plus'];
  delete pkg.dependencies?.['vite-plus'];

  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  // Also update pnpm-workspace.yaml overrides for projects that don't have
  // pnpm.overrides in package.json (pnpm-workspace.yaml overrides are only
  // used when package.json has no overrides).
  const workspaceYamlPath = join(cwd, 'pnpm-workspace.yaml');
  if (existsSync(workspaceYamlPath)) {
    const yaml = await readFile(workspaceYamlPath, 'utf-8');
    const lines = yaml.split('\n');
    const result: string[] = [];
    let inOverrides = false;

    for (const line of lines) {
      if (/^overrides:\s*$/.test(line)) {
        inOverrides = true;
        result.push('overrides:');
        for (const [name, value] of Object.entries(tgzPaths)) {
          const yamlKey = name.includes('@') ? `"${name}"` : name;
          result.push(`  ${yamlKey}: ${value}`);
        }
        continue;
      }
      if (inOverrides) {
        if (line.startsWith('  ')) {
          continue;
        }
        inOverrides = false;
      }
      result.push(line);
    }

    if (!inOverrides && !result.some((l) => l.startsWith('overrides:'))) {
      result.push('overrides:');
      for (const [name, value] of Object.entries(tgzPaths)) {
        const yamlKey = name.includes('@') ? `"${name}"` : name;
        result.push(`  ${yamlKey}: ${value}`);
      }
    }

    await writeFile(workspaceYamlPath, result.join('\n'), 'utf-8');
  }
}

if (project === 'rollipop') {
  const oxfmtrc = await readFile(join(repoRoot, '.oxfmtrc.json'), 'utf-8');
  await writeFile(
    join(repoRoot, '.oxfmtrc.json'),
    oxfmtrc.replace('      ["ts-equals-import"],\n', ''),
    'utf-8',
  );
}

execSync(`${cli} migrate --no-agent --no-interactive`, {
  cwd,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITE_PLUS_OVERRIDE_PACKAGES: JSON.stringify({
      vite: tgzPaths.vite,
      vitest: tgzPaths.vitest,
      '@voidzero-dev/vite-plus-core': tgzPaths['@voidzero-dev/vite-plus-core'],
      '@voidzero-dev/vite-plus-test': tgzPaths['@voidzero-dev/vite-plus-test'],
    }),
    VITE_PLUS_VERSION: tgzPaths['vite-plus'],
  },
});

// Post-migration: ensure tgz overrides are set in pnpm.overrides in package.json.
// vp migrate may overwrite overrides set before migration, and pnpm ignores
// pnpm-workspace.yaml overrides when pnpm.overrides exists in package.json.
if (forceFreshMigration) {
  const pkgPath = join(cwd, 'package.json');
  const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
  if (!pkg.pnpm) {
    pkg.pnpm = {};
  }
  if (!pkg.pnpm.overrides) {
    pkg.pnpm.overrides = {};
  }
  for (const [name, value] of Object.entries(tgzPaths)) {
    pkg.pnpm.overrides[name] = value;
  }
  await writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
}
