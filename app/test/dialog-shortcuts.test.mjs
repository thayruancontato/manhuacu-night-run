import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const dialogProvider = await readFile(new URL('../src/context/CustomDialogContext.tsx', import.meta.url), 'utf8');

test('custom dialog can be closed with Ctrl+Z or Cmd+Z', () => {
  assert.match(dialogProvider, /window\.addEventListener\('keydown', handleKeyDown\)/);
  assert.match(dialogProvider, /event\.key\.toLowerCase\(\) === 'z'/);
  assert.match(dialogProvider, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(dialogProvider, /event\.preventDefault\(\)/);
  assert.match(dialogProvider, /close\(\)/);
});

test('custom dialog status icons are not mojibake', () => {
  assert.match(dialogProvider, /'✓'/);
  assert.match(dialogProvider, /'✕'/);
  assert.doesNotMatch(dialogProvider, /âœ/);
});
