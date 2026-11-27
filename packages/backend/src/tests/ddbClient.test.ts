/**
 * ddbClient.test.ts — Every DynamoDB table module writes through one shared client.
 *
 * The document client throws on an item with an undefined property unless
 * removeUndefinedValues is on. The throw happens in the client before any network call,
 * so it was confirmed against the SDK version in this repo. The local JSON store used
 * in development and tests does not throw, so nothing else here would catch a
 * `field: undefined` that fails only against the real tables.
 *
 * Guarantees:
 *   1. The shared client has removeUndefinedValues on.
 *   2. No source file builds a document client any other way, so the setting cannot be
 *      bypassed by a new table module copying the old pattern.
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { makeDocClient } from '../db/ddbClient';

const SRC = path.resolve(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'tests' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('the shared DynamoDB document client', () => {
  it('drops undefined values instead of throwing', () => {
    const options = makeDocClient().config.translateConfig?.marshallOptions;
    expect(options?.removeUndefinedValues).toBe(true);
  });

  it('is the only place a document client is built', () => {
    const offenders = sourceFiles(SRC)
      .filter(file => path.basename(file) !== 'ddbClient.ts')
      .filter(file => /DynamoDBDocumentClient\s*\.\s*from\s*\(/.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(SRC, file));
    expect(offenders, 'use makeDocClient() from db/ddbClient instead').toEqual([]);
  });

  it('is used by every table module that talks to DynamoDB', () => {
    const users = sourceFiles(SRC)
      .filter(file => /makeDocClient\s*\(\s*\)/.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.basename(file))
      .filter(name => name !== 'ddbClient.ts')
      .sort();
    expect(users).toEqual(['assetDb.ts', 'draftDb.ts', 'evalDb.ts', 'moduleConfigDb.ts', 'paramDb.ts',
      'recipeDb.ts', 'sapPool.ts', 'sessionDb.ts', 'simDb.ts']);
  });
});
