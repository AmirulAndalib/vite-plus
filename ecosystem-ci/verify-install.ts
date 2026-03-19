import { createRequire } from 'node:module';

const require = createRequire(`${process.cwd()}/`);

const expectedVersion = '0.0.0';

const packages = [
  { name: 'vite', resolve: 'vite/package.json' },
  { name: 'vitest', resolve: 'vitest/package.json' },
  { name: 'vite-plus', resolve: 'vite-plus/package.json' },
];

let failed = false;

for (const { name, resolve } of packages) {
  try {
    const pkg = require(resolve) as { version: string; name: string };
    if (pkg.version !== expectedVersion) {
      console.error(
        `✗ ${name}: expected version ${expectedVersion}, got ${pkg.version} (${pkg.name})`,
      );
      failed = true;
    } else {
      console.log(`✓ ${name}@${pkg.version} (${pkg.name})`);
    }
  } catch {
    console.error(`✗ ${name}: not installed`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
