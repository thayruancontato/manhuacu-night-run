import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const regulamento = await readFile(new URL('../src/content/regulamentoOficial.ts', import.meta.url), 'utf8');
const publicForm = await readFile(new URL('../src/pages/PublicForm.tsx', import.meta.url), 'utf8');

test('official regulation contains current event data and public rules', () => {
  assert.match(regulamento, /MÇU NIGHT RUN 2026 - MANHUAÇU\/MG/);
  assert.match(regulamento, /Data: 12\/09\/2026/);
  assert.match(regulamento, /Corrida Kids: 16h/);
  assert.match(regulamento, /3,0Km \(caminhada\), 5km e 10km: 18h30/);
  assert.match(regulamento, /Taxa da plataforma cobrada à parte/);
  assert.match(regulamento, /Servidor público da Prefeitura de Manhuaçu tem desconto de 20%/);
});

test('public form keeps the official regulation hidden from the terms modal', () => {
  assert.doesNotMatch(publicForm, /REGULAMENTO_OFICIAL/);
  assert.doesNotMatch(publicForm, /terms-regulation-text/);
});
