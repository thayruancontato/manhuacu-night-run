import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publicForm = await readFile(new URL('../src/pages/PublicForm.tsx', import.meta.url), 'utf8');
const appCss = await readFile(new URL('../src/App.css', import.meta.url), 'utf8');

test('child registration auto-selects and locks the single matching modality', () => {
  assert.match(publicForm, /autoLockedChildModalityId/);
  assert.match(publicForm, /matchingChildModalities\.length === 1/);
  assert.match(publicForm, /set\('modalidadeId', onlyModalityId\)/);
  assert.match(publicForm, /disabled=\{autoLockedChildModalityId === mod\.id\}/);
  assert.match(publicForm, /className=\{`modality-card/);
  assert.match(appCss, /\.single-modality-grid \.modality-card\.locked/);
});
