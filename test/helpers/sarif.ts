import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import AjvDraft04 from 'ajv-draft-04';

// Node resolves the package's CommonJS export to the class itself, which also carries `.default`;
// TypeScript's NodeNext typings describe the default import as a namespace, so use `.default`.
const Ajv = AjvDraft04.default;

const schemaPath = fileURLToPath(new URL('../.cache/sarif-schema-2.1.0.json', import.meta.url));

function loadSchema(): object {
  try {
    return JSON.parse(readFileSync(schemaPath, 'utf8')) as object;
  } catch {
    throw new Error(
      `The SARIF schema is missing at ${schemaPath}. Run "npm run fetch:sarif-schema" (npm test does this for you).`,
    );
  }
}

// The schema uses `format` keywords (uri, date-time, ...) that need ajv-formats; structure,
// required properties, enums, and types are checked, formats are not.
const validate = new Ajv({ allErrors: true, strict: false, validateFormats: false }).compile(
  loadSchema(),
);

/** Returns the schema violations of a SARIF document; empty when it is valid SARIF 2.1.0. */
export function sarifErrors(document: unknown): string[] {
  validate(document);
  return (validate.errors ?? []).map(
    (error) => `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? ''}`,
  );
}
