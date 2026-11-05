import { z } from 'zod';
import { defineRepoRule } from '../define.js';
import { cheatSheet, cwe, nistSsdf, owaspTop10, scorecardCheck } from '../standards.js';
import type { Severity } from '../../core/severity.js';
import type { RepoHit, RepoView } from '../types.js';
import { readManifests } from './manifests.js';

const CI_FILE =
  /^(?:\.github\/workflows\/[^/]+\.ya?ml|\.gitlab-ci\.ya?ml|azure-pipelines(?:-[\w.-]+)?\.ya?ml|\.azure-pipelines\/.+\.ya?ml|\.circleci\/config\.yml|Jenkinsfile.*|\.travis\.yml|bitbucket-pipelines\.yml|\.drone\.yml|\.?appveyor\.yml|\.buildkite\/.+\.ya?ml|cloudbuild\.ya?ml|\.woodpecker(?:\/.+)?\.ya?ml|buildspec\.ya?ml|\.cirrus\.yml)$/;

const UPDATE_TOOL_FILE =
  /^(?:\.github\/dependabot\.ya?ml|(?:\.github\/|\.gitlab\/)?renovate\.json5?|\.renovaterc(?:\.json5?)?)$/;

const SBOM_FILE =
  /(?:^|\/)(?:sbom[\w.-]*|bom\.(?:json|xml)|[\w.-]+\.(?:cdx|spdx)\.(?:json|xml|ya?ml)|[\w.-]+\.spdx)$/i;

const SECRET_SCANNER_FILE =
  /^(?:\.?gitleaks\.toml|\.gitleaksignore|\.secrets\.baseline|\.trufflehog[\w.-]*|\.talismanrc|\.github\/secret_scanning\.ya?ml)$/;

/** Words in CI configuration, scripts, or hooks that show a tool is wired in. */
const SBOM_TOOLS = /\b(?:cyclonedx|spdx|syft|sbom)\b/i;
const SECRET_SCANNERS = /\b(?:gitleaks|trufflehog|detect-secrets|talisman|secret[-_ ]?scan\w*)\b/i;

const anyFile = (repo: RepoView, pattern: RegExp): boolean =>
  repo.files.some((path) => pattern.test(path));

/** The configuration files whose text can show a tool is used: CI, hooks, package.json, task runners. */
async function automationText(repo: RepoView): Promise<string> {
  const paths = repo.files.filter(
    (path) =>
      CI_FILE.test(path) ||
      /^(?:\.pre-commit-config\.ya?ml|\.husky\/[^/]+|package\.json|Makefile|justfile|Taskfile\.ya?ml)$/.test(
        path,
      ),
  );
  const texts = await Promise.all(paths.map((path) => repo.read(path)));
  return texts.filter((text) => text !== undefined).join('\n');
}

/** A README gives the finding a natural home; otherwise the finding is about the folder as a whole. */
function anchorPath(repo: RepoView): string {
  return repo.files.find((path) => /^readme(?:\.\w+)?$/i.test(path)) ?? '.';
}

/** These checks look at a whole project, so they only apply to the top of a Git repository with code. */
const isProject = (repo: RepoView): boolean => repo.isRepositoryRoot && repo.sourceFileCount > 0;

async function hasDependencies(repo: RepoView): Promise<boolean> {
  const manifests = await readManifests(repo);
  return manifests.some((manifest) =>
    manifest.dependencies.some((dependency) => dependency.pinning !== 'local'),
  );
}

function projectHit(repo: RepoView, key: string, message: string, severity?: Severity): RepoHit {
  return {
    path: anchorPath(repo),
    startLine: 1,
    endLine: 1,
    message,
    key,
    ...(severity ? { severity } : {}),
  };
}

export const missingContinuousIntegration = defineRepoRule({
  meta: {
    id: 'SC-SUP-004',
    title: 'No continuous integration configuration',
    category: 'supply-chain',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [
      scorecardCheck('CI-Tests', 'ci-tests'),
      nistSsdf('PO.3', 'Implement Supporting Toolchains'),
    ],
    rationale:
      'Without automated builds and tests on every change, a broken or tampered change is found by users instead of by the pipeline, and releases depend on one person remembering to run the checks.',
    suggestion: {
      summary:
        'Add a pipeline that installs, builds, and tests on every push and pull request (GitHub Actions, GitLab CI, Azure Pipelines, or similar).',
    },
  },
  options: z.strictObject({}),
  check(repo) {
    return Promise.resolve(
      !isProject(repo) || anyFile(repo, CI_FILE)
        ? []
        : [
            projectHit(
              repo,
              'no-ci',
              'No continuous integration configuration was found (for example .github/workflows, .gitlab-ci.yml, azure-pipelines.yml).',
            ),
          ],
    );
  },
});

