import { SCOPE_LABELS, SCOPE_READ, SCOPE_WRITE } from './scopes.js';

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

const STYLE = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: #0c0c0d; color: #f5f4ef;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main {
    width: 100%; max-width: 30rem; padding: 32px; border-radius: 14px;
    background: #141416; border: 1px solid rgba(235, 235, 240, 0.12);
  }
  h1 { margin: 0; font-size: 1.5rem; letter-spacing: 0.01em; }
  .brand { color: #ff5701; }
  p { margin: 8px 0 0; font-size: 0.875rem; color: #a8a29e; line-height: 1.5; }
  ul { margin: 16px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
  li { display: flex; gap: 10px; font-size: 0.875rem; line-height: 1.4; }
  label { display: flex; gap: 10px; align-items: flex-start; cursor: pointer; }
  input[type="checkbox"] { margin-top: 2px; width: 16px; height: 16px; accent-color: #ff5701; }
  .muted { color: #a8a29e; }
  .warn { color: #f59e0b; }
  .who { margin-top: 16px; padding: 12px; border-radius: 10px; background: #1e1e21; font-size: 0.8125rem; }
  .row { display: flex; gap: 10px; margin-top: 24px; }
  button {
    flex: 1; height: 40px; border-radius: 10px; font-size: 0.875rem; font-weight: 600;
    cursor: pointer; border: 1px solid transparent;
  }
  .approve { background: #ff5701; color: #1a1005; }
  .approve:hover { background: #c94100; color: #fff; }
  .deny { background: transparent; color: #f5f4ef; border-color: rgba(235, 235, 240, 0.24); }
  .deny:hover { background: #1e1e21; }
  a { color: #ff5701; }
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>${body}</main>
</body>
</html>`;
}

export interface ConsentView {
  clientName: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
  resource: string | null;
  csrf: string;
  userName: string;
  userEmail: string;
  userRole: string;
  writeAllowed: boolean;
}

export function renderConsent(view: ConsentView): string {
  const hidden = [
    ['csrf', view.csrf],
    ['client_id', view.clientId],
    ['redirect_uri', view.redirectUri],
    ['state', view.state],
    ['code_challenge', view.codeChallenge],
    ['resource', view.resource ?? ''],
  ]
    .map(
      ([name, value]) =>
        `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
    )
    .join('\n      ');

  const body = `
  <h1>AdPub<span class="brand">.</span></h1>
  <p>O aplicativo <strong>${escapeHtml(view.clientName)}</strong> quer acessar o AdPub em seu nome.</p>
  <div class="who">
    <strong>${escapeHtml(view.userName || view.userEmail)}</strong><br>
    <span class="muted">${escapeHtml(view.userEmail)}</span>
  </div>
  <form method="post" action="/authorize">
      ${hidden}
    <ul>
      <li><span class="muted">✓</span> ${escapeHtml(SCOPE_LABELS[SCOPE_READ] ?? SCOPE_READ)}</li>
      <li>${view.writeAllowed ? `<label><input type="checkbox" name="scope_write" value="1"><span>${escapeHtml(SCOPE_LABELS[SCOPE_WRITE] ?? SCOPE_WRITE)}<br><span class="warn">Publicar cria anúncios de verdade e gasta verba da conta.</span></span></label>` : `<span class="muted">Sem permissão de alteração para o papel ${escapeHtml(view.userRole)} (somente leitura).</span>`}
      </li>
    </ul>
    <p class="muted">O acesso vale 30 dias, renova sozinho enquanto estiver em uso e pode ser cortado desconectando o aplicativo.</p>
    <div class="row">
      <button class="deny" type="submit" name="decision" value="deny">Recusar</button>
      <button class="approve" type="submit" name="decision" value="approve">Autorizar</button>
    </div>
  </form>`;

  return shell('Conectar ao AdPub', body);
}

export function renderConsentError(message: string): string {
  return shell(
    'AdPub',
    `<h1>AdPub<span class="brand">.</span></h1>
     <p>${escapeHtml(message)}</p>
     <p><a href="/">Voltar ao AdPub</a></p>`,
  );
}
