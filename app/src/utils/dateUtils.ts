export const toDateValue = (value: any): Date | null => {
  if (!value) return null;
  if (typeof value === 'string') {
    const isoDateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoDateOnly) {
      const [, year, month, day] = isoDateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
    const brDateOnly = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (brDateOnly) {
      const [, day, month, year] = brDateOnly;
      return new Date(Number(year), Number(month) - 1, Number(day));
    }
  }
  const date = value?.toDate?.() || new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatDateBR = (value: any, fallback = '---') => {
  const date = toDateValue(value);
  if (!date) return fallback;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export const formatDateTimeBR = (value: any, fallback = '---') => {
  const date = toDateValue(value);
  if (!date) return fallback;
  return `${formatDateBR(date, fallback)} ${date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};
