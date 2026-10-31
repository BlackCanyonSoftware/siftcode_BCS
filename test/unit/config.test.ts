import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig, parseConfig } from '../../src/config/load.js';
import { DEFAULT_CONFIG } from '../../src/config/schema.js';
import { UsageError } from '../../src/core/errors.js';
import { scan } from '../../src/core/scan.js';
import { useProjects } from '../helpers/project.js';

const projects = useProjects();

function messageOf(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

describe('parseConfig (US-002)', () => {
  it('fills in defaults for an empty config', () => {
    expect(parseConfig('{}', 'test')).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG).toEqual({ ignore: [], rules: {} });
  });

  it('accepts ignore patterns, rule settings, and failOn', () => {
    const config = parseConfig(
      JSON.stringify({
        ignore: ['generated/'],
        rules: { 'SC-MET-001': { severity: 'warning', options: { maxLines: 80 } } },
        failOn: 'warning',
      }),
      'test',
    );

    expect(config.ignore).toEqual(['generated/']);
    expect(config.rules['SC-MET-001']).toEqual({
      enabled: true,
      severity: 'warning',
      options: { maxLines: 80 },
    });
    expect(config.failOn).toBe('warning');
  });

  it('names the key and the allowed values when a value is wrong', () => {
    const message = messageOf(() => parseConfig('{"failOn":"fatal"}', 'siftcode.config.json'));

    expect(message).toContain('Invalid config siftcode.config.json');
    expect(message).toContain('failOn');
    for (const allowed of ['error', 'warning', 'info', 'note']) {
      expect(message).toContain(allowed);
    }
  });

  it('names the nested key for a bad rule setting', () => {
    const message = messageOf(() =>
      parseConfig('{"rules":{"SC-MET-001":{"severity":"loud"}}}', 'test'),
    );

    expect(message).toContain('rules.SC-MET-001.severity');
  });

  it('rejects unknown keys so typos are caught', () => {
    expect(messageOf(() => parseConfig('{"rulez":{}}', 'test'))).toContain('rulez');
    expect(
      messageOf(() => parseConfig('{"rules":{"SC-MET-001":{"sevrity":"info"}}}', 'test')),
    ).toContain('sevrity');
  });

  it('reports malformed JSON with the file name', () => {
    const message = messageOf(() => parseConfig('{ not json', 'siftcode.config.json'));

    expect(message).toContain('Invalid JSON in siftcode.config.json');
  });
});

describe('loadConfig (US-002)', () => {
  it('returns the defaults when the scanned folder has no config file', async () => {
    const folder = await projects.create({ 'a.js': '' });

    expect(await loadConfig({ scanPath: folder })).toEqual(DEFAULT_CONFIG);
  });

  it('reads siftcode.config.json from the scanned folder', async () => {
    const folder = await projects.create({ 'siftcode.config.json': '{"failOn":"error"}' });

    expect((await loadConfig({ scanPath: folder })).failOn).toBe('error');
  });

  it('reads siftcode.config.json beside a single scanned file', async () => {
    const folder = await projects.create({
      'siftcode.config.json': '{"failOn":"note"}',
      'a.js': '',
    });

    expect((await loadConfig({ scanPath: join(folder, 'a.js') })).failOn).toBe('note');
  });

  it('uses an explicitly named config file', async () => {
    const folder = await projects.create({ 'custom.json': '{"failOn":"info"}' });

    const config = await loadConfig({ scanPath: folder, configPath: join(folder, 'custom.json') });

    expect(config.failOn).toBe('info');
  });

  it('fails with a UsageError when a named config file does not exist', async () => {
    const folder = await projects.create({});

    await expect(
      loadConfig({ scanPath: folder, configPath: join(folder, 'missing.json') }),
    ).rejects.toThrow('Config file not found');
  });

  it('fails with a UsageError when the scan path does not exist', async () => {
    await expect(loadConfig({ scanPath: 'no/such/place' })).rejects.toBeInstanceOf(UsageError);
  });
});

describe('rule settings (US-002)', () => {
  it('rejects an unknown rule id before reading any file', async () => {
    const config = parseConfig('{"rules":{"SC-XXX-999":{"enabled":false}}}', 'test');

    await expect(scan('no/such/place', { config })).rejects.toThrow(
      /Unknown rule "SC-XXX-999".*SC-MET-001/,
    );
  });

  it('rejects invalid rule options and names the rule and the option', async () => {
    const folder = await projects.create({ 'a.js': '' });
    const config = parseConfig('{"rules":{"SC-MET-001":{"options":{"maxLines":-3}}}}', 'test');

    const error = await scan(folder, { config }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UsageError);
    expect((error as Error).message).toContain('SC-MET-001');
    expect((error as Error).message).toContain('maxLines');
  });

  it('rejects unknown rule options', async () => {
    const folder = await projects.create({ 'a.js': '' });
    const config = parseConfig('{"rules":{"SC-MET-001":{"options":{"maxLine":3}}}}', 'test');

    await expect(scan(folder, { config })).rejects.toThrow('maxLine');
  });
});
