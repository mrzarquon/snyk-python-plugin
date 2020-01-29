import { DependencyUpdates } from '../../types';
import {
  parseRequirementsFile,
  Requirement,
} from '../../requirements-file-parser';

/**
 * Given contents of manifest file(s) and a set of upgrades, apply the given
 * upgrades to a manifest and return the upgraded manifest.
 *
 * Currently only supported for `requirements.txt` - at least one file named
 * `requirements.txt` must be in the manifests.
 **/
export function updateDependencies(
  requirementsTxt: string,
  upgrades: DependencyUpdates
) {
  if (Object.keys(upgrades).length === 0) {
    return requirementsTxt;
  }

  const requirements = parseRequirementsFile(requirementsTxt);
  const endsWithNewLine = fileEndsWithNewLine(requirements);

  const topLevelDeps = requirements
    .map(({ name }) => name && name.toLowerCase())
    .filter(isDefined);

  // Lowercase the upgrades object. This might be overly defensive, given that
  // we control this input internally, but its a low cost guard rail. Outputs a
  // mapping of upgrade to -> from, instead of the nested upgradeTo object.
  const lowerCasedUpgrades: { [upgradeFrom: string]: string } = {};
  Object.keys(upgrades).forEach((upgrade) => {
    const { upgradeTo } = upgrades[upgrade];
    lowerCasedUpgrades[upgrade.toLowerCase()] = upgradeTo.toLowerCase();
  });

  const updatedRequirements: string[] = requirements.map(
    ({ name, versionComparator, version, originalText, extras }) => {
      // Defensive patching; if any of these are undefined, return
      if (
        typeof name === 'undefined' ||
        typeof versionComparator === 'undefined' ||
        typeof version === 'undefined'
      ) {
        return originalText;
      }

      // Check if we have an upgrade; if we do, replace the version string with
      // the upgrade, but keep the rest of the content
      const upgrade = lowerCasedUpgrades[`${name.toLowerCase()}@${version}`];

      if (!upgrade) {
        return originalText;
      }

      const newVersion = upgrade.split('@')[1];
      return `${name}${versionComparator}${newVersion}${extras ? extras : ''}`;
    }
  );

  const pinnedRequirements = Object.keys(lowerCasedUpgrades)
    .map((pkgNameAtVersion) => {
      const pkgName = pkgNameAtVersion.split('@')[0];

      // Pinning is only for non top level deps
      if (topLevelDeps.indexOf(pkgName) >= 0) {
        return;
      }

      const version = lowerCasedUpgrades[pkgNameAtVersion].split('@')[1];
      return `${pkgName}>=${version} # not directly required, pinned by Snyk to avoid a vulnerability`;
    })
    .filter(isDefined);

  let updatedManifest = [...updatedRequirements, ...pinnedRequirements].join(
    '\n'
  );

  if (endsWithNewLine) {
    updatedManifest += '\n';
  }

  return updatedManifest;
}

// TS is not capable of determining when Array.filter has removed undefined
// values without a manual Type Guard, so thats what this does
function isDefined<T>(t: T | undefined): t is T {
  return typeof t !== 'undefined';
}

function fileEndsWithNewLine(sanitisedFile: Requirement[]): boolean {
  // This is a bit of a hack, but an easy one to follow. If a file ends with a
  // new line, ensure we keep it this way. Don't hijack customers formatting.
  let endsWithNewLine = false;
  if (sanitisedFile[sanitisedFile.length - 1].originalText === '\n') {
    endsWithNewLine = true;
  }
  return endsWithNewLine;
}
