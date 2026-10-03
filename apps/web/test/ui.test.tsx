import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge } from '../src/components/ui/badge';
import { Button } from '../src/components/ui/button';
import { Dialog } from '../src/components/ui/dialog';
import { Field } from '../src/components/ui/field';
import { Selo } from '../src/components/ui/selo';
import { Table, TableCell, TableRow } from '../src/components/ui/table';
import { seloParaStatus, type SeloTone } from '../src/lib/selo';

const html = (node: React.ReactElement) => renderToStaticMarkup(node);

describe('Button', () => {
  it('renderiza <button type="button"> com o rótulo e a variante', () => {
    const out = html(<Button variant="primary" label="Novo lote" />);
    expect(out).toContain('<button');
    expect(out).toContain('type="button"');
    expect(out).toContain('ap-btn--primary');
    expect(out).toContain('>Novo lote<');
  });

  it('usa type="submit" quando pedido e desabilita com isDisabled', () => {
    const out = html(<Button variant="secondary" label="Salvar" type="submit" isDisabled />);
    expect(out).toContain('type="submit"');
    expect(out).toContain('disabled=""');
    expect(out).toContain('ap-btn--secondary');
  });

  it('renderiza um link <a href> quando há href', () => {
    const out = html(<Button variant="primary" label="Abrir" href="/lotes/1" />);
    expect(out).toContain('<a ');
    expect(out).toContain('href="/lotes/1"');
    expect(out).not.toContain('<button');
  });

  it.each(['primary', 'secondary', 'ghost', 'destructive'] as const)('aceita a variante %s', (variant) => {
    expect(html(<Button variant={variant} label="x" />)).toContain(`ap-btn--${variant}`);
  });
});

describe('Selo', () => {
  const TONS: Array<[string, SeloTone, string]> = [
    ['draft', 'rascunho', 'Rascunho'],
    ['blocked', 'bloqueado', 'Bloqueado'],
    ['ready', 'pronto', 'Pronto'],
    ['queued', 'fila', 'Na fila'],
    ['uploading_media', 'publicando', 'Publicando'],
    ['creating_ad', 'publicando', 'Publicando'],
    ['published', 'publicado', 'Publicado'],
    ['in_review', 'analise', 'Em análise'],
    ['approved', 'aprovado', 'Aprovado'],
    ['disapproved', 'reprovado', 'Reprovado'],
    ['failed', 'falhou', 'Falhou'],
    ['needs_reconciliation', 'conferir', 'Conferir'],
    ['partial', 'falhou', 'Parcial'],
    ['done', 'publicado', 'Concluído'],
  ];

  it.each(TONS)('o status %s vira o selo %s com o texto "%s"', (status, tone, label) => {
    expect(seloParaStatus(status)).toEqual({ tone, label });
  });

  it('um status desconhecido vira selo neutro com o texto do status', () => {
    expect(seloParaStatus('nao_existe')).toEqual({ tone: 'neutro', label: 'nao_existe' });
  });

  it('renderiza o texto do estado e o tom como atributo', () => {
    const out = html(<Selo status="needs_reconciliation" />);
    expect(out).toContain('data-tone="conferir"');
    expect(out).toContain('>Conferir<');
  });

  it('o texto pode ser trocado sem mudar o tom', () => {
    const out = html(<Selo status="queued" label="8 na fila" />);
    expect(out).toContain('data-tone="fila"');
    expect(out).toContain('>8 na fila<');
  });
});

describe('Table', () => {
  it('renderiza <table> com um <th> por coluna e <tr>/<td> por linha, em região rolável', () => {
    const out = html(
      <Table head={['Lote', 'Estado']}>
        <TableRow>
          <TableCell>LT-0412</TableCell>
          <TableCell className="numeric">12</TableCell>
        </TableRow>
      </Table>,
    );
    expect(out).toContain('role="region"');
    expect((out.match(/<th[ >]/g) ?? []).length).toBe(2);
    expect(out).toContain('<td');
    expect(out).toContain('<td class="ap-td numeric">12</td>');
  });
});

describe('Dialog', () => {
  it('usa o elemento nativo <dialog> rotulado pelo título', () => {
    const out = html(
      <Dialog isOpen={false} onOpenChange={() => undefined} aria-labelledby="t1">
        <h2 id="t1">Confirmar</h2>
      </Dialog>,
    );
    expect(out).toContain('<dialog');
    expect(out).toContain('aria-labelledby="t1"');
  });
});

describe('Field', () => {
  it('associa o rótulo e a dica ao controle', () => {
    const out = html(
      <Field label="Nome do lote" hint="Use um nome fácil de achar">
        <input id="nome" />
      </Field>,
    );
    expect(out).toContain('<label');
    expect(out).toContain('for="nome"');
    expect(out).toContain('aria-describedby="nome-description"');
    expect(out).toContain('id="nome-description"');
    expect(out).toContain('Use um nome fácil de achar');
  });
});

describe('Badge', () => {
  it('preserva conteúdo composto em vez de transformá-lo em texto', () => {
    const out = html(
      <Badge tone="ok">
        {3} válida(s)
      </Badge>,
    );
    expect(out).toContain('3');
    expect(out).toContain(' válida(s)');
    expect(out).not.toContain('3, ');
  });
});
