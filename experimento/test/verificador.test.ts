// Bloco 3: checkpoint e verificador (só na condição B).
//
// Cada adulteração roda numa transação desfeita no fim (ROLLBACK): o
// verificador, na mesma conexão, enxerga o banco adulterado, e o teste
// seguinte encontra tudo intacto. O "atacante" age como o modelo de ameaça
// permite: altera, exclui e insere eventos, derruba constraints e recalcula
// hashes, mas não toca no checkpoint nem no verificador.

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Client } from 'pg';
import { Checkpoint, criarCheckpoint, lerCheckpoint, salvarCheckpoint } from '../src/checkpoint';
import { Relatorio, ResultadoCasa, verificar } from '../src/verificador';
import {
  CONDICAO, conectar, conferirCondicao, criarCenario, emTransacao, inserirCompra, inserirReceita,
} from './apoio';

const suite = CONDICAO === 'b' ? describe : describe.skip;

let client: Client;

beforeAll(async () => {
  client = await conectar();
  await conferirCondicao(client);
});

afterAll(async () => {
  await client?.end();
});

// Casa com 5 eventos: compra (1), duas parcelas (2, 3), receita (4) e
// alteração da compra (5). Devolve o checkpoint só dessa Casa.
async function casaComCincoEventos() {
  const s = await criarCenario(client);
  const { compra } = await emTransacao(client, null, () =>
    inserirCompra(client, { casa: s.casa, pessoa: s.bia, lancador: s.ana, categoria: s.categoria, valores: ['40.00', '60.00'] }));
  await emTransacao(client, null, () =>
    inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, valor: '3000.00' }));
  await emTransacao(client, s.ana, () =>
    client.query(`UPDATE compras SET descricao = 'Feira' WHERE id = $1`, [compra]));
  const completo = await criarCheckpoint(client);
  const checkpoint: Checkpoint = { ...completo, cadeias: completo.cadeias.filter((c) => c.casa_id === s.casa) };
  return { s, checkpoint, casa: s.casa };
}

// Roda o ataque e verifica dentro da mesma transação; desfaz tudo no fim.
async function verificarSob(ataque: string[], checkpoint: Checkpoint): Promise<ResultadoCasa> {
  await client.query('BEGIN');
  try {
    for (const sql of ataque) await client.query(sql);
    const relatorio = await verificar(client, checkpoint);
    return relatorio.cadeias[0];
  } finally {
    await client.query('ROLLBACK');
  }
}

