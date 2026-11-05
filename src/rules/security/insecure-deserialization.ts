import { z } from 'zod';
import type { AnalyzedFile, CallFact } from '../../languages/model/types.js';
import { defineRule } from '../define.js';
import { isTestFile } from '../shared.js';
import {
  cheatSheet,
  cwe,
  firstArgument,
  importsModule,
  isConstant,
  keywordArgument,
  owaspTop10,
  plain,
} from './shared.js';

/** Python modules whose loaders can run code stored in the data. */
const PYTHON_UNSAFE = new Set(
  ['pickle', 'cPickle', '_pickle', 'marshal', 'dill', 'cloudpickle']
    .flatMap((module) => [`${module}.load`, `${module}.loads`])
    .concat(['jsonpickle.decode', 'jsonpickle.loads', 'yaml.unsafe_load', 'yaml.unsafe_load_all']),
);

/** `yaml.load` is safe only with a safe loader. */
function isUnsafeYaml(call: CallFact): boolean {
  if (call.callee !== 'yaml.load' && call.callee !== 'yaml.load_all') {
    return false;
  }
  const loader = keywordArgument(call, 'Loader') ?? call.args[1]?.value;
  return loader?.text.endsWith('SafeLoader') !== true;
}

function pythonHit(call: CallFact): boolean {
  if (PYTHON_UNSAFE.has(call.callee)) {
    const data = firstArgument(call);
    return data !== undefined && !isConstant(data);
  }
  return isUnsafeYaml(call);
}

/** .NET serializers that rebuild any type named in the data. */
const CSHARP_UNSAFE_TYPES = new Set(
  [
    'BinaryFormatter',
    'NetDataContractSerializer',
    'SoapFormatter',
    'LosFormatter',
    'ObjectStateFormatter',
  ].map(plain),
);

function csharpHit(call: CallFact): boolean {
  if (call.isNew && CSHARP_UNSAFE_TYPES.has(plain(call.name))) {
    return true;
  }
  const resolver = firstArgument(call);
  return (
    call.isNew &&
    call.name === 'JavaScriptSerializer' &&
    (resolver?.text ?? '').includes('SimpleTypeResolver')
  );
}

function javascriptHit(file: AnalyzedFile, call: CallFact): boolean {
  return (
    plain(call.name) === 'unserialize' && importsModule(file, 'node-serialize', 'serialize-to-js')
  );
}

export const insecureDeserialization = defineRule({
  meta: {
    id: 'SC-SEC-006',
    title: 'Data is loaded with a deserializer that can run code',
    category: 'security',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [
      cwe(502, 'Deserialization of Untrusted Data'),
      owaspTop10(
        'A08',
        'Software and Data Integrity Failures',
        'A08_2021-Software_and_Data_Integrity_Failures',
      ),
      cheatSheet('Deserialization', 'Deserialization_Cheat_Sheet'),
    ],
    rationale:
      'Some formats (pickle, marshal, .NET BinaryFormatter, unsafe YAML) rebuild arbitrary objects from the data, so loading data that someone else controls lets them run code on your machine.',
    suggestion: {
      summary:
        'Load data with a format that only describes data (JSON, or YAML with a safe loader). Use these deserializers only on data you produced and can authenticate.',
      before: 'config = yaml.load(text)',
      after: 'config = yaml.safe_load(text)',
    },
  },
  options: z.strictObject({}),
  check(file) {
    if (isTestFile(file.path)) {
      return [];
    }
    const hits = [];
    for (const call of file.facts.calls) {
      const unsafe =
        file.grammar === 'python'
          ? pythonHit(call)
          : file.grammar === 'csharp'
            ? csharpHit(call)
            : javascriptHit(file, call);
      if (unsafe) {
        hits.push({
          startLine: call.line,
          endLine: call.line,
          message: `${call.isNew ? 'new ' : ''}${call.callee}() can run code stored in the data it loads.`,
          key: call.callee,
        });
      }
    }
    // JSON.NET: `TypeNameHandling = TypeNameHandling.Auto` lets the data choose the type to build.
    for (const entry of file.facts.namedValues) {
      const isUnsafeSetting =
        entry.name === 'TypeNameHandling' &&
        /TypeNameHandling\.(All|Auto|Objects|Arrays)$/.test(entry.value.text);
      if (isUnsafeSetting) {
        hits.push({
          startLine: entry.line,
          endLine: entry.line,
          message:
            'TypeNameHandling lets the data choose which types are created when it is loaded.',
          key: 'TypeNameHandling',
        });
      }
    }
    return hits;
  },
});
