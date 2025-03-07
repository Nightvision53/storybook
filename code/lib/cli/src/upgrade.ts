import { sync as spawnSync } from 'cross-spawn';
import { telemetry } from '@storybook/telemetry';
import semver from 'semver';
import { logger } from '@storybook/node-logger';
import {
  getPackageDetails,
  JsPackageManagerFactory,
  PackageJsonWithMaybeDeps,
} from './js-package-manager';
import { commandLog } from './helpers';
import { automigrate } from './automigrate';

type Package = {
  package: string;
  version: string;
};

const versionRegex = /(@storybook\/[^@]+)@(\S+)/;
export const getStorybookVersion = (line: string) => {
  if (line.startsWith('npm ')) return null;
  const match = versionRegex.exec(line);
  if (!match || !semver.clean(match[2])) return null;
  return {
    package: match[1],
    version: match[2],
  };
};

const excludeList = [
  '@storybook/addon-bench',
  '@storybook/addon-console',
  '@storybook/addon-postcss',
  '@storybook/babel-plugin-require-context-hook',
  '@storybook/bench',
  '@storybook/builder-vite',
  '@storybook/csf',
  '@storybook/design-system',
  '@storybook/ember-cli-storybook',
  '@storybook/eslint-config-storybook',
  '@storybook/expect',
  '@storybook/jest',
  '@storybook/linter-config',
  '@storybook/mdx1-csf',
  '@storybook/mdx2-csf',
  '@storybook/react-docgen-typescript-plugin',
  '@storybook/storybook-deployer',
  '@storybook/test-runner',
  '@storybook/testing-library',
  '@storybook/testing-react',
];
export const isCorePackage = (pkg: string) =>
  pkg.startsWith('@storybook/') &&
  !pkg.startsWith('@storybook/preset-') &&
  !excludeList.includes(pkg);

const deprecatedPackages = [
  {
    minVersion: '6.0.0-alpha.0',
    url: 'https://github.com/storybookjs/storybook/blob/next/MIGRATION.md#60-deprecations',
    deprecations: [
      '@storybook/addon-notes',
      '@storybook/addon-info',
      '@storybook/addon-contexts',
      '@storybook/addon-options',
      '@storybook/addon-centered',
    ],
  },
];

const formatPackage = (pkg: Package) => `${pkg.package}@${pkg.version}`;

const warnPackages = (pkgs: Package[]) =>
  pkgs.forEach((pkg) => logger.warn(`- ${formatPackage(pkg)}`));

export const checkVersionConsistency = () => {
  const lines = spawnSync('npm', ['ls'], { stdio: 'pipe', shell: true })
    .output.toString()
    .split('\n');
  const storybookPackages = lines
    .map(getStorybookVersion)
    .filter(Boolean)
    .filter((pkg) => isCorePackage(pkg.package));
  if (!storybookPackages.length) {
    logger.warn('No storybook core packages found.');
    logger.warn(`'npm ls | grep storybook' can show if multiple versions are installed.`);
    return;
  }
  storybookPackages.sort((a, b) => semver.rcompare(a.version, b.version));
  const latestVersion = storybookPackages[0].version;
  const outdated = storybookPackages.filter((pkg) => pkg.version !== latestVersion);
  if (outdated.length > 0) {
    logger.warn(
      `Found ${outdated.length} outdated packages (relative to '${formatPackage(
        storybookPackages[0]
      )}')`
    );
    logger.warn('Please make sure your packages are updated to ensure a consistent experience.');
    warnPackages(outdated);
  }

  deprecatedPackages.forEach(({ minVersion, url, deprecations }) => {
    if (semver.gte(latestVersion, minVersion)) {
      const deprecated = storybookPackages.filter((pkg) => deprecations.includes(pkg.package));
      if (deprecated.length > 0) {
        logger.warn(`Found ${deprecated.length} deprecated packages since ${minVersion}`);
        logger.warn(`See ${url}`);
        warnPackages(deprecated);
      }
    }
  });
};

type ExtraFlags = Record<string, string[]>;
const EXTRA_FLAGS: ExtraFlags = {
  'react-scripts@<5': ['--reject', '/preset-create-react-app/'],
};

export const addExtraFlags = (
  extraFlags: ExtraFlags,
  flags: string[],
  { dependencies, devDependencies }: PackageJsonWithMaybeDeps
) => {
  return Object.entries(extraFlags).reduce(
    (acc, entry) => {
      const [pattern, extra] = entry;
      const [pkg, specifier] = getPackageDetails(pattern);
      const pkgVersion = dependencies[pkg] || devDependencies[pkg];

      if (pkgVersion && semver.satisfies(semver.coerce(pkgVersion), specifier)) {
        return [...acc, ...extra];
      }

      return acc;
    },
    [...flags]
  );
};

interface UpgradeOptions {
  prerelease: boolean;
  skipCheck: boolean;
  useNpm: boolean;
  dryRun: boolean;
  yes: boolean;
  disableTelemetry: boolean;
}

export const upgrade = async ({
  prerelease,
  skipCheck,
  useNpm,
  dryRun,
  yes,
  ...options
}: UpgradeOptions) => {
  const packageManager = JsPackageManagerFactory.getPackageManager(useNpm);

  commandLog(`Checking for latest versions of '@storybook/*' packages`);
  if (!options.disableTelemetry) {
    telemetry('upgrade', { prerelease });
  }

  let flags = [];
  if (!dryRun) flags.push('--upgrade');
  flags.push('--target');
  flags.push(prerelease ? 'greatest' : 'latest');
  flags = addExtraFlags(EXTRA_FLAGS, flags, packageManager.retrievePackageJson());
  const check = spawnSync('npx', ['npm-check-updates@latest', '/storybook/', ...flags], {
    stdio: 'pipe',
    shell: true,
  }).output.toString();
  logger.info(check);

  if (!dryRun) {
    commandLog(`Installing upgrades`);
    packageManager.installDependencies();
  }

  if (!skipCheck) {
    checkVersionConsistency();
    await automigrate({ dryRun, yes });
  }
};
