import { describe, expect, it } from 'vitest';
import { clientNameFromRedirects, isValidRedirectUri } from '../src/oauth/redirect.js';

describe('isValidRedirectUri', () => {
  it('aceita os callbacks dos três connectors e do Cursor', () => {
    expect(isValidRedirectUri('https://claude.ai/api/mcp/auth_callback')).toBe(true);
    expect(isValidRedirectUri('https://claude.com/api/mcp/auth_callback')).toBe(true);
    expect(isValidRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true);
    expect(isValidRedirectUri('https://chatgpt.com/connector/oauth/abc')).toBe(true);
    expect(isValidRedirectUri('https://grok.com/connectors/oauth/callback')).toBe(true);
    expect(isValidRedirectUri('https://www.cursor.com/agents/mcp/oauth/callback')).toBe(true);
    expect(isValidRedirectUri('http://localhost:8787/callback')).toBe(true);
  });

  it('recusa http remoto e https fora da lista', () => {
    expect(isValidRedirectUri('http://exemplo.invalido/callback')).toBe(false);
    expect(isValidRedirectUri('https://cliente.exemplo/callback')).toBe(false);
    expect(isValidRedirectUri('https://evilclaude.ai/callback')).toBe(false);
    expect(isValidRedirectUri('cursor://oauth/callback')).toBe(false);
  });
});

describe('clientNameFromRedirects', () => {
  it('nomeia Grok, ChatGPT e Claude pelo host do callback', () => {
    expect(clientNameFromRedirects(['https://www.cursor.com/agents/mcp/oauth/callback'])).toBe(
      'Cursor (Grok)',
    );
    expect(clientNameFromRedirects(['https://chatgpt.com/connector_platform_oauth_redirect'])).toBe(
      'ChatGPT',
    );
    expect(clientNameFromRedirects(['https://claude.ai/api/mcp/auth_callback'])).toBe('Claude');
    expect(clientNameFromRedirects(['https://grok.com/oauth/callback'])).toBe('Grok');
    expect(clientNameFromRedirects(['https://desconhecido.example/cb'], 'Outro')).toBe('Outro');
  });
});
