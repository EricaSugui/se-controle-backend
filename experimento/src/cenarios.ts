// Cenários de adulteração do projeto aprovado, em lote (piloto).
//
// Cada variante escolhe um evento-alvo numa Casa e gera o SQL do ataque
// para A e para B. O atacante age como o modelo de ameaça permite: altera,
// exclui e insere eventos, derruba constraints e recalcula hashes, sem
// tocar no checkpoint nem no verificador. A rodada aplica o ataque numa
// transação, observa o resultado e desfaz (ROLLBACK).
//
// Os ids de audit.eventos são os mesmos em A e em B para a mesma semente
// (mesmas operações, na mesma ordem, num banco recriado do zero), então o
// mesmo alvo é atacado nas duas condições. Em B, a posição do evento na
// Casa (ordem de id) é o seu índice na cadeia.

import { Aleatorio } from './aleatorio';
import { Motivo, Situacao } from './verificador';

export interface EventoDaCasa {
  id: string;
  posicao: number;        // 1..n, por ordem de id
  entidade: string;
  temDepois: boolean;     // conteúdo "depois" é um objeto (não é exclusão)
}

export interface Alvo {
  casa: string;
  n: number;              // eventos da Casa no checkpoint
  posicao: number;        // posição atacada (n + 1 = depois do checkpoint)
  evento: string | null;  // id do evento-alvo (null quando não há um)
}

export interface Esperado {
  situacao: Situacao;
  motivo?: Motivo;
  indice?: number;
  naoProtegidos?: number;
}

export interface Variante {
  id: string;
  cenario: string;        // como no projeto aprovado
  variante: string;
  minimoEventos: number;  // Casas menores não servem de alvo
  escolher(r: Aleatorio, casa: string, eventos: EventoDaCasa[]): Alvo | null;
  sqlA(a: Alvo): string[];
  sqlB(a: Alvo): string[];
  esperadoB(a: Alvo): Esperado;
}

// ---------------------------------------------------------------------
// Peças de SQL
// ---------------------------------------------------------------------
const ehValor = (e: EventoDaCasa) => e.temDepois && (e.entidade === 'parcelas' || e.entidade === 'receitas');

const alterarValor = (evento: string) => `
  UPDATE audit.eventos SET conteudo = CASE entidade
      WHEN 'parcelas' THEN jsonb_set(conteudo, '{depois,valor}',
                                     to_jsonb((conteudo->'depois'->>'valor')::numeric + 100))
      ELSE jsonb_set(conteudo, '{depois,valor_liquido}',
                     to_jsonb((conteudo->'depois'->>'valor_liquido')::numeric + 100)) END
   WHERE id = ${evento}`;

// Evento falso, copiado de um evento real da mesma Casa (A: sem índice).
const inserirFalsoA = (casa: string) => `
  INSERT INTO audit.eventos (casa_id, operacao, entidade, entidade_id, pessoa_responsavel_id,
                             usuario_registrador_id, ocorrido_em, conteudo)
  SELECT casa_id, 'INSERT', 'receitas', 999999, pessoa_responsavel_id, usuario_registrador_id,
         ocorrido_em, '{"antes": null, "depois": {"valor_liquido": 1.00}}'
    FROM audit.eventos WHERE casa_id = ${casa} ORDER BY id LIMIT 1`;

// B: evento falso com índice e hashes de um evento real (sem recalcular).
const inserirFalsoB = (casa: string, indice: number, copiarDe: number) => `
  INSERT INTO audit.eventos (casa_id, indice, operacao, entidade, entidade_id, pessoa_responsavel_id,
                             usuario_registrador_id, ocorrido_em, conteudo, hash_anterior, hash)
  SELECT casa_id, ${indice}, 'INSERT', 'receitas', 999999, pessoa_responsavel_id, usuario_registrador_id,
         ocorrido_em, '{"antes": null, "depois": {"valor_liquido": 1.00}}', hash_anterior, hash
    FROM audit.eventos WHERE casa_id = ${casa} AND indice = ${copiarDe}`;

