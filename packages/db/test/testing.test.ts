import { afterEach, describe, expect, it } from 'vitest';
import { assertTruncateAllowed, TRUNCATE_OPT_IN } from '../src/testing.js';

const LOCAL = 'postgres://adpub:adpub@127.0.0.1:55432/adpub';

afterEach(() => {
  delete process.env[TRUNCATE_OPT_IN];
});

describe('assertTruncateAllowed', () => {
  it('exige o opt-in explícito', () => {
    expect(() => assertTruncateAllowed(LOCAL)).toThrow(new RegExp(TRUNCATE_OPT_IN));
  });

  it('libera banco local e banco com sufixo de teste', () => {
    process.env[TRUNCATE_OPT_IN] = '1';
    expect(() => assertTruncateAllowed(LOCAL)).not.toThrow();
    expect(() => assertTruncateAllowed('postgres://u:p@localhost:5432/adpub')).not.toThrow();
    expect(() => assertTruncateAllowed('postgres://u:p@ci-runner:5432/adpub_e2e')).not.toThrow();
    expect(() => assertTruncateAllowed('postgres://u:p@ci-runner:5432/qualquer_test')).not.toThrow();
  });

  it('recusa banco remoto com o mesmo nome de sempre', () => {
    // `adpub` é o nome do banco em dev E em produção: só o nome não autoriza nada.
    process.env[TRUNCATE_OPT_IN] = '1';
    expect(() => assertTruncateAllowed('postgres://u:p@db.prod:5432/adpub')).toThrow(
      /não é um banco descartável/,
    );
    expect(() => assertTruncateAllowed('postgres://u:p@db.abc.supabase.co:5432/postgres')).toThrow(
      /não é um banco descartável/,
    );
  });
});
