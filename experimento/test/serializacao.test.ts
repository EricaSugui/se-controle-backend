// Bloco 1: a serialização em PL/pgSQL e em TypeScript dá o mesmo resultado
// em todos os vetores fixos, e o formato está congelado (decisão 3).
//
// Requer o banco de medição de pé (npm run exp:test recria antes).

import { Client } from 'pg';
import { conectar } from '../src/banco';
import {
  EventoBruto, HASH_INICIAL, campo, dataCanonica, hashEvento, serializar,
} from '../src/serializacao';

// Cada vetor é uma linha de audit.eventos escrita como expressões SQL. A
// linha é montada no Postgres (ROW(...)::audit.eventos), sem passar pelas
// constraints, e lida pela conexão em texto bruto, como o verificador lê.
interface Vetor {
  nome: string;
  casa_id: string;
  indice: string;
  operacao: string;
  entidade: string;
  entidade_id: string;
  pessoa_responsavel_id: string;
  usuario_registrador_id: string;
  ocorrido_em: string;
  conteudo: string;
}

const VETORES: Vetor[] = [
  {
    nome: 'inclusão comum',
    casa_id: '1', indice: '1', operacao: `'INSERT'`, entidade: `'compras'`, entidade_id: '10',
    pessoa_responsavel_id: '2', usuario_registrador_id: '3',
    ocorrido_em: `'2026-12-02 10:00:00.123456+00'`,
    conteudo: `'{"antes": null, "depois": {"id": 10, "descricao": "Mercado"}}'`,
  },
  {
    nome: 'nulos (índice de A, sem responsável) e microssegundos zerados',
    casa_id: '1', indice: 'NULL', operacao: `'DELETE'`, entidade: `'parcelas'`, entidade_id: '7',
    pessoa_responsavel_id: 'NULL', usuario_registrador_id: '3',
    ocorrido_em: `'2026-12-02 00:00:00+00'`,
    conteudo: `'{"antes": {"id": 7}, "depois": null}'`,
  },
  {
    nome: 'texto com acento, dois-pontos, vírgula e til; fração curta',
    casa_id: '2', indice: '15', operacao: `'UPDATE'`, entidade: `'compras'`, entidade_id: '11',
    pessoa_responsavel_id: '2', usuario_registrador_id: '2',
    ocorrido_em: `'2026-12-02 10:00:00.1+00'`,
    conteudo: `'{"antes": {"descricao": "Pão"}, "depois": {"descricao": "Pão de açúcar: 1,5 kg ~ promoção"}}'`,
  },
  {
    nome: 'emoji (4 bytes em UTF-8)',
    casa_id: '3', indice: '2', operacao: `'INSERT'`, entidade: `'receitas'`, entidade_id: '5',
    pessoa_responsavel_id: '4', usuario_registrador_id: '3',
    ocorrido_em: `'2026-12-02 10:00:00.000001+00'`,
    conteudo: `'{"antes": null, "depois": {"observacao": "Presente 🎁"}}'`,
  },
  {
    nome: 'valores numeric(12,2) com e sem centavos',
    casa_id: '1', indice: '3', operacao: `'INSERT'`, entidade: `'parcelas'`, entidade_id: '8',
    pessoa_responsavel_id: '2', usuario_registrador_id: '3',
    ocorrido_em: `'2026-12-02 10:00:00.5+00'`,
    conteudo: `jsonb_build_object('antes', NULL, 'depois', jsonb_build_object(
      'inteiro', 10::numeric(12,2), 'meio', 0.5::numeric(12,2),
      'centavo', 0.01::numeric(12,2), 'grande', 1234567890.12::numeric(12,2)))`,
  },
  {
    nome: 'virada do dia e do ano em UTC (registrado em -03)',
    casa_id: '1', indice: '4', operacao: `'INSERT'`, entidade: `'receitas'`, entidade_id: '6',
    pessoa_responsavel_id: '2', usuario_registrador_id: '3',
    ocorrido_em: `'2026-12-31 23:59:59.999999-03'`,
    conteudo: `'{"antes": null, "depois": {"id": 6}}'`,
  },
  {
    nome: 'chaves fora de ordem, aninhamento, lista e nulo dentro do JSON',
    casa_id: '1', indice: '5', operacao: `'UPDATE'`, entidade: `'compras'`, entidade_id: '12',
    pessoa_responsavel_id: '2', usuario_registrador_id: '3',
    ocorrido_em: `'2026-12-02 10:00:00.654321+00'`,
    conteudo: `'{"depois": {"b": 1, "a": {"z": null, "y": [1, 2]}}, "antes": {"b": 0}}'`,
  },
];

const COLUNAS = [
  'casa_id', 'indice', 'operacao', 'entidade', 'entidade_id', 'pessoa_responsavel_id',
  'usuario_registrador_id', 'ocorrido_em', 'conteudo',
] as const;

