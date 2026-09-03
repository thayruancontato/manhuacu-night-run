const stripKnownPrefixes = (value: string) => value
  .replace(/^INF[_\s-]?/i, '')
  .replace(/^BL[_\s-]?/i, '')
  .replace(/^M[_-]/i, '')
  .replace(/^PADRAO[_\s-]?/i, '')
  .replace(/^PADR[AÃ]O\s*-\s*/i, '')
  .replace(/^BABY[_\s-]?LOOK[_\s-]?/i, '')
  .replace(/^BABY\s*LOOK\s*-\s*/i, '')
  .trim();

export const getCamisetaShortLabel = (sizeId?: string, camiseta?: any) => {
  const raw = String(
    camiseta?.label ||
    camiseta?.nome ||
    camiseta?.tamanho ||
    camiseta?.size ||
    sizeId ||
    camiseta?.id ||
    ''
  ).trim();
  if (!raw) return '';
  return stripKnownPrefixes(raw) || raw;
};

export const getCamisetaType = (sizeId?: string, camiseta?: any) => {
  const id = String(camiseta?.id || sizeId || '').trim();
  const typeSource = String(`${camiseta?.tipo || ''} ${camiseta?.label || ''} ${camiseta?.nome || ''} ${id}`);
  return /^BL[_-]/i.test(id) || /baby\s*look/i.test(typeSource) ? 'Baby Look' : 'Padrao';
};

export const findCamisetaByValue = (camisetas: any[], value?: string, preferredType?: string) => {
  const normalizedValue = getCamisetaShortLabel(value).toUpperCase();
  if (!normalizedValue) return null;

  return camisetas.find(item => String(item.id || '').toUpperCase() === String(value || '').toUpperCase()) ||
    camisetas.find(item => {
      const itemShort = getCamisetaShortLabel(item.id, item).toUpperCase();
      const itemType = getCamisetaType(item.id, item);
      return itemShort === normalizedValue && (!preferredType || itemType === preferredType);
    }) ||
    camisetas.find(item => getCamisetaShortLabel(item.id, item).toUpperCase() === normalizedValue) ||
    null;
};

export const formatCamisetaLabel = (sizeId?: string, camiseta?: any) => {
  const shortLabel = getCamisetaShortLabel(sizeId, camiseta);
  if (!shortLabel) return '';
  const type = getCamisetaType(sizeId, camiseta);
  return `${type} - ${shortLabel}`;
};

export const formatCamisetaShortLabel = (sizeId?: string, camiseta?: any) => getCamisetaShortLabel(sizeId, camiseta);