// O atacante recalcula, com as próprias funções do banco, os hashes da Casa
// a partir de um índice, e acerta a cabeça da cadeia.
function recalcularDesde(casa: string, desde: number): string {
  return `
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
}

const alvo = (casa: string, indice: number) => `casa_id = ${casa} AND indice = ${indice}`;

suite('checkpoint e verificador (condição B)', () => {
  test('sem falso positivo: todas as cadeias do banco íntegras', async () => {
    // Dados próprios (não depende da ordem dos arquivos de teste): 4 Casas
    // com inclusões, alterações, exclusões e espaço pessoal sem responsável.
    for (let i = 0; i < 4; i++) {
      const s = await criarCenario(client);
      const { compra } = await emTransacao(client, null, () =>
        inserirCompra(client, { casa: s.casa, pessoa: s.bia, lancador: s.ana, categoria: s.categoria, valores: ['10.00', '10.00', '10.01'] }));
      const receita = await emTransacao(client, null, () =>
        inserirReceita(client, { casa: s.casa, pessoa: null, lancador: s.bia, valor: '1234.56' }));
      await emTransacao(client, s.bia, async () => {
        await client.query(`UPDATE compras SET descricao = 'Açougue: 2,5 kg' WHERE id = $1`, [compra]);
        await client.query('DELETE FROM receitas WHERE id = $1', [receita]);
      });
    }
    const relatorio: Relatorio = await verificar(client, await criarCheckpoint(client));
    expect(relatorio.cadeias.length).toBeGreaterThan(0);
    expect(relatorio.cadeias.filter((c) => c.situacao !== 'integra')).toEqual([]);
    expect(relatorio.situacao).toBe('integra');
  });

  test('cadeia íntegra: 5 eventos verificados', async () => {
    const { checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([], checkpoint);
    expect(r).toMatchObject({ situacao: 'integra', eventos_verificados: 5, nao_protegidos: 0 });
  });

  test('eventos depois do checkpoint são "não protegidos", sem falha', async () => {
    const { s, checkpoint } = await casaComCincoEventos();
    await emTransacao(client, null, () =>
      inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, valor: '1.00' }));
    const r = await verificarSob([], checkpoint);
    expect(r).toMatchObject({ situacao: 'integra', eventos_verificados: 5, nao_protegidos: 1 });
  });

  test('alteração de valor: detectada no índice alterado (hash)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([
      `UPDATE audit.eventos SET conteudo = jsonb_set(conteudo, '{depois,valor}', '400.00') WHERE ${alvo(casa, 2)}`,
    ], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'hash', indice: '2' });
  });

  test.each([
    ['responsável', 'pessoa_responsavel_id = usuario_registrador_id'],
    ['usuário registrador', 'usuario_registrador_id = pessoa_responsavel_id'],
    ['timestamp', `ocorrido_em = ocorrido_em - interval '1 day'`],
    ['operação', `operacao = 'DELETE'`],
  ])('alteração de %s: detectada (hash)', async (_campo, atribuicao) => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([`UPDATE audit.eventos SET ${atribuicao} WHERE ${alvo(casa, 3)}`], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'hash', indice: '3' });
  });

  test('exclusão de um evento do meio: detectada (sequência)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([`DELETE FROM audit.eventos WHERE ${alvo(casa, 3)}`], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'sequencia', indice: '3', detalhe: 'índice ausente' });
  });

  test('exclusão do último evento, com a cabeça da cadeia ajustada: detectada (sequência)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([
      `DELETE FROM audit.eventos WHERE ${alvo(casa, 5)}`,
      recalcularDesde(casa, 5),
    ], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'sequencia', indice: '5' });
  });

  test('exclusão de todos os eventos da Casa: detectada (sequência no índice 1)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([`DELETE FROM audit.eventos WHERE casa_id = ${casa}`], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'sequencia', indice: '1' });
  });

  test('inserção indevida com índice repetido (constraint derrubada): detectada (sequência)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([
      'ALTER TABLE audit.eventos DROP CONSTRAINT eventos_indice_por_casa',
      `INSERT INTO audit.eventos (casa_id, indice, operacao, entidade, entidade_id, pessoa_responsavel_id,
                                  usuario_registrador_id, ocorrido_em, conteudo, hash_anterior, hash)
       SELECT casa_id, indice, 'INSERT', 'receitas', 999, pessoa_responsavel_id, usuario_registrador_id,
              ocorrido_em, '{"antes": null, "depois": {"valor_liquido": 1.00}}', hash_anterior, hash
         FROM audit.eventos WHERE ${alvo(casa, 4)}`,
    ], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'sequencia', indice: '4' });
  });

  test('inserção indevida no meio, com renumeração e recálculo: detectada (checkpoint)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([
      'ALTER TABLE audit.eventos DROP CONSTRAINT eventos_indice_por_casa',
      `UPDATE audit.eventos SET indice = indice + 1 WHERE casa_id = ${casa} AND indice >= 3`,
      `INSERT INTO audit.eventos (casa_id, indice, operacao, entidade, entidade_id, pessoa_responsavel_id,
                                  usuario_registrador_id, ocorrido_em, conteudo, hash_anterior, hash)
       SELECT casa_id, 3, 'INSERT', 'receitas', 999, pessoa_responsavel_id, usuario_registrador_id,
              ocorrido_em, '{"antes": null, "depois": {"valor_liquido": 1.00}}', hash_anterior, hash
         FROM audit.eventos WHERE ${alvo(casa, 2)}`,
      recalcularDesde(casa, 3),
    ], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'checkpoint', indice: '5', nao_protegidos: 1 });
  });

  test('alteração seguida do recálculo dos hashes posteriores: detectada só pelo checkpoint', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([
      `UPDATE audit.eventos SET conteudo = jsonb_set(conteudo, '{depois,valor}', '400.00') WHERE ${alvo(casa, 2)}`,
      recalcularDesde(casa, 2),
    ], checkpoint);
    // A cadeia fica coerente; só o hash final denuncia. Sem checkpoints
    // intermediários, não dá para apontar o índice alterado (2).
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'checkpoint', indice: '5' });
  });

  test('alteração só do hash_anterior: detectada (encadeamento)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([
      `UPDATE audit.eventos SET hash_anterior = repeat('f', 64) WHERE ${alvo(casa, 4)}`,
    ], checkpoint);
    expect(r).toMatchObject({ situacao: 'adulterada', motivo: 'encadeamento', indice: '4' });
  });

  test('o verificador não confia na cabeça da cadeia (audit.cadeias)', async () => {
    const { casa, checkpoint } = await casaComCincoEventos();
    const r = await verificarSob([
      `UPDATE audit.cadeias SET ultimo_hash = repeat('0', 64), ultimo_indice = 0 WHERE casa_id = ${casa}`,
    ], checkpoint);
    expect(r.situacao).toBe('integra');
  });

  test('o checkpoint não é criado sobre uma cabeça de cadeia incoerente', async () => {
    const { casa } = await casaComCincoEventos();
    // criarCheckpoint abre a própria transação, então aqui a mudança é
    // gravada de fato e desfeita no fim.
    const original = (await client.query(`SELECT ultimo_hash FROM audit.cadeias WHERE casa_id = ${casa}`)).rows[0].ultimo_hash;
    await client.query(`UPDATE audit.cadeias SET ultimo_hash = repeat('a', 64) WHERE casa_id = ${casa}`);
    try {
      await expect(criarCheckpoint(client)).rejects.toThrow(/cabeça da cadeia não confere/);
    } finally {
      await client.query(`UPDATE audit.cadeias SET ultimo_hash = $1 WHERE casa_id = ${casa}`, [original]);
    }
  });

  test('checkpoint gravado e lido do arquivo verifica igual', async () => {
    const { checkpoint } = await casaComCincoEventos();
    const arquivo = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ckpt-')), 'checkpoint.json');
    salvarCheckpoint(checkpoint, arquivo);
    const lido = lerCheckpoint(arquivo);
    expect(lido).toEqual(checkpoint);
    expect((await verificarSob([], lido)).situacao).toBe('integra');
    fs.writeFileSync(arquivo, JSON.stringify({ ...checkpoint, formato: 'v0' }));
    expect(() => lerCheckpoint(arquivo)).toThrow(/formato v0/);
  });
});
