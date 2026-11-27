// Medidas do piloto: estatísticas descritivas, armazenamento e um retrato
// do contêiner (CPU e memória, "quando mensurável", como o projeto prevê).

import { execSync } from 'child_process';
import { Client } from 'pg';

export interface Estatisticas {
  n: number;
  media: number;
  desvio: number;     // desvio-padrão amostral
  minimo: number;
  mediana: number;
  p95: number;
  p99: number;
  maximo: number;
}

// Percentil com interpolação linear entre as posições vizinhas.
function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 1) return ordenados[0];
  const pos = (ordenados.length - 1) * p;
  const abaixo = Math.floor(pos);
  const acima = Math.ceil(pos);
  return ordenados[abaixo] + (ordenados[acima] - ordenados[abaixo]) * (pos - abaixo);
}

export function estatisticas(valores: number[]): Estatisticas {
  if (valores.length === 0) throw new Error('estatisticas: sem valores');
  const o = [...valores].sort((x, y) => x - y);
  const n = o.length;
  const media = o.reduce((s, v) => s + v, 0) / n;
  const desvio = n > 1 ? Math.sqrt(o.reduce((s, v) => s + (v - media) ** 2, 0) / (n - 1)) : 0;
  return {
    n, media, desvio, minimo: o[0], mediana: percentil(o, 0.5),
    p95: percentil(o, 0.95), p99: percentil(o, 0.99), maximo: o[n - 1],
  };
}

export interface Armazenamento {
  eventos: number;
  eventos_tabela_bytes: number;
  eventos_indices_bytes: number;
  eventos_toast_bytes: number;
  eventos_total_bytes: number;
  cadeias_total_bytes: number;     // 0 em A
  bytes_por_evento: number;        // (eventos + cadeias) / eventos
}

// Medido depois de VACUUM (sem FULL) nas tabelas de auditoria: em B, a
// cabeça da cadeia é atualizada a cada evento e deixaria versões mortas.
export async function medirArmazenamento(client: Client): Promise<Armazenamento> {
  const temCadeias = (await client.query(
    `SELECT to_regclass('audit.cadeias') IS NOT NULL AS sim`)).rows[0].sim === 't';
  await client.query('VACUUM (ANALYZE) audit.eventos');
  if (temCadeias) await client.query('VACUUM (ANALYZE) audit.cadeias');
  const { rows } = await client.query(`
    SELECT (SELECT count(*) FROM audit.eventos) AS eventos,
           pg_relation_size('audit.eventos') AS tabela,
           pg_indexes_size('audit.eventos') AS indices,
           coalesce((SELECT pg_total_relation_size(reltoastrelid) FROM pg_class
                      WHERE oid = 'audit.eventos'::regclass AND reltoastrelid <> 0), 0) AS toast,
           pg_total_relation_size('audit.eventos') AS total,
           ${temCadeias ? `pg_total_relation_size('audit.cadeias')` : '0'} AS cadeias`);
  const r = rows[0];
  const eventos = Number(r.eventos);
  const total = Number(r.total);
  const cadeias = Number(r.cadeias);
  return {
    eventos,
    eventos_tabela_bytes: Number(r.tabela),
    eventos_indices_bytes: Number(r.indices),
    eventos_toast_bytes: Number(r.toast),
    eventos_total_bytes: total,
    cadeias_total_bytes: cadeias,
    bytes_por_evento: eventos > 0 ? (total + cadeias) / eventos : 0,
  };
}

// Retrato instantâneo do contêiner (docker stats --no-stream). Indicativo:
// não é uma série ao longo da carga.
export function retratoConteiner(nome = 'se-controle-experimento-db'): Record<string, string> | null {
  try {
    const saida = execSync(`docker stats --no-stream --format "{{json .}}" ${nome}`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const j = JSON.parse(saida.trim());
    return { cpu: j.CPUPerc, memoria: j.MemUsage, memoria_pct: j.MemPerc, io_bloco: j.BlockIO };
  } catch {
    return null;
  }
}
