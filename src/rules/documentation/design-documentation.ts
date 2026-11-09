import { z } from 'zod';
import { anchorPath } from '../anchor.js';
import { defineRepoRule } from '../define.js';
import { adr, arc42, c4, iso42010, uml } from '../standards.js';
import {
  detectDesignArtifacts,
  hasAnyDesignArtifact,
  hasDiagrams,
  unreferencedDiagramSources,
} from './detect.js';

const SIZE_OPTION = z.strictObject({
  /** Projects with fewer source files than this get a lower-key finding (or none). */
  minSourceFiles: z.number().int().min(0).default(20),
});

const WHERE =
  'Design documentation is looked for at the top of a Git repository, where it normally lives.';

export const noDesignDocumentation = defineRepoRule({
  meta: {
    id: 'SC-DOC-001',
    title: 'No design or architecture documentation',
    category: 'documentation',
    defaultSeverity: 'warning',
    confidence: 'medium',
    heuristic: true,
    standards: [c4, uml, iso42010, arc42],
    rationale: `A project with no written design, diagram, or decision record keeps its structure only in people’s heads, so every newcomer and every review has to rediscover it from the code. ${WHERE}`,
    suggestion: {
      summary:
        'Start small: a docs/architecture.md with a context diagram (C4 level 1, in Mermaid or PlantUML so it lives in version control) and a docs/adr/ folder for the decisions you make from now on.',
      before: '# no architecture documentation',
      after:
        '```mermaid\nflowchart LR\n  User --> Web[Web app] --> Api[API] --> Db[(Database)]\n```',
    },
  },
  options: SIZE_OPTION,
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount === 0) {
      return [];
    }
    if (hasAnyDesignArtifact(await detectDesignArtifacts(repo))) {
      return [];
    }
    const sizeable = repo.sourceFileCount >= options.minSourceFiles;
    return [
      {
        path: anchorPath(repo),
        startLine: 1,
        endLine: 1,
        message: `No design or architecture documentation was found (no architecture or design document, decision records, or diagrams) for ${repo.sourceFileCount} source files.`,
        key: 'no-design-docs',
        severity: sizeable ? 'warning' : 'note',
      },
    ];
  },
});

export const documentationWithoutDiagrams = defineRepoRule({
  meta: {
    id: 'SC-DOC-002',
    title: 'Design documents have no diagrams',
    category: 'documentation',
    defaultSeverity: 'info',
    confidence: 'medium',
    heuristic: true,
    standards: [c4, uml, iso42010],
    rationale:
      'Structure (what the parts are and how they connect) is much faster to take in as a picture than as prose, and a diagram kept as text can be reviewed and versioned like code.',
    suggestion: {
      summary:
        'Add at least a context and a container diagram (C4), written as Mermaid or PlantUML in the documents themselves.',
      before: 'The API calls the database and the queue.',
      after: '```mermaid\nflowchart LR\n  Api --> Db[(Database)]\n  Api --> Queue\n```',
    },
  },
  options: SIZE_OPTION,
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount < options.minSourceFiles) {
      return [];
    }
    const artifacts = await detectDesignArtifacts(repo);
    const written = [...artifacts.documents, ...artifacts.decisionRecords];
    const [first] = written;
    if (first === undefined || hasDiagrams(artifacts)) {
      return [];
    }
    return [
      {
        path: first,
        startLine: 1,
        endLine: 1,
        message: `The project has written design documents (${written.length}) but no diagrams: add a context or container diagram (Mermaid, PlantUML, draw.io, or an image).`,
        key: 'no-diagrams',
      },
    ];
  },
});

export const diagramsWithoutDecisionRecords = defineRepoRule({
  meta: {
    id: 'SC-DOC-003',
    title: 'Diagrams but no decision records',
    category: 'documentation',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [adr, iso42010, arc42],
    rationale:
      'Diagrams show what the design is; they do not say why it is that way or what was rejected. Without that, the same debates return and nobody knows which constraints are still real.',
    suggestion: {
      summary:
        'Record each significant decision in a short numbered file (docs/adr/0001-use-postgres.md): context, decision, consequences.',
      before: '# diagrams only',
      after:
        '# 1. Use PostgreSQL\n\nStatus: accepted\n\n## Context\n…\n\n## Decision\n…\n\n## Consequences\n…',
    },
  },
  options: SIZE_OPTION,
  async check(repo, options) {
    if (!repo.isRepositoryRoot || repo.sourceFileCount < options.minSourceFiles) {
      return [];
    }
    const artifacts = await detectDesignArtifacts(repo);
    const [first] = [
      ...artifacts.diagramSources,
      ...artifacts.embeddedDiagrams,
      ...artifacts.diagramImages,
    ];
    if (first === undefined || artifacts.decisionRecords.length > 0) {
      return [];
    }
    return [
      {
        path: first,
        startLine: 1,
        endLine: 1,
        message:
          'The project has diagrams but no architecture decision records: write down why the design is the way it is.',
        key: 'no-decision-records',
      },
    ];
  },
});

export const unreferencedDiagrams = defineRepoRule({
  meta: {
    id: 'SC-DOC-004',
    title: 'Diagram file is not referenced by any document',
    category: 'documentation',
    defaultSeverity: 'note',
    confidence: 'low',
    heuristic: true,
    standards: [iso42010, c4],
    rationale:
      'A diagram that no document links to is rarely found, and rarely updated: it drifts away from the code until it misleads more than it helps.',
    suggestion: {
      summary:
        'Link or embed the diagram from the document that describes it (or from the README), or delete it if it is obsolete.',
      before: '(docs/context.puml sits alone in the folder)',
      after: '![System context](context.svg)  <!-- exported from context.puml -->',
    },
  },
  options: z.strictObject({}),
  async check(repo) {
    if (!repo.isRepositoryRoot) {
      return [];
    }
    const artifacts = await detectDesignArtifacts(repo);
    const loose = await unreferencedDiagramSources(repo, artifacts);
    return loose.map((path) => ({
      path,
      startLine: 1,
      endLine: 1,
      message: 'No document mentions this diagram: link it from the document it illustrates.',
      key: `unreferenced:${path}`,
    }));
  },
});
