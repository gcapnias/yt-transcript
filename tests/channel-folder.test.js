import test from 'node:test';
import assert from 'node:assert/strict';

import { channelFolder } from '../src/slug.js';

test('a handle is kebab-cased the way a slug is, its @ dropped', () => {
  assert.equal(channelFolder({ handle: '@iamseankochel' }), 'iamseankochel');
  assert.equal(channelFolder({ handle: '@Shannon-Jenkins' }), 'shannon-jenkins');
  assert.equal(channelFolder({ handle: 'MattPocockUK' }), 'mattpocockuk');
});

test('underscores and dots separate like any other character', () => {
  assert.equal(channelFolder({ handle: 'some_user' }), 'some-user');
  assert.equal(channelFolder({ handle: '@a.b__c' }), 'a-b-c');
});

test('the same handle on both sites is one folder', () => {
  assert.equal(
    channelFolder({ handle: '@mattpocockuk' }),
    channelFolder({ handle: 'mattpocockuk' }),
  );
});

test('a handle is never cut short by the slug length cap', () => {
  const handle = `@${'a'.repeat(150)}`;

  assert.equal(channelFolder({ handle }), 'a'.repeat(150));
});

test('a missing or non-Latin handle falls back to the lowercased channel id', () => {
  assert.equal(channelFolder({ handle: '', channelId: 'UCFig7skuwYrCIGy0tuZHA2Q' }), 'ucfig7skuwyrcigy0tuzha2q');
  assert.equal(channelFolder({ channelId: '346640777' }), '346640777');
  assert.equal(channelFolder({ handle: '@日本語', channelId: 'UCabc' }), 'ucabc');
});

test('a channel with neither a handle nor an id goes into unknown-channel', () => {
  assert.equal(channelFolder({}), 'unknown-channel');
  assert.equal(channelFolder({ handle: '@日本語', channelId: '' }), 'unknown-channel');
});