// Ordem das colunas de audit.eventos: id, casa_id, indice, operacao,
// entidade, entidade_id, pessoa_responsavel_id, usuario_registrador_id,
// ocorrido_em, conteudo, hash_anterior, hash.
function consultaDoVetor(v: Vetor): string {
  return `
    SELECT ${COLUNAS.map((c) => `(r).${c}`).join(', ')},
           audit.serializar(r) AS serializacao_pg,
           audit.hash_evento(audit.hash_inicial(), audit.serializar(r)) AS hash_pg
    FROM (SELECT ROW(
      NULL::bigint, (${v.casa_id})::integer, (${v.indice})::bigint, (${v.operacao})::text,
      (${v.entidade})::text, (${v.entidade_id})::bigint, (${v.pessoa_responsavel_id})::integer,
      (${v.usuario_registrador_id})::integer, (${v.ocorrido_em})::timestamptz,
      (${v.conteudo})::jsonb, NULL::char(64), NULL::char(64)
    )::audit.eventos AS r) s`;
}

let client: Client;

beforeAll(async () => {
  client = await conectar();
});

afterAll(async () => {
  await client?.end();
});

async function lerVetor(v: Vetor) {
  const { rows } = await client.query(consultaDoVetor(v));
  const linha = rows[0];
  const evento = Object.fromEntries(COLUNAS.map((c) => [c, linha[c]])) as unknown as EventoBruto;
  return { evento, serializacaoPg: linha.serializacao_pg as string, hashPg: linha.hash_pg as string };
}

describe('serialização canônica: PL/pgSQL × TypeScript', () => {
  test.each(VETORES.map((v) => [v.nome, v] as const))('%s', async (_nome, v) => {
    const { evento, serializacaoPg, hashPg } = await lerVetor(v);
    expect(serializar(evento)).toBe(serializacaoPg);
    expect(hashEvento(HASH_INICIAL, serializar(evento))).toBe(hashPg);
  });
});

describe('formato congelado (v1)', () => {
  test('inclusão comum', async () => {
    const { serializacaoPg } = await lerVetor(VETORES[0]);
    expect(serializacaoPg).toBe(
      '2:v1,1:1,1:1,6:INSERT,7:compras,2:10,1:2,1:3,' +
      '27:2026-12-02T10:00:00.123456Z,' +
      '61:{"antes": null, "depois": {"id": 10, "descricao": "Mercado"}},',
    );
  });

  test('nulos e microssegundos zerados', async () => {
    const { serializacaoPg } = await lerVetor(VETORES[1]);
    expect(serializacaoPg).toBe(
      '2:v1,1:1,~6:DELETE,8:parcelas,1:7,~1:3,' +
      '27:2026-12-02T00:00:00.000000Z,' +
      '36:{"antes": {"id": 7}, "depois": null},',
    );
  });

  test('numeric(12,2) sai sempre com 2 casas no conteúdo', async () => {
    const { evento } = await lerVetor(VETORES[4]);
    expect(evento.conteudo).toContain('"inteiro": 10.00');
    expect(evento.conteudo).toContain('"meio": 0.50');
    expect(evento.conteudo).toContain('"centavo": 0.01');
    expect(evento.conteudo).toContain('"grande": 1234567890.12');
  });

  test('virada do ano convertida para UTC', async () => {
    const { evento } = await lerVetor(VETORES[5]);
    expect(dataCanonica(evento.ocorrido_em)).toBe('2027-01-01T02:59:59.999999Z');
  });
});

describe('peças da serialização', () => {
  test('tamanho em bytes UTF-8, não em caracteres', () => {
    expect(campo('ã')).toBe('2:ã,');
    expect(campo('🎁')).toBe('4:🎁,');
    expect(campo('')).toBe('0:,');
    expect(campo(null)).toBe('~');
  });

  test('nulo e texto "~" não se confundem', () => {
    expect(campo(null)).not.toBe(campo('~'));
  });

  test('data fora de UTC é recusada', () => {
    expect(() => dataCanonica('2026-12-02 10:00:00+03')).toThrow(/UTC/);
  });
});

describe('hash (SHA-256)', () => {
  // Vetor oficial do FIPS 180-4 / NIST: SHA-256("abc").
  const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

  test('vetor do NIST nos dois lados', async () => {
    expect(hashEvento('', 'abc')).toBe(SHA256_ABC);
    const { rows } = await client.query(`SELECT audit.hash_evento('', 'abc') AS h`);
    expect(rows[0].h).toBe(SHA256_ABC);
  });

  test('hash inicial igual nos dois lados', async () => {
    const { rows } = await client.query('SELECT audit.hash_inicial() AS h');
    expect(rows[0].h).toBe(HASH_INICIAL);
  });

  test('o hash anterior muda o resultado', () => {
    const s = 'mesma serialização';
    expect(hashEvento(HASH_INICIAL, s)).not.toBe(hashEvento('f'.repeat(64), s));
  });
});
