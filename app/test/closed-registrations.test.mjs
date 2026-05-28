import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
const closedPageSource = await readFile(new URL('../src/pages/ClosedRegistrations.tsx', import.meta.url), 'utf8');

test('home route keeps the presentation page before registration', () => {
  assert.match(appSource, /import Home from '\.\/pages\/Home'/);
  assert.match(appSource, /path="\/"\s+element=\{<Home \/>\}/);
  assert.match(appSource, /path="\/inscricao"\s+element=\{<ClosedRegistrations \/>\}/);
  assert.doesNotMatch(appSource, /path="\/"\s+element=\{<ClosedRegistrations \/>\}/);
});

test('registration route is guarded by the maintenance screen', () => {
  assert.match(appSource, /path="\/inscricao"\s+element=\{<ClosedRegistrations \/>\}/);
  assert.doesNotMatch(appSource, /path="\/inscricao"\s+element=\{<PublicForm \/>\}/);
});

test('closed page communicates registrations will open soon', () => {
  assert.match(closedPageSource, /Inscrições ainda não disponíveis/);
  assert.match(closedPageSource, /Abrirá em breve/);
});

test('closed page can be bypassed with Ctrl+Z', () => {
  assert.match(closedPageSource, /event\.key\.toLowerCase\(\) === 'z'/);
  assert.match(closedPageSource, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(closedPageSource, /setBypassClosedScreen\(true\)/);
  assert.match(closedPageSource, /return <PublicForm \/>/);
});

test('closed page follows the admin maintenance setting', () => {
  assert.match(closedPageSource, /site_maintenance/);
  assert.match(closedPageSource, /registrationsClosed/);
  assert.match(closedPageSource, /if \(!registrationsClosed\) return <PublicForm \/>/);
});
