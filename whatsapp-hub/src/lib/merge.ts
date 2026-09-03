/** Resolve merge fields `{{chave}}` / `{{chave.aninhada}}` contra um objeto de dados livre —
 *  o Hub nunca sabe o que essas chaves significam, só faz a substituição textual. */
export function resolveMergeFields(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((acc, key) => {
      if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
        return (acc as Record<string, unknown>)[key];
      }
      return undefined;
    }, data);
    return value === undefined || value === null ? "" : String(value);
  });
}

export function xmlEscape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c] as string)
  );
}
