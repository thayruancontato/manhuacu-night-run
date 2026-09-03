/** Matcher mínimo de cron de 5 campos (min hora dia-mês mês dia-semana) — sem dependência
 *  externa. Suporta asterisco, número, lista "1,2,3" e passo "star-slash-N". Suficiente para
 *  "todo dia às 9h", "toda segunda", "a cada 15 minutos" etc. — não cobre ranges tipo "1-5". */
function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;
  return field.split(",").some((part) => {
    if (part.startsWith("*/")) {
      const step = Number(part.slice(2));
      return step > 0 && value % step === 0;
    }
    return Number(part) === value;
  });
}

export function cronMatches(cronExpr: string, date: Date): boolean {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [min, hour, dom, month, dow] = parts;
  return (
    fieldMatches(min, date.getUTCMinutes()) &&
    fieldMatches(hour, date.getUTCHours()) &&
    fieldMatches(dom, date.getUTCDate()) &&
    fieldMatches(month, date.getUTCMonth() + 1) &&
    fieldMatches(dow, date.getUTCDay())
  );
}
