import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const publicForm = await readFile(new URL('../src/pages/PublicForm.tsx', import.meta.url), 'utf8');
const regulamento = await readFile(new URL('../src/content/regulamentoOficial.ts', import.meta.url), 'utf8');
const adminLotes = await readFile(new URL('../src/pages/AdminLotes.tsx', import.meta.url), 'utf8');

test('senior athletes receive automatic 50 percent discount', () => {
  assert.match(publicForm, /age\s*>=\s*60/);
  assert.match(publicForm, /hasHalfPrice \? Math\.round\(loteDiscount\.amount \/ 2\) : 0/);
  assert.match(publicForm, /Idoso 60\+ \(50%\)/);
  assert.match(publicForm, /Idoso 60\+: 50% de desconto/);
  assert.match(publicForm, /isSenior/);
});

test('pcd athletes receive automatic 50 percent discount', () => {
  assert.match(publicForm, /pcd: false/);
  assert.match(publicForm, /PCD \(50%\)/);
  assert.match(publicForm, /PCD: 50% de desconto/);
  assert.match(publicForm, /descontoPcd/);
});

test('municipal server discount remains available', () => {
  assert.match(publicForm, /Math\.round\(loteDiscount\.amount \* 0\.2\)/);
  assert.match(publicForm, /loteDiscount\.amount - halfPriceAmount - serverAmount/);
  assert.match(publicForm, /Servidor municipal: 20% de desconto/);
});

test('admin lots can configure active fixed or percent discounts per adult lot and kids', () => {
  assert.match(adminLotes, /discount\?: LoteDiscount/);
  assert.match(adminLotes, /enabled: boolean/);
  assert.match(adminLotes, /type: DiscountType/);
  assert.match(adminLotes, /Percentual \(%\)/);
  assert.match(adminLotes, /Valor fixo \(R\$\)/);
  assert.match(adminLotes, /updateLoteDiscount/);
  assert.match(adminLotes, /Desconto Kids/);
  assert.match(adminLotes, /updateInfantilDiscount/);
});

test('public form applies lot discount before creating the payment', () => {
  assert.match(publicForm, /applyLoteDiscount/);
  assert.match(publicForm, /discount\.type === 'fixed'/);
  assert.match(publicForm, /amountInCents \* \(Number\(discount\.value\) \/ 100\)/);
  assert.match(publicForm, /loteDiscount: lote\.discount/);
  assert.match(publicForm, /loteDiscount: settings\.infantil\.discount/);
  assert.match(publicForm, /descontoLote/);
  assert.match(publicForm, /valorDescontoLote/);
});

test('official regulation promises senior automatic discount', () => {
  assert.match(regulamento, /Idosos com 60 anos ou mais/i);
  assert.match(regulamento, /pagam metade/i);
  assert.match(regulamento, /desconto é aplicado automaticamente/i);
  assert.match(regulamento, /Pessoas com deficiência \(PCD\) pagam metade/i);
});
