// Apoio aos testes do experimento: condição em teste, dados mínimos do
// produto, transações com o usuário registrador e leitura dos eventos.

import { Client } from 'pg';
import { conectar } from '../src/banco';
import { EventoBruto, HASH_INICIAL, hashEvento, serializar } from '../src/serializacao';

export type Condicao = 'a' | 'b';

export const CONDICAO = (process.env.EXPERIMENTO_CONDICAO ?? '') as Condicao;
if (CONDICAO !== 'a' && CONDICAO !== 'b') {
  throw new Error('Defina EXPERIMENTO_CONDICAO=a ou b (use npm run exp:test).');
}

// Confere que o banco recriado está mesmo na condição em teste.
export async function conferirCondicao(client: Client): Promise<void> {
  const { rows } = await client.query(
    `SELECT to_regclass('audit.cadeias') IS NOT NULL AS tem_cadeias`,
  );
  const noBanco: Condicao = rows[0].tem_cadeias === 't' ? 'b' : 'a';
  if (noBanco !== CONDICAO) {
    throw new Error(`Banco na condição ${noBanco.toUpperCase()}, testes esperam ${CONDICAO.toUpperCase()}.`);
  }
}

export { conectar };

export interface EventoLido extends EventoBruto {
  id: string;
  hash_anterior: string | null;
  hash: string | null;
}

// Executa `fn` numa transação; com `usuario`, define app.usuario_id antes.
export async function emTransacao<T>(
  client: Client, usuario: string | null, fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    if (usuario !== null) {
      await client.query(`SELECT set_config('app.usuario_id', $1, true)`, [usuario]);
    }
    const resultado = await fn();
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function inserir(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  const { rows } = await client.query(`${sql} RETURNING id`, params);
  return rows[0].id as string;
}

let sequencial = 0;

// Pessoas, uma Casa e uma categoria novas a cada chamada: cada teste tem a
// sua própria cadeia, sem depender da ordem dos testes.
export async function criarCenario(client: Client) {
  sequencial += 1;
  const marca = `${Date.now()}-${sequencial}`;
  const ana = await inserir(client, 'INSERT INTO pessoas (nome) VALUES ($1)', [`Ana ${marca}`]);
  const bia = await inserir(client, 'INSERT INTO pessoas (nome) VALUES ($1)', [`Bia ${marca}`]);
  const casa = await inserir(client, 'INSERT INTO casas (nome) VALUES ($1)', [`Casa ${marca}`]);
  const outraCasa = await inserir(client, 'INSERT INTO casas (nome) VALUES ($1)', [`Outra ${marca}`]);
  const categoria = await inserir(client, 'INSERT INTO categorias (nome) VALUES ($1)', [`Cat ${marca}`]);
  return { ana, bia, casa, outraCasa, categoria };
}

export async function inserirCompra(
  client: Client,
  c: { casa: string; pessoa: string; lancador: string | null; categoria: string; valores: string[] },
): Promise<{ compra: string; parcelas: string[] }> {
  const compra = await inserir(
    client,
    `INSERT INTO compras (casa_id, pessoa_id, lancado_por_id, categoria_id, descricao, data, competencia, total_parcelas)
     VALUES ($1, $2, $3, $4, 'Mercado', '2026-12-02', '2026-12', $5)`,
    [c.casa, c.pessoa, c.lancador, c.categoria, c.valores.length],
  );
  const parcelas: string[] = [];
  for (const [i, valor] of c.valores.entries()) {
    parcelas.push(await inserir(
      client,
      `INSERT INTO parcelas (compra_id, numero_parcela, valor, data_propria)
       VALUES ($1, $2, $3, '2026-12-02')`,
      [compra, i + 1, valor],
    ));
  }
  return { compra, parcelas };
}

export async function inserirReceita(
  client: Client, r: { casa: string; pessoa: string | null; lancador: string | null; valor: string },
): Promise<string> {
  return inserir(
    client,
    `INSERT INTO receitas (casa_id, pessoa_id, lancado_por_id, valor_liquido, data, competencia)
     VALUES ($1, $2, $3, $4, '2026-12-05', '2026-12')`,
    [r.casa, r.pessoa, r.lancador, r.valor],
  );
}

export async function eventosDaCasa(client: Client, casa: string): Promise<EventoLido[]> {
  const { rows } = await client.query(
    `SELECT id, casa_id, indice, operacao, entidade, entidade_id, pessoa_responsavel_id,
            usuario_registrador_id, ocorrido_em, conteudo, hash_anterior, hash
       FROM audit.eventos WHERE casa_id = $1 ORDER BY id`,
    [casa],
  );
  return rows as EventoLido[];
}

// Recalcula a cadeia de uma Casa em Node, a partir do texto bruto, e
// devolve o primeiro problema encontrado (ou null). Versão mínima, só para
// os testes do bloco 2; o verificador completo é o do bloco 3.
export function problemaNaCadeia(eventos: EventoLido[]): string | null {
  const ordenados = [...eventos].sort((x, y) => Number(x.indice) - Number(y.indice));
  let anterior = HASH_INICIAL;
  for (const [i, e] of ordenados.entries()) {
    if (Number(e.indice) !== i + 1) return `índice ${e.indice} na posição ${i + 1}`;
    if (e.hash_anterior !== anterior) return `hash_anterior divergente no índice ${e.indice}`;
    if (hashEvento(anterior, serializar(e)) !== e.hash) return `hash divergente no índice ${e.indice}`;
    anterior = e.hash as string;
  }
  return null;
}
