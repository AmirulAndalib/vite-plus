import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import YAML from 'yaml';

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

  // Update pnpm-workspace.yaml overrides to redirect vite-plus packages to tgz files.
  // Projects using pnpm catalogs (e.g. vinext) have entries like:
  //   catalog: { vite: "npm:@voidzero-dev/vite-plus-core@...", ... }
  //   overrides: { vite: "catalog:", vitest: "catalog:" }
  // Catalog doesn't support file: protocol, so we set overrides directly to tgz
  // paths. pnpm overrides take precedence over catalog entries.
  const workspaceYamlPath = join(cwd, 'pnpm-workspace.yaml');
  if (existsSync(workspaceYamlPath)) {
    const doc = YAML.parseDocument(await readFile(workspaceYamlPath, 'utf-8'));
    let overrides = doc.get('overrides') as YAML.YAMLMap | undefined;
    if (!overrides) {
      overrides = new YAML.YAMLMap();
      doc.set('overrides', overrides);
    }
    for (const [name, value] of Object.entries(tgzPaths)) {
      overrides.set(name, value);
    }
    await writeFile(workspaceYamlPath, doc.toString(), 'utf-8');
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
