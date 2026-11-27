// Checkpoint confiável da condição B (decisão 4).
//
// Guarda, para cada Casa, o índice do último evento confirmado, o hash
// esperado nesse índice e a quantidade de eventos até ele. Fica FORA do
// banco testado: um arquivo JSON na pasta da rodada. Pelo modelo de ameaça,
// o agente que adultera o banco não altera o checkpoint.

import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { VERSAO_FORMATO } from './serializacao';

export interface CheckpointCasa {
  casa_id: string;
  indice: string;      // último índice confirmado (texto, como vem do banco)
  hash: string;        // hash esperado nesse índice
  quantidade: string;  // eventos da Casa com índice <= indice
}

export interface Checkpoint {
  formato: typeof VERSAO_FORMATO;
  criado_em: string;
  cadeias: CheckpointCasa[];
}

// Lê a cabeça de cada cadeia numa transação REPEATABLE READ (fotografia
// consistente) e confere que o evento da cabeça existe com o mesmo hash e
// que a quantidade bate. O checkpoint só é criado sobre uma cadeia que
// está, nesse momento, coerente.
export async function criarCheckpoint(client: Client): Promise<Checkpoint> {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const { rows } = await client.query(`
      SELECT c.casa_id, c.ultimo_indice AS indice, c.ultimo_hash AS hash,
             e.hash AS hash_do_evento,
             (SELECT count(*) FROM audit.eventos x
               WHERE x.casa_id = c.casa_id AND x.indice <= c.ultimo_indice) AS quantidade
        FROM audit.cadeias c
        LEFT JOIN audit.eventos e ON e.casa_id = c.casa_id AND e.indice = c.ultimo_indice
       ORDER BY c.casa_id`);
    await client.query('COMMIT');

    for (const r of rows) {
      if (r.hash_do_evento !== r.hash) {
        throw new Error(`Casa ${r.casa_id}: cabeça da cadeia não confere com o evento ${r.indice}`);
      }
      if (r.quantidade !== r.indice) {
        throw new Error(`Casa ${r.casa_id}: ${r.quantidade} eventos até o índice ${r.indice}`);
      }
    }
    return {
      formato: VERSAO_FORMATO,
      criado_em: new Date().toISOString(),
      cadeias: rows.map((r) => ({
        casa_id: r.casa_id, indice: r.indice, hash: r.hash, quantidade: r.quantidade,
      })),
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  }
}

export function salvarCheckpoint(checkpoint: Checkpoint, arquivo: string): void {
  fs.mkdirSync(path.dirname(path.resolve(arquivo)), { recursive: true });
  fs.writeFileSync(arquivo, JSON.stringify(checkpoint, null, 2) + '\n');
}

export function lerCheckpoint(arquivo: string): Checkpoint {
  const checkpoint = JSON.parse(fs.readFileSync(arquivo, 'utf8')) as Checkpoint;
  if (checkpoint.formato !== VERSAO_FORMATO) {
    throw new Error(`Checkpoint no formato ${checkpoint.formato}; o verificador usa ${VERSAO_FORMATO}.`);
  }
  return checkpoint;
}
