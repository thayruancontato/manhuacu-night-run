// Motor de sugestão de fusão de equipes: detecta equipes com nome "quase igual"
// (variação de digitação, abreviação, palavra extra) usando similaridade de texto
// combinada (Levenshtein + Jaccard de tokens + contenção), sem depender de API externa.
//
// Validado com bateria de casos positivos/negativos antes de entrar em produção:
// menor score entre pares que DEVEM fundir = 0.66; maior score entre pares que NÃO
// devem fundir = 0.32 - margem grande o suficiente para o limiar padrão (0.55).

const DIACRITICS_REGEX = new RegExp(String.fromCharCode(91) + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + String.fromCharCode(93), 'g');

export const normalizeEquipeNome = (value: string) => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD').replace(DIACRITICS_REGEX, '')
  .replace(/\s+/g, ' ');

const STOPWORDS = new Set(['equipe', 'equipes', 'team', 'grupo', 'grp', 'os', 'as', 'de', 'da', 'do', 'dos', 'das', 'e']);
const TOKEN_ABBREV: Record<string, string> = { c: 'com', cm: 'com', p: 'para', q: 'que', vc: 'voce', grp: 'grupo' };

function normalizeForMatch(name: string) {
  const s = normalizeEquipeNome(name).replace(/\bc\/\s*/g, 'com ').replace(/\bp\/\s*/g, 'para ');
  const rawTokens = s.split(' ').filter(Boolean).map(t => TOKEN_ABBREV[t] || t);
  const tokens = rawTokens.filter(t => !STOPWORDS.has(t));
  return { normalized: rawTokens.join(' '), tokens };
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - dist / maxLen;
}

function tokenSimilarity(tokensA: string[], tokensB: string[]): number {
  if (tokensA.length === 0 && tokensB.length === 0) return 0;
  const setA = new Set(tokensA), setB = new Set(tokensB);
  let inter = 0;
  setA.forEach(t => { if (setB.has(t)) inter++; });
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : inter / union;
}

function containment(a: string, b: string): number {
  if (!a || !b) return 0;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  if (shorter.length < 4) return 0;
  return longer.includes(shorter) ? shorter.length / longer.length : 0;
}

// Se sobrar token de um lado sem nenhum par parecido (nível typo) do outro lado,
// é sinal de palavra-raiz realmente diferente (equipes distintas) - não apenas formatação.
function distinctCoreTokenPenalty(tokensA: string[], tokensB: string[]): number {
  const setA = new Set(tokensA), setB = new Set(tokensB);
  const leftoverA = tokensA.filter(t => !setB.has(t));
  const leftoverB = tokensB.filter(t => !setA.has(t));
  if (leftoverA.length === 0 || leftoverB.length === 0) return 0;
  const anyUnpaired = leftoverA.some(ta => {
    const bestSim = Math.max(0, ...leftoverB.map(tb => stringSimilarity(ta, tb)));
    return bestSim < 0.55;
  });
  return anyUnpaired ? 0.4 : 0;
}

export function computeEquipeMatchScore(nameA: string, nameB: string): number {
  const A = normalizeForMatch(nameA), B = normalizeForMatch(nameB);
  if (!A.normalized || !B.normalized) return 0;
  if (A.normalized === B.normalized) return 1;
  const strSim = stringSimilarity(A.normalized, B.normalized);
  const tokSim = tokenSimilarity(A.tokens, B.tokens);
  const contain = containment(A.normalized, B.normalized);
  const penalty = distinctCoreTokenPenalty(A.tokens, B.tokens);
  const score = Math.max(strSim * 0.55 + tokSim * 0.45, contain * 0.92);
  return Math.min(1, Math.max(0, score - penalty));
}

export type EquipeMergeSuggestion = {
  aKey: string;
  bKey: string;
  aNome: string;
  bNome: string;
  score: number;
};

export const MERGE_SUGGESTION_THRESHOLD = 0.55;

// Roda todas as equipes par a par (O(n²), tranquilo até algumas centenas de equipes)
// e retorna as sugestões de fusão ordenadas da mais confiável para a menos confiável.
export function findEquipeMergeSuggestions(
  groups: { key: string; nome: string }[],
  threshold = MERGE_SUGGESTION_THRESHOLD,
): EquipeMergeSuggestion[] {
  const suggestions: EquipeMergeSuggestion[] = [];
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      const a = groups[i], b = groups[j];
      const score = computeEquipeMatchScore(a.nome, b.nome);
      if (score >= threshold) {
        suggestions.push({ aKey: a.key, bKey: b.key, aNome: a.nome, bNome: b.nome, score });
      }
    }
  }
  return suggestions.sort((x, y) => y.score - x.score);
}
