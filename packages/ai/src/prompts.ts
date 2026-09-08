import { readFileSync } from 'node:fs';

/** R12: prompts versionados em arquivos .md, carregados sob demanda. */
export const PROMPT_VERSIONS = {
  plan: 'plan.v1',
  copy: 'copy.v1',
  policy: 'policy.v1',
} as const;

export type PromptName = keyof typeof PROMPT_VERSIONS;

const cache = new Map<PromptName, string>();

export function loadPrompt(name: PromptName): string {
  const cached = cache.get(name);
  if (cached) return cached;
  const file = `${PROMPT_VERSIONS[name]}.md`;
  const url = new URL(`../prompts/${file}`, import.meta.url);
  const content = readFileSync(url, 'utf8');
  cache.set(name, content);
  return content;
}
