import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Forbidden } from '../src/components/forbidden';
import { LoadingSkeleton } from '../src/components/loading-skeleton';

describe('estados (RDS-72, RDS-73)', () => {
  it('o esqueleto anuncia que está carregando e desenha as linhas da lista', () => {
    const html = renderToStaticMarkup(<LoadingSkeleton linhas={4} />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('Carregando');
    expect((html.match(/ap-skel__linha/g) ?? []).length).toBe(4);
  });

  it('a página de permissão diz o papel e o motivo, e leva de volta aos lotes', () => {
    const html = renderToStaticMarkup(<Forbidden papel="Leitor" />);
    expect(html).toContain('Você não tem acesso a esta página');
    expect(html).toContain('Seu papel hoje é Leitor');
    expect(html).toContain('href="/"');
  });

  it('sem papel conhecido a mensagem continua explicando', () => {
    const html = renderToStaticMarkup(<Forbidden />);
    expect(html).toContain('Seu papel não permite abrir esta página.');
  });
});
