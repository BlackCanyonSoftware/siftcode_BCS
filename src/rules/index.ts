import { classCohesion, classSize } from './design/class-rules.js';
import { lawOfDemeter } from './design/law-of-demeter.js';
import { moduleFanOut } from './design/module-fan-out.js';
import { serviceLocator } from './design/service-locator.js';
import { cyclomaticComplexity } from './metrics/cyclomatic-complexity.js';
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
import type { RuleDefinition } from './types.js';

/** Every rule SiftCode ships, in id order. Adding a rule means adding it here. */
export const ALL_RULES: readonly RuleDefinition[] = [
  lawOfDemeter,
  serviceLocator,
  classSize,
  classCohesion,
  moduleFanOut,
  functionLength,
  cyclomaticComplexity,
  parameterCount,
  nestingDepth,
  unitMaintainabilityIndex,
  hardcodedCredentials,
  sqlInjection,
  commandInjection,
  dynamicEvaluation,
  weakCryptography,
  insecureDeserialization,
  tlsVerification,
];

export function findRule(id: string): RuleDefinition | undefined {
  return ALL_RULES.find((rule) => rule.meta.id === id);
}