// B: recalcula os hashes da Casa a partir de um índice e acerta a cabeça.
const recalcularDesde = (casa: string, desde: number) => `
  DO $$
  DECLARE r audit.eventos; anterior text;
  BEGIN
    SELECT coalesce((SELECT hash FROM audit.eventos WHERE casa_id = ${casa} AND indice = ${desde - 1}),
                    audit.hash_inicial()) INTO anterior;
    FOR r IN SELECT * FROM audit.eventos WHERE casa_id = ${casa} AND indice >= ${desde} ORDER BY indice LOOP
      r.hash_anterior := anterior;
      r.hash := audit.hash_evento(anterior, audit.serializar(r));
      UPDATE audit.eventos SET hash_anterior = r.hash_anterior, hash = r.hash WHERE id = r.id;
      anterior := r.hash;
    END LOOP;
    UPDATE audit.cadeias SET ultimo_hash = anterior,
           ultimo_indice = (SELECT max(indice) FROM audit.eventos WHERE casa_id = ${casa})
     WHERE casa_id = ${casa};
  END $$`;

const DERRUBAR_UNICO = 'ALTER TABLE audit.eventos DROP CONSTRAINT eventos_indice_por_casa';

// ---------------------------------------------------------------------
// Escolha do alvo
// ---------------------------------------------------------------------
function alvoEntre(r: Aleatorio, casa: string, eventos: EventoDaCasa[], filtro: (e: EventoDaCasa) => boolean): Alvo | null {
  const candidatos = eventos.filter(filtro);
  if (candidatos.length === 0) return null;
  const e = r.escolher(candidatos);
  return { casa, n: eventos.length, posicao: e.posicao, evento: e.id };
}

const qualquer = (r: Aleatorio, casa: string, ev: EventoDaCasa[]) => alvoEntre(r, casa, ev, () => true);
const doMeio = (r: Aleatorio, casa: string, ev: EventoDaCasa[]) =>
  alvoEntre(r, casa, ev, (e) => e.posicao > 1 && e.posicao < ev.length);

function alteracaoDeCampo(id: string, cenario: string, variante: string, atribuicao: string): Variante {
  return {
    id, cenario, variante, minimoEventos: 1,
    escolher: qualquer,
    sqlA: (a) => [`UPDATE audit.eventos e SET ${atribuicao} WHERE e.id = ${a.evento}`],
    sqlB: (a) => [`UPDATE audit.eventos e SET ${atribuicao} WHERE e.id = ${a.evento}`],
    esperadoB: (a) => ({ situacao: 'adulterada', motivo: 'hash', indice: a.posicao }),
  };
}