export const missingDependencyUpdates = defineRepoRule({
  meta: {
    id: 'SC-SUP-005',
    title: 'No automatic dependency updates',
    category: 'supply-chain',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [
      scorecardCheck('Dependency-Update-Tool', 'dependency-update-tool'),
      owaspTop10(
        'A06',
        'Vulnerable and Outdated Components',
        'A06_2021-Vulnerable_and_Outdated_Components',
      ),
    ],
    rationale:
      'Pinned dependencies stop moving, so fixes for known vulnerabilities only arrive if someone remembers to look. A tool that opens update pull requests keeps the gap small and the changes reviewable.',
    suggestion: {
      summary:
        'Turn on Dependabot (.github/dependabot.yml) or Renovate (renovate.json) for the package ecosystems you use.',
      before: '# no update configuration',
      after:
        'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule: { interval: weekly }',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo) || anyFile(repo, UPDATE_TOOL_FILE) || !(await hasDependencies(repo))) {
      return [];
    }
    return [
      projectHit(
        repo,
        'no-update-tool',
        'The project has dependencies but no Dependabot or Renovate configuration.',
      ),
    ];
  },
});

export const missingSbom = defineRepoRule({
  meta: {
    id: 'SC-SUP-006',
    title: 'No software bill of materials',
    category: 'supply-chain',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [
      nistSsdf('PS.3', 'Archive and Protect Each Software Release'),
      {
        standard: 'CycloneDX (ECMA-424)',
        url: 'https://cyclonedx.org/specification/overview/',
      },
      { standard: 'SPDX (ISO/IEC 5962:2021)', url: 'https://spdx.dev/use/specifications/' },
    ],
    rationale:
      'When a vulnerability is announced in a library, a bill of materials tells you in minutes whether each release you shipped contains it; without one you have to reconstruct what was inside.',
    suggestion: {
      summary:
        'Generate an SBOM (CycloneDX or SPDX) in your build or release pipeline and attach it to each release.',
      before: '# release contains only the build output',
      after: 'npx @cyclonedx/cyclonedx-npm --output-file sbom.cdx.json',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo) || anyFile(repo, SBOM_FILE) || !(await hasDependencies(repo))) {
      return [];
    }
    if (SBOM_TOOLS.test(await automationText(repo))) {
      return [];
    }
    return [
      projectHit(
        repo,
        'no-sbom',
        'No SBOM file or SBOM generation step was found (CycloneDX or SPDX).',
      ),
    ];
  },
});

export const missingSecretScanning = defineRepoRule({
  meta: {
    id: 'SC-SUP-007',
    title: 'No secret scanning configuration',
    category: 'supply-chain',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [
      cwe(798, 'Use of Hard-coded Credentials'),
      cheatSheet('Secrets Management', 'Secrets_Management_Cheat_Sheet'),
    ],
    rationale:
      'A credential committed once stays in the history; catching it before the push (or at least in the pipeline) is far cheaper than rotating it afterwards. SiftCode cannot see a platform setting such as GitHub secret scanning, so this only reports when no tool is configured in the repository itself.',
    suggestion: {
      summary:
        'Add a secret scanner such as gitleaks or detect-secrets to a pre-commit hook and the CI pipeline, or enable your host’s secret scanning and push protection.',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!isProject(repo) || anyFile(repo, SECRET_SCANNER_FILE)) {
      return [];
    }
    if (SECRET_SCANNERS.test(await automationText(repo))) {
      return [];
    }
    return [
      projectHit(
        repo,
        'no-secret-scanning',
        'No secret scanning tool is configured in the repository (gitleaks, detect-secrets, trufflehog). If the host’s own secret scanning is on, this can be switched off in the config.',
      ),
    ];
  },
});
