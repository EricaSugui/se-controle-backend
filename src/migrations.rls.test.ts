// Toda tabela criada pelas migrations precisa ligar o RLS nas próprias
// migrations.
//
// O schema public fica exposto pela API REST do Supabase e a chave anon é
// pública no app: tabela sem RLS pode ser lida, alterada e apagada por
// qualquer pessoa. Não dá para confiar no event trigger `ensure_rls` da
// plataforma: ele existe no TCC e no DEV local (supabase/paridade-plataforma.sql),
// mas faltou em PROD, e onboarding_pessoas ficou exposta (alerta
// rls_disabled_in_public, 22/11/2026). Por isso o teste olha as migrations,
// e não um banco: no banco local o trigger esconderia o problema.
//
// Cada migration roda (só o `up`, em ordem) contra um `pgm` falso que anota
// criação, remoção, renomeação e os ALTER TABLE ... ROW LEVEL SECURITY. Assim
// laços como `for (const tabela of TABELAS)` são avaliados de verdade.

import fs from 'fs';
import path from 'path';

const PASTA = path.join(__dirname, '..', 'migrations');

type Estado = Map<string, boolean>; // tabela → RLS ligado?

function nomeTabela(nome: unknown): string {
  if (typeof nome === 'string') return nome.replace(/^public\./, '').replace(/"/g, '');
  if (nome && typeof nome === 'object' && 'name' in nome) {
    return String((nome as { name: string }).name);
  }
  throw new Error('Nome de tabela inesperado: ' + JSON.stringify(nome));
}

const IDENT = String.raw`(?:"?public"?\.)?"?([a-z_][a-z0-9_]*)"?`;
const RE_CREATE = new RegExp(String.raw`CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?` + IDENT, 'gi');
const RE_DROP = new RegExp(String.raw`DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?` + IDENT, 'gi');
const RE_RLS = new RegExp(
  String.raw`ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?` + IDENT + String.raw`\s+(ENABLE|DISABLE)\s+ROW\s+LEVEL\s+SECURITY`,
  'gi',
);

function aplicarSql(sql: string, estado: Estado) {
  for (const m of sql.matchAll(RE_CREATE)) estado.set(m[1], false);
  for (const m of sql.matchAll(RE_DROP)) estado.delete(m[1]);
  for (const m of sql.matchAll(RE_RLS)) {
    if (estado.has(m[1])) estado.set(m[1], m[2].toUpperCase() === 'ENABLE');
  }
}

function pgmFalso(estado: Estado) {
  const conhecidos: Record<string, (...args: any[]) => unknown> = {
    createTable: (nome) => {
      estado.set(nomeTabela(nome), false);
    },
    dropTable: (nome) => {
      estado.delete(nomeTabela(nome));
    },
    renameTable: (de, para) => {
      const rls = estado.get(nomeTabela(de)) ?? false;
      estado.delete(nomeTabela(de));
      estado.set(nomeTabela(para), rls);
    },
    sql: (sql: string) => aplicarSql(sql, estado),
    func: (expr: string) => expr,
  };
  // Demais operações (colunas, índices, constraints...) não mudam o RLS.
  return new Proxy(conhecidos, {
    get: (alvo, prop: string) => alvo[prop] ?? (() => undefined),
  });
}

async function simular(ignorar: string[] = []): Promise<Estado> {
  const estado: Estado = new Map();
  const arquivos = fs
    .readdirSync(PASTA)
    .filter((f) => f.endsWith('.js') && !ignorar.includes(f))
    .sort();
  for (const arquivo of arquivos) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const migration = require(path.join(PASTA, arquivo));
    await migration.up(pgmFalso(estado));
  }
  return estado;
}

function semRls(estado: Estado): string[] {
  return [...estado].filter(([, rls]) => !rls).map(([tabela]) => tabela).sort();
}

describe('migrations: RLS em todas as tabelas', () => {
  it('toda tabela criada pelas migrations termina com RLS ligado', async () => {
    const estado = await simular();
    expect(estado.size).toBeGreaterThan(0);

    const faltando = semRls(estado);
    if (faltando.length > 0) {
      throw new Error(
        `Tabela(s) sem RLS: ${faltando.join(', ')}.\n` +
          'Adicione na migration que cria a tabela:\n' +
          "  pgm.sql('ALTER TABLE <tabela> ENABLE ROW LEVEL SECURITY;');",
      );
    }
  });

  it('acusa onboarding_pessoas quando falta a migration que corrigiu o RLS', async () => {
    const estado = await simular(['1785100000001_enable-rls-onboarding-pessoas.js']);
    expect(semRls(estado)).toEqual(['onboarding_pessoas']);
  });
});
