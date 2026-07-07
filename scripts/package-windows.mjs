import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const releaseDir = path.join(root, 'release', 'desktop');
const unpackedDir = path.join(releaseDir, 'win-unpacked');
const electronDistDir = path.join(root, 'node_modules', 'electron', 'dist');
const windowsExeName = 'Image Agent Studio.exe';

function run(command, args, options = {}) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit', ...options });
}

function runBin(command, args) {
  if (process.platform === 'win32') {
    run('cmd.exe', ['/c', command, ...args]);
    return;
  }
  run(command, args);
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertPackagedApp(unpackedPath) {
  const appDir = path.join(unpackedPath, 'resources', 'app');
  const appAsar = path.join(unpackedPath, 'resources', 'app.asar');
  if (!(await exists(appAsar)) && !(await exists(path.join(appDir, 'package.json')))) {
    throw new Error(`Windows package is missing ${path.relative(root, appAsar)} or ${path.relative(root, appDir)}; refusing to build a default Electron shell.`);
  }
}

async function copyIntoApp(sourceRelativePath, targetRelativePath = sourceRelativePath) {
  const sourcePath = path.join(root, sourceRelativePath);
  const targetPath = path.join(unpackedDir, 'resources', 'app', targetRelativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

async function preparePrepackagedApp() {
  if (!(await exists(path.join(electronDistDir, 'electron.exe')))) {
    runBin('electron', ['--version']);
  }
  if (!(await exists(path.join(electronDistDir, 'electron.exe')))) {
    throw new Error(`Electron runtime is missing ${path.relative(root, electronDistDir)}. Run npm install again before packaging.`);
  }

  await fs.rm(unpackedDir, { recursive: true, force: true });
  await fs.cp(electronDistDir, unpackedDir, { recursive: true });

  const resourcesDir = path.join(unpackedDir, 'resources');
  await fs.rm(path.join(resourcesDir, 'default_app.asar'), { force: true });
  await fs.mkdir(path.join(resourcesDir, 'app'), { recursive: true });

  await copyIntoApp('apps/desktop');
  await copyIntoApp('dist');
  await copyIntoApp('scripts/image-agent-studio-history-service.mjs');
  await copyIntoApp('scripts/studio-service');
  await copyIntoApp('node_modules/undici');

  const packageJson = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  const desktopPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type,
    main: packageJson.main,
    description: packageJson.description,
    license: packageJson.license,
    dependencies: {
      undici: packageJson.dependencies?.undici
    }
  };
  await fs.writeFile(
    path.join(resourcesDir, 'app', 'package.json'),
    `${JSON.stringify(desktopPackageJson, null, 2)}\n`
  );

  const electronExe = path.join(unpackedDir, 'electron.exe');
  const productExe = path.join(unpackedDir, windowsExeName);
  if ((await exists(electronExe)) && !(await exists(productExe))) {
    await fs.rename(electronExe, productExe);
  }
  return true;
}

async function main() {
  run(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32'
    ? ['/c', 'npm', 'run', 'build:studio']
    : ['run', 'build:studio']);

  await preparePrepackagedApp();
  console.warn('[package-windows] Built a verified prepackaged app; creating Windows installers from it.');
  runBin('npx', ['electron-builder', '--win', '--prepackaged', unpackedDir, '--config', 'electron-builder.config.cjs']);
  await assertPackagedApp(unpackedDir);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
