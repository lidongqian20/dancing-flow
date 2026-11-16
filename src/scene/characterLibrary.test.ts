import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_VRM_CHARACTERS,
  DEFAULT_CHARACTER_ID,
  getCharacterById,
} from './characterLibrary';

test('BUILTIN_VRM_CHARACTERS contains 5 valid local VRM models with unique IDs', () => {
  assert.ok(BUILTIN_VRM_CHARACTERS.length >= 5);
  const ids = new Set<string>();
  for (const character of BUILTIN_VRM_CHARACTERS) {
    assert.ok(!ids.has(character.id), `duplicate character id: ${character.id}`);
    ids.add(character.id);
    assert.match(character.accentHex, /^#[0-9a-fA-F]{6}$/);
    assert.ok(character.url.startsWith('/models/') && character.url.endsWith('.vrm'));

    const diskPath = path.resolve(process.cwd(), 'public', character.url.slice(1));
    assert.ok(fs.existsSync(diskPath), `missing VRM file on disk: ${diskPath}`);
    const stat = fs.statSync(diskPath);
    assert.ok(stat.size > 100_000, `VRM file unexpectedly small: ${diskPath}`);
  }
});

test('getCharacterById returns requested preset or falls back to default', () => {
  const alicia = getCharacterById('alicia-solid');
  assert.equal(alicia.id, 'alicia-solid');
  const fallback = getCharacterById('nonexistent-id');
  assert.equal(fallback.id, DEFAULT_CHARACTER_ID);
});