// ---------------------------------------------------------------------
// As 12 variantes (Tabela 3 de FIGURAS.md)
// ---------------------------------------------------------------------
export const VARIANTES: Variante[] = [
  {
    id: 'valor', cenario: 'Alteração de valor', variante: 'valor de uma parcela ou receita', minimoEventos: 1,
    escolher: (r, casa, ev) => alvoEntre(r, casa, ev, ehValor),
    sqlA: (a) => [alterarValor(a.evento!)],
    sqlB: (a) => [alterarValor(a.evento!)],
    esperadoB: (a) => ({ situacao: 'adulterada', motivo: 'hash', indice: a.posicao }),
  },
  alteracaoDeCampo('responsavel', 'Alteração de responsável', 'troca por outra pessoa existente',
    `pessoa_responsavel_id = (SELECT p.id FROM pessoas p WHERE p.id IS DISTINCT FROM e.pessoa_responsavel_id ORDER BY p.id LIMIT 1)`),
  alteracaoDeCampo('registrador', 'Alteração de usuário registrador', 'troca por outra pessoa existente',
    `usuario_registrador_id = (SELECT p.id FROM pessoas p WHERE p.id <> e.usuario_registrador_id ORDER BY p.id LIMIT 1)`),
  alteracaoDeCampo('timestamp', 'Alteração de timestamp', 'menos 1 dia',
    `ocorrido_em = e.ocorrido_em - interval '1 day'`),
  alteracaoDeCampo('operacao', 'Alteração de operação', 'troca do tipo de operação',
    `operacao = CASE e.operacao WHEN 'INSERT' THEN 'UPDATE' ELSE 'INSERT' END`),
  {
    id: 'exclusao_meio', cenario: 'Exclusão', variante: 'evento do meio', minimoEventos: 3,
    escolher: doMeio,
    sqlA: (a) => [`DELETE FROM audit.eventos WHERE id = ${a.evento}`],
    sqlB: (a) => [`DELETE FROM audit.eventos WHERE id = ${a.evento}`],
    esperadoB: (a) => ({ situacao: 'adulterada', motivo: 'sequencia', indice: a.posicao }),
  },
  {
    id: 'exclusao_ultimo', cenario: 'Exclusão', variante: 'último evento, com a cabeça ajustada', minimoEventos: 2,
    escolher: (r, casa, ev) => alvoEntre(r, casa, ev, (e) => e.posicao === ev.length),
    sqlA: (a) => [`DELETE FROM audit.eventos WHERE id = ${a.evento}`],
    sqlB: (a) => [`DELETE FROM audit.eventos WHERE id = ${a.evento}`, recalcularDesde(a.casa, a.n)],
    esperadoB: (a) => ({ situacao: 'adulterada', motivo: 'sequencia', indice: a.n }),
  },
  {
    id: 'exclusao_todos', cenario: 'Exclusão', variante: 'todos os eventos da Casa', minimoEventos: 1,
    escolher: (_r, casa, ev) => ({ casa, n: ev.length, posicao: 1, evento: null }),
    sqlA: (a) => [`DELETE FROM audit.eventos WHERE casa_id = ${a.casa}`],
    sqlB: (a) => [`DELETE FROM audit.eventos WHERE casa_id = ${a.casa}`],
    esperadoB: () => ({ situacao: 'adulterada', motivo: 'sequencia', indice: 1 }),
  },
  {
    id: 'insercao_repetido', cenario: 'Inserção indevida', variante: 'índice repetido (constraint derrubada)', minimoEventos: 1,
    escolher: qualquer,
    sqlA: (a) => [inserirFalsoA(a.casa)],
    sqlB: (a) => [DERRUBAR_UNICO, inserirFalsoB(a.casa, a.posicao, a.posicao)],
    esperadoB: (a) => ({ situacao: 'adulterada', motivo: 'sequencia', indice: a.posicao }),
  },
  {
    id: 'insercao_meio_recalculo', cenario: 'Inserção indevida', variante: 'no meio, com renumeração e recálculo', minimoEventos: 2,
    escolher: (r, casa, ev) => alvoEntre(r, casa, ev, (e) => e.posicao > 1),
    sqlA: (a) => [inserirFalsoA(a.casa)],
    sqlB: (a) => [
      DERRUBAR_UNICO,
      `UPDATE audit.eventos SET indice = indice + 1 WHERE casa_id = ${a.casa} AND indice >= ${a.posicao}`,
      inserirFalsoB(a.casa, a.posicao, a.posicao - 1),
      recalcularDesde(a.casa, a.posicao),
    ],
    esperadoB: (a) => ({ situacao: 'adulterada', motivo: 'checkpoint', indice: a.n, naoProtegidos: 1 }),
  },
  {
    id: 'insercao_depois', cenario: 'Inserção indevida', variante: 'depois do checkpoint', minimoEventos: 1,
    escolher: (_r, casa, ev) => ({ casa, n: ev.length, posicao: ev.length + 1, evento: null }),
    sqlA: (a) => [inserirFalsoA(a.casa)],
    // Encadeado corretamente: índice n + 1 e hash recalculado.
    sqlB: (a) => [inserirFalsoB(a.casa, a.n + 1, a.n), recalcularDesde(a.casa, a.n + 1)],
    esperadoB: () => ({ situacao: 'integra', naoProtegidos: 1 }),
  },
  {
    id: 'alteracao_recalculo', cenario: 'Alteração seguida do recálculo dos hashes posteriores',
    variante: 'valor de uma parcela ou receita', minimoEventos: 1,
    escolher: (r, casa, ev) => alvoEntre(r, casa, ev, ehValor),
    sqlA: (a) => [alterarValor(a.evento!)],
    sqlB: (a) => [alterarValor(a.evento!), recalcularDesde(a.casa, a.posicao)],
    esperadoB: (a) => ({ situacao: 'adulterada', motivo: 'checkpoint', indice: a.n }),
  },
];
