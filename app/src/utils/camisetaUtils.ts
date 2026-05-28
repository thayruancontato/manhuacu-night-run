export const formatCamisetaLabel = (sizeId?: string, camiseta?: any) => {
  const rawLabel = String(camiseta?.label || sizeId || '').trim();
  if (!rawLabel) return '';

  const normalizedLabel = rawLabel.replace(/^BL[_\s-]?/i, 'Baby Look - ').replace(/^M[_\s-]?/i, 'Padrao - ');
  if (/baby\s*look/i.test(normalizedLabel) || /padr[aã]o/i.test(normalizedLabel)) return normalizedLabel;

  const id = String(camiseta?.id || sizeId || '').trim();
  const tipo = String(camiseta?.tipo || '').trim();
  if (/^BL[_-]/i.test(id) || /baby\s*look/i.test(tipo)) return `Baby Look - ${normalizedLabel}`;
  if (/^M[_-]/i.test(id) || /padr[aã]o/i.test(tipo)) return `Padrao - ${normalizedLabel}`;

  return normalizedLabel;
};

export const formatCamisetaShortLabel = (sizeId?: string, camiseta?: any) => (
  formatCamisetaLabel(sizeId, camiseta).replace(/^Baby Look\s*-\s*/i, '').replace(/^Padrao\s*-\s*/i, '')
);
