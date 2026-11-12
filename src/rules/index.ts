import { staleDesignDocuments } from './documentation/design-doc-freshness.js';
import { designDocumentsNamingMissingFiles } from './documentation/stale-references.js';
import {
  diagramsWithoutDecisionRecords,
  documentationWithoutDiagrams,
  noDesignDocumentation,
  unreferencedDiagrams,
} from './documentation/design-documentation.js';
import { classCohesion, classSize } from './design/class-rules.js';
import { lawOfDemeter } from './design/law-of-demeter.js';
import { moduleFanOut } from './design/module-fan-out.js';
import { serviceLocator } from './design/service-locator.js';
import { hotspots } from './git/hotspots.js';
import { decoderWithoutFuzzTarget } from './testing/decoders.js';
import { noAdvancedTesting, noAutomatedTests } from './testing/readiness.js';
import {
  dependencyLicenseConflicts,
  unknownDependencyLicenses,
} from './licenses/dependency-license-rules.js';
import {
  licenseDeclarationMismatch,
  licenseNotices,
  noLicense,
  spdxHeaders,
  undocumentedThirdPartyLicenses,
  unrecognizedLicenseFile,
} from './licenses/project-license-rules.js';
import { cyclomaticComplexity } from './metrics/cyclomatic-complexity.js';
import { fileLength } from './metrics/file-length.js';
import { remoteCallWithoutTimeout, timeoutWrittenIntoCall } from './resilience/remote-calls.js';
import { remoteCallsWithoutRetry } from './resilience/retry.js';
import { functionLength } from './metrics/function-length.js';
import { unitMaintainabilityIndex } from './metrics/maintainability-index.js';
import { nestingDepth } from './metrics/nesting-depth.js';
import { parameterCount } from './metrics/parameter-count.js';
import { commandInjection } from './security/command-injection.js';
import { dynamicEvaluation } from './security/dynamic-evaluation.js';
import { hardcodedCredentials } from './security/hardcoded-credentials.js';
import { insecureDeserialization } from './security/insecure-deserialization.js';
import { sqlInjection } from './security/sql-injection.js';
import { tlsVerification } from './security/tls-verification.js';
import { weakCryptography } from './security/weak-cryptography.js';
import {
  floatingVersions,
  missingLockfile,
  remoteDependencies,
} from './supply-chain/dependency-rules.js';
import {
  missingContinuousIntegration,
  missingDependencyUpdates,
  missingSbom,
  missingSecretScanning,
} from './supply-chain/repository-hygiene.js';
import type { RuleDefinition } from './types.js';

/** Every rule SiftCode ships, in id order. Adding a rule means adding it here. */
export const ALL_RULES: readonly RuleDefinition[] = [
  lawOfDemeter,
  serviceLocator,
  classSize,
  classCohesion,
  moduleFanOut,
  noDesignDocumentation,
  documentationWithoutDiagrams,
  diagramsWithoutDecisionRecords,
  unreferencedDiagrams,
  staleDesignDocuments,
  designDocumentsNamingMissingFiles,
  hotspots,
  noLicense,
  unrecognizedLicenseFile,
  licenseDeclarationMismatch,
  licenseNotices,
  undocumentedThirdPartyLicenses,
  spdxHeaders,
  dependencyLicenseConflicts,
  unknownDependencyLicenses,
  functionLength,
  cyclomaticComplexity,
  parameterCount,
  nestingDepth,
  unitMaintainabilityIndex,
  fileLength,
  remoteCallWithoutTimeout,
  timeoutWrittenIntoCall,
  remoteCallsWithoutRetry,
  hardcodedCredentials,
  sqlInjection,
  commandInjection,
  dynamicEvaluation,
  weakCryptography,
  insecureDeserialization,
  tlsVerification,
  missingLockfile,
  floatingVersions,
  remoteDependencies,
  missingContinuousIntegration,
  missingDependencyUpdates,
  missingSbom,
  missingSecretScanning,
  noAutomatedTests,
  noAdvancedTesting,
  decoderWithoutFuzzTarget,
];

export function findRule(id: string): RuleDefinition | undefined {
  return ALL_RULES.find((rule) => rule.meta.id === id);
}
