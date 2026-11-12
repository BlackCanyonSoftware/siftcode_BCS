// The completeness check for the release SBOM, apart from the script that makes it, so a test can
// give it a bad SBOM. See make-sbom.mjs for why the check exists.

/**
 * What is wrong with `sbom` (a CycloneDX document) as the SBOM of `manifest` (a package.json): the
 * root component has the wrong name, or a production dependency is missing or at another version.
 * An empty list means it is complete.
 */
export function sbomProblems(sbom, manifest) {
  const problems = [];
  const root = sbom.metadata?.component?.name;
  if (root !== manifest.name) {
    problems.push(`the root component is "${root}", expected "${manifest.name}"`);
  }
  const components = sbom.components ?? [];
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!components.some((component) => component.name === name && component.version === version)) {
      problems.push(`${name}@${version} is a production dependency but is not in the SBOM`);
    }
  }
  return problems;
}
