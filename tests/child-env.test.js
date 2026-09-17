import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { sanitizeChildEnv } from '../src/child-env.js';

const sep = path.delimiter;

test('fnm_multishells entries are stripped from the child PATH', () => {
  const env = {
    PATH: ['/usr/bin', '/tmp/fnm_multishells/12345_1700000000000/bin', '/usr/local/bin'].join(sep),
  };

  assert.equal(sanitizeChildEnv(env).PATH, ['/usr/bin', '/usr/local/bin'].join(sep));
});

test('the PATH key is rewritten whatever its casing, and no second one appears', () => {
  const env = { Path: ['C:\\bin', 'C:\\fnm_multishells\\abc\\bin'].join(sep) };

  const sanitized = sanitizeChildEnv(env);

  assert.deepEqual(Object.keys(sanitized), ['Path']);
  assert.equal(sanitized.Path, 'C:\\bin');
});

test('other variables and the caller environment are left alone', () => {
  const env = { PATH: `/usr/bin${sep}/opt/fnm_multishells/x/bin`, HOME: '/home/me' };

  const sanitized = sanitizeChildEnv(env);

  assert.equal(sanitized.HOME, '/home/me');
  assert.equal(env.PATH, `/usr/bin${sep}/opt/fnm_multishells/x/bin`, 'input was mutated');
});
