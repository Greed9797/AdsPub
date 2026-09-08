import type { PolicyIssue } from '@adpub/shared';

/** R13: camada determinística de pré-checagem de política. */

export interface PolicyOptions {
  forbiddenTerms?: readonly string[];
  allowedClaims?: readonly string[];
}

interface PolicyRule {
  category: string;
  regex: RegExp;
  severity: PolicyIssue['severity'];
}

const BOUNDARY = '(?=[\\s,.!?;:]|$)';

const RULES: readonly PolicyRule[] = [
  {
    category: 'atributo_pessoal',
    regex: new RegExp(
      `(?:voc[êe]s?|tu)\\s+(?:é|e|est[áa]|tem|sofre|possui|precisa|luta|convive)${BOUNDARY}[^.!?]{0,60}`,
      'giu',
    ),
    severity: 'warning',
  },
  {
    category: 'antes_e_depois',
    regex: /antes\s+e\s+depois|antes\s*\/\s*depois/giu,
    severity: 'warning',
  },
  {
    category: 'promessa_de_resultado',
    regex:
      /resultad[oa]s?\s+garantid[oa]s?|garantimos\s+[^.!?]{0,40}|100\s*%\s*de\s*(?:resultado|sucesso|aprova[çc][ãa]o)|per[cç]a\s+\d+\s*(?:kg|quilos)|ganhe\s+R\$\s*[\d.]+\s+em\s+\d+\s+dias/giu,
    severity: 'warning',
  },
  {
    category: 'financeiro_irreal',
    regex: /renda\s+garantida|lucro\s+garantido|fique\s+rico|dinheiro\s+f[áa]cil/giu,
    severity: 'warning',
  },
  {
    category: 'saude_sensivel',
    regex: /(?:cura|curar)\s+(?:definitiv[ao]|garantid[ao]|para\s+sempre)/giu,
    severity: 'warning',
  },
  {
    category: 'pontuacao_excessiva',
    regex: /!{3,}|\?{3,}|!\?!/gu,
    severity: 'info',
  },
];

const CAPS_LIMIT = 0.3;
const CAPS_MIN_LETTERS = 12;

export function capsRatio(text: string): number {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length === 0) return 0;
  const upper = letters.replace(/[^\p{Lu}]/gu, '');
  return upper.length / letters.length;
}

function excerpt(text: string, match: string): string {
  const trimmed = match.trim().replace(/\s+/g, ' ');
  return trimmed.length > 90 ? `${trimmed.slice(0, 87)}…` : trimmed || text.slice(0, 60);
}

/** Devolve os problemas de política de um texto (copy completa concatenada). */
export function checkPolicy(text: string, options: PolicyOptions = {}): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  if (!text.trim()) return issues;

  for (const rule of RULES) {
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      issues.push({
        category: rule.category,
        excerpt: excerpt(text, match[0]),
        severity: rule.severity,
        source: 'rules',
      });
      if (match[0].length === 0) break;
    }
  }

  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters.length >= CAPS_MIN_LETTERS && capsRatio(text) > CAPS_LIMIT) {
    issues.push({
      category: 'caixa_alta',
      excerpt: `${Math.round(capsRatio(text) * 100)}% do texto em maiúsculas`,
      severity: 'warning',
      source: 'rules',
    });
  }

  for (const term of options.forbiddenTerms ?? []) {
    const clean = term.trim();
    if (!clean) continue;
    const regex = new RegExp(`(^|[^\\p{L}])${escapeRegex(clean)}([^\\p{L}]|$)`, 'giu');
    if (regex.test(text)) {
      issues.push({
        category: 'termo_proibido',
        excerpt: clean,
        severity: 'error',
        source: 'rules',
      });
    }
  }

  return dedupe(issues);
}

function dedupe(issues: PolicyIssue[]): PolicyIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.category}|${issue.excerpt.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
