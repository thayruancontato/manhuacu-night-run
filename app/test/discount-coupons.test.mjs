import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin menu and routes expose discount coupons page', () => {
  const menu = read('src/config/menu.ts');
  const app = read('src/App.tsx');

  assert.match(menu, /BadgePercent/);
  assert.match(menu, /\/admin\/cupons/);
  assert.match(menu, /Cupons de desconto/);
  assert.match(app, /AdminCuponsDesconto/);
  assert.match(app, /path="cupons"/);
});

test('discount coupons page supports complete coupon management', () => {
  const page = read('src/pages/AdminCuponsDesconto.tsx');

  assert.match(page, /nightrun_discount_coupons/);
  assert.match(page, /setDoc/);
  assert.match(page, /updateDoc/);
  assert.match(page, /deleteDoc/);
  assert.match(page, /rechargeCoupon/);
  assert.match(page, /type: 'percent'/);
  assert.match(page, /value: normalizedValue/);
  assert.match(page, /maxUses/);
  assert.match(page, /usedCount/);
});

test('discount coupons page shows who used each coupon', () => {
  const page = read('src/pages/AdminCuponsDesconto.tsx');

  assert.match(page, /nightrun_registrations/);
  assert.match(page, /descontoCupom/);
  assert.match(page, /couponUsages/);
  assert.match(page, /Ver quem usou/);
  assert.match(page, /couponDiscountAmount/);
  assert.match(page, /navigate\(`\/admin\/inscritos\/\$\{usage\.id\}`\)/);
});

test('discount coupons page exports coupon usage list as an image', () => {
  const page = read('src/pages/AdminCuponsDesconto.tsx');

  assert.match(page, /exportCouponImage/);
  assert.match(page, /document\.createElement\('canvas'\)/);
  assert.match(page, /toDataURL\('image\/png'/);
  assert.match(page, /cupom-\$\{coupon\.code\}-usos\.png/);
  assert.match(page, /Exportar imagem/);
  assert.match(page, /tableY \+ tableHeaderHeight \+ tableRowsHeight \+ footerHeight/);
});

test('public registration review validates and consumes coupon before payment creation', () => {
  const form = read('src/pages/PublicForm.tsx');

  assert.match(form, /review-coupon-card/);
  assert.match(form, /handleApplyCoupon/);
  assert.match(form, /validateCouponForAmount/);
  assert.match(form, /consumeCouponForAmount/);
  assert.match(form, /runTransaction/);
  assert.match(form, /couponDiscountAmount/);
  assert.match(form, /descontoCupom/);
  assert.match(form, /calculateCouponDiscount/);
});

test('athlete details show coupon usage when present', () => {
  const details = read('src/pages/AdminAtletaDetalhes.tsx');

  assert.match(details, /couponDiscountAmount/);
  assert.match(details, /couponLabel/);
  assert.match(details, /Cupom usado/);
});
