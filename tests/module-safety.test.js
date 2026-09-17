import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The standalone cleaner this tool replaces ran its CLI block at module scope,
 * so merely importing it wrote a file. Every module must stay import-safe:
 * only bin/yt-transcript.js may run anything.
 */
test('importing any module writes no file and spawns nothing', async () => {
  const modules = [
    ...fs
      .readdirSync(path.join(root, 'src'))
      .filter((name) => name.endsWith('.js'))
      .map((name) => `src/${name}`),
    // The entry point is a module too: its guard is what stops an import of it
    // running the whole command. That guard is `import.meta.main`, so it can
    // only be exercised on a runtime that has it (Node 24.2+).
    ...(import.meta.main === undefined ? [] : ['bin/yt-transcript.js']),
  ];
  assert.ok(modules.length > 1, 'no modules found to check');

  const before = fs.readdirSync(root).sort();
  const cwdBefore = fs.readdirSync(process.cwd()).sort();

  for (const name of modules) {
    await import(new URL(`../${name}`, import.meta.url));
  }

  assert.deepEqual(fs.readdirSync(root).sort(), before);
  assert.deepEqual(fs.readdirSync(process.cwd()).sort(), cwdBefore);
  assert.equal(process.exitCode ?? 0, 0, 'importing the entry point ran the command');
});

test('bin/yt-transcript.js is the only module that calls main', () => {
  const modules = fs
    .readdirSync(path.join(root, 'src'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(root, 'src', name), 'utf8'));

  for (const source of modules) {
    assert.doesNotMatch(source, /^\s*(await\s+)?main\(/m, 'a src module invokes main at scope');
    assert.doesNotMatch(source, /process\.argv/, 'a src module reads process.argv at scope');
  }
});
