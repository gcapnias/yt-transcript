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
/** Asserts that importing `modules` left the repository exactly as it was. */
async function importLeavingNoTrace(modules) {
  const before = fs.readdirSync(root).sort();
  const cwdBefore = fs.readdirSync(process.cwd()).sort();

  for (const name of modules) {
    await import(new URL(`../${name}`, import.meta.url));
  }

  assert.deepEqual(fs.readdirSync(root).sort(), before);
  assert.deepEqual(fs.readdirSync(process.cwd()).sort(), cwdBefore);
}

test('importing every src module writes no file and spawns nothing', async () => {
  const modules = fs
    .readdirSync(path.join(root, 'src'))
    .filter((name) => name.endsWith('.js'))
    .map((name) => `src/${name}`);
  assert.ok(modules.length > 0, 'no modules found to check');

  await importLeavingNoTrace(modules);
});

// The entry point is a module too, and its guard is `import.meta.main`, which
// arrived in Node 24.2 — above this package's Node 22 floor. On Node 22 the
// guard is absent by design (failing closed would break the tool on a
// supported runtime), so this skips loudly rather than passing over a case it
// never checked.
test('importing the entry point does not run the command', async (t) => {
  if (import.meta.main === undefined) {
    t.skip('entry guard needs import.meta.main (Node 24.2+); unguarded on this runtime');
    return;
  }

  await importLeavingNoTrace(['bin/yt-transcript.js']);
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
