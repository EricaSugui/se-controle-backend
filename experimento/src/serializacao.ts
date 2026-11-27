// Serialização canônica do evento e hash, em TypeScript (decisão 3).
//
// Espelho de audit.campo, audit.data_canonica, audit.serializar e
// audit.hash_evento (sql/10-audit-comum.sql). O verificador usa esta versão,
// fora do banco, sobre o texto bruto lido pela conexão de src/banco.ts.
// Qualquer mudança aqui exige a mesma mudança no SQL e nova versão do
// formato ('v1').

import { createHash } from 'crypto';

export const VERSAO_FORMATO = 'v1';
export const HASH_INICIAL = '0'.repeat(64);

// Evento como chega da conexão em texto bruto: cada coluna é o texto que o
// Postgres envia, ou null.
export interface EventoBruto {
  casa_id: string;
  indice: string | null;
  operacao: string;
  entidade: string;
  entidade_id: string;
  pessoa_responsavel_id: string | null;
  usuario_registrador_id: string;
  ocorrido_em: string;
  conteudo: string;
}

// `tamanho:valor,` com o tamanho em bytes UTF-8; nulo vira `~`.
export function campo(valor: string | null): string {
  if (valor === null) return '~';
  return `${Buffer.byteLength(valor, 'utf8')}:${valor},`;
}

// Texto de timestamptz enviado pelo Postgres numa sessão em UTC
// ("2026-12-02 10:00:00.1234+00") → "2026-12-02T10:00:00.123400Z".
const TIMESTAMPTZ_UTC = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?\+00$/;

export function dataCanonica(bruto: string): string {
  const m = TIMESTAMPTZ_UTC.exec(bruto);
  if (!m) {
    throw new Error(`Data fora do formato esperado (sessão precisa estar em UTC): ${bruto}`);
  }
  const [, dia, hora, fracao = ''] = m;
  return `${dia}T${hora}.${fracao.padEnd(6, '0')}Z`;
}

export function serializar(e: EventoBruto): string {
  return (
    campo(VERSAO_FORMATO) +
    campo(e.casa_id) +
    campo(e.indice) +
    campo(e.operacao) +
    campo(e.entidade) +
    campo(e.entidade_id) +
    campo(e.pessoa_responsavel_id) +
    campo(e.usuario_registrador_id) +
    campo(dataCanonica(e.ocorrido_em)) +
    campo(e.conteudo)
  );
}

// SHA-256(hash_anterior || serialização), em hexadecimal minúsculo.
export function hashEvento(hashAnterior: string, serializacao: string): string {
  return createHash('sha256').update(hashAnterior + serializacao, 'utf8').digest('hex');
}
