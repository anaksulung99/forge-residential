import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const outputNodeModules = join(process.cwd(), "build", "server", "node_modules");
const packages = ["playwright", "playwright-core"];

mkdirSync(outputNodeModules, { recursive: true });

function resolvePackageDir(packageName) {
  try {
    return dirname(require.resolve(`${packageName}/package.json`));
  } catch {
    const hoisted = join(
      process.cwd(),
      "node_modules",
      ".pnpm",
      "node_modules",
      packageName,
      "package.json",
    );
    if (existsSync(hoisted)) return dirname(hoisted);

    const pnpmDir = join(process.cwd(), "node_modules", ".pnpm");
    if (!existsSync(pnpmDir)) return null;

    const packageFolder = readdirSync(pnpmDir).find((name) =>
      name.startsWith(`${packageName}@`),
    );
    if (!packageFolder) return null;

    const packageJson = join(
      pnpmDir,
      packageFolder,
      "node_modules",
      packageName,
      "package.json",
    );
    return existsSync(packageJson) ? dirname(packageJson) : null;
  }
}

for (const packageName of packages) {
  const source = resolvePackageDir(packageName);
  if (!source) {
    console.warn(`[postbuild] skipped ${packageName}: package not resolvable`);
    continue;
  }
  const target = join(outputNodeModules, packageName);

  if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
  }

  cpSync(source, target, {
    recursive: true,
    dereference: true,
    force: true,
  });

  console.log(`[postbuild] copied ${packageName} to ${target}`);
}
