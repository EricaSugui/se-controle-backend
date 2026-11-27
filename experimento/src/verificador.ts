// Verificador de integridade da condição B (roteiro, bloco 3).
//
// Para cada Casa do checkpoint, lê os eventos do banco (texto bruto),
// recalcula a cadeia em Node do início até o índice do checkpoint e compara.
// Não confia em nada do banco além dos próprios eventos: nem em
// audit.cadeias, nem nas funções SQL de hash.
//
// Situação de cada Casa:
//   - integra:      sequência 1..N completa, cada elo encadeado e com hash
//                   correto, quantidade e hash final iguais aos do checkpoint;
//   - adulterada:   alguma dessas conferências falhou (com o primeiro índice
//                   e o motivo);
//   - inconclusiva: o verificador não conseguiu processar os eventos (por
//                   exemplo, um campo num formato que a serialização recusa).
// Eventos com índice acima do checkpoint são "não protegidos": contados e
// informados, sem afetar a situação (projeto aprovado: só o que está até o
// checkpoint é protegido).

import { Client } from 'pg';
import { Checkpoint, CheckpointCasa } from './checkpoint';
import { EventoBruto, HASH_INICIAL, hashEvento, serializar } from './serializacao';

export type Situacao = 'integra' | 'adulterada' | 'inconclusiva';

// Motivos de adulteração, na ordem em que a verificação os encontra.
export type Motivo =
  | 'sequencia'      // falta um índice (exclusão) ou ele se repete (inserção)
  | 'encadeamento'   // hash_anterior do evento ≠ hash do evento anterior
  | 'hash'           // hash recalculado ≠ hash gravado (conteúdo alterado)
  | 'quantidade'     // número de eventos até o checkpoint ≠ checkpoint
  | 'checkpoint';    // cadeia coerente, mas o hash final ≠ checkpoint (recálculo)

export interface ResultadoCasa {
  casa_id: string;
  situacao: Situacao;
  motivo?: Motivo;
  indice?: string;          // primeiro índice com problema
  detalhe?: string;
  eventos_verificados: number;
  nao_protegidos: number;
  leitura_ms: number;
  calculo_ms: number;
}

export interface Relatorio {
  verificado_em: string;
  situacao: Situacao;       // pior situação entre as Casas
  cadeias: ResultadoCasa[];
  total_ms: number;
}

interface EventoDaCadeia extends EventoBruto {
  hash_anterior: string | null;
  hash: string | null;
}

const ms = (inicio: bigint) => Number(process.hrtime.bigint() - inicio) / 1e6;

async function lerEventos(client: Client, casa: string): Promise<EventoDaCadeia[]> {
  const { rows } = await client.query(
    `SELECT casa_id, indice, operacao, entidade, entidade_id, pessoa_responsavel_id,
            usuario_registrador_id, ocorrido_em, conteudo, hash_anterior, hash
       FROM audit.eventos WHERE casa_id = $1`,
    [casa],
  );
  return rows as EventoDaCadeia[];
}

// Confere uma Casa contra o seu checkpoint. Puro (sem banco): recebe os
// eventos já lidos, o que permite testar e medir o cálculo separado da leitura.
export function conferirCadeia(
  eventos: EventoDaCadeia[], ckpt: CheckpointCasa,
): Omit<ResultadoCasa, 'casa_id' | 'leitura_ms' | 'calculo_ms'> {
  const limite = BigInt(ckpt.indice);
  const porIndice = new Map<string, EventoDaCadeia[]>();
  let naoProtegidos = 0;
  for (const e of eventos) {
    if (e.indice === null) {
      return { situacao: 'inconclusiva', detalhe: 'evento sem índice', eventos_verificados: 0, nao_protegidos: 0 };
    }
    if (BigInt(e.indice) > limite) { naoProtegidos += 1; continue; }
    const lista = porIndice.get(e.indice) ?? [];
    lista.push(e);
    porIndice.set(e.indice, lista);
  }
  const protegidos = eventos.length - naoProtegidos;
  const base = { eventos_verificados: 0, nao_protegidos: naoProtegidos };

  let anterior = HASH_INICIAL;
  for (let i = 1n; i <= limite; i++) {
    const indice = i.toString();
    const noIndice = porIndice.get(indice) ?? [];
    if (noIndice.length !== 1) {
      return {
        ...base, eventos_verificados: Number(i - 1n), situacao: 'adulterada', motivo: 'sequencia', indice,
        detalhe: noIndice.length === 0 ? 'índice ausente' : `${noIndice.length} eventos com o mesmo índice`,
      };
    }
    const e = noIndice[0];
    if (e.hash_anterior !== anterior) {
      return { ...base, eventos_verificados: Number(i - 1n), situacao: 'adulterada', motivo: 'encadeamento', indice };
    }
    let recalculado: string;
    try {
      recalculado = hashEvento(anterior, serializar(e));
    } catch (err) {
      return {
        ...base, eventos_verificados: Number(i - 1n), situacao: 'inconclusiva', indice,
        detalhe: (err as Error).message,
      };
    }
    if (recalculado !== e.hash) {
      return { ...base, eventos_verificados: Number(i - 1n), situacao: 'adulterada', motivo: 'hash', indice };
    }
    anterior = e.hash;
  }

  const verificados = Number(limite);
  if (BigInt(protegidos) !== BigInt(ckpt.quantidade)) {
    return {
      ...base, eventos_verificados: verificados, situacao: 'adulterada', motivo: 'quantidade',
      detalhe: `${protegidos} eventos até o índice ${ckpt.indice}; checkpoint: ${ckpt.quantidade}`,
    };
  }
  if (anterior !== ckpt.hash) {
    return {
      ...base, eventos_verificados: verificados, situacao: 'adulterada', motivo: 'checkpoint', indice: ckpt.indice,
      detalhe: 'cadeia coerente, mas o hash final difere do checkpoint (hashes recalculados)',
    };
  }
  return { ...base, eventos_verificados: verificados, situacao: 'integra' };
}

const GRAVIDADE: Record<Situacao, number> = { integra: 0, inconclusiva: 1, adulterada: 2 };

export async function verificar(client: Client, checkpoint: Checkpoint): Promise<Relatorio> {
  const inicioTotal = process.hrtime.bigint();
  const cadeias: ResultadoCasa[] = [];
  for (const ckpt of checkpoint.cadeias) {
    const inicioLeitura = process.hrtime.bigint();
    const eventos = await lerEventos(client, ckpt.casa_id);
    const leitura = ms(inicioLeitura);
    const inicioCalculo = process.hrtime.bigint();
    const resultado = conferirCadeia(eventos, ckpt);
    cadeias.push({ casa_id: ckpt.casa_id, ...resultado, leitura_ms: leitura, calculo_ms: ms(inicioCalculo) });
  }
  const situacao = cadeias.reduce<Situacao>(
    (pior, c) => (GRAVIDADE[c.situacao] > GRAVIDADE[pior] ? c.situacao : pior), 'integra');
  return { verificado_em: new Date().toISOString(), situacao, cadeias, total_ms: ms(inicioTotal) };
}
