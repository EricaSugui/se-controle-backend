// Bloco 2: triggers de auditoria nas condições A e B.
//
// Roda nas duas condições (npm run exp:test). Os testes comuns valem para
// A e B; os de encadeamento, só para B; o de ausência de cadeia, só para A.

import { Client } from 'pg';
import {
  CONDICAO, conectar, conferirCondicao, criarCenario, emTransacao, eventosDaCasa,
  inserirCompra, inserirReceita, problemaNaCadeia,
} from './apoio';

const soEmB = CONDICAO === 'b' ? test : test.skip;
const soEmA = CONDICAO === 'a' ? test : test.skip;

let client: Client;

beforeAll(async () => {
  client = await conectar();
  await conferirCondicao(client);
});

afterAll(async () => {
  await client?.end();
});

describe(`triggers de auditoria (condição ${CONDICAO.toUpperCase()})`, () => {
  test('inclusão de compra com parcelas: um evento por linha, com Casa, responsável e registrador', async () => {
    const s = await criarCenario(client);
    const { compra, parcelas } = await emTransacao(client, null, () =>
      inserirCompra(client, { casa: s.casa, pessoa: s.bia, lancador: s.ana, categoria: s.categoria, valores: ['50.00', '50.00'] }));

    const eventos = await eventosDaCasa(client, s.casa);
    expect(eventos.map((e) => [e.operacao, e.entidade, e.entidade_id])).toEqual([
      ['INSERT', 'compras', compra],
      ['INSERT', 'parcelas', parcelas[0]],
      ['INSERT', 'parcelas', parcelas[1]],
    ]);
    for (const e of eventos) {
      expect(e.pessoa_responsavel_id).toBe(s.bia);     // "Quem gastou"
      expect(e.usuario_registrador_id).toBe(s.ana);    // lancado_por_id
    }
    const conteudo = JSON.parse(eventos[1].conteudo);
    expect(conteudo.antes).toBeNull();
    expect(conteudo.depois.valor).toBe(50);            // JSON.parse; o texto bruto guarda 50.00
    expect(eventos[1].conteudo).toContain('"valor": 50.00');
  });

  test('ROLLBACK não deixa evento', async () => {
    const s = await criarCenario(client);
    await expect(emTransacao(client, null, async () => {
      await inserirCompra(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, categoria: s.categoria, valores: ['10.00'] });
      throw new Error('desfazer');
    })).rejects.toThrow('desfazer');
    expect(await eventosDaCasa(client, s.casa)).toHaveLength(0);
  });

  test('alteração sem app.usuario_id é recusada, e nada é gravado', async () => {
    const s = await criarCenario(client);
    const { compra } = await emTransacao(client, null, () =>
      inserirCompra(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, categoria: s.categoria, valores: ['10.00'] }));

    await expect(emTransacao(client, null, () =>
      client.query(`UPDATE compras SET descricao = 'Feira' WHERE id = $1`, [compra])))
      .rejects.toThrow(/sem usuário registrador/);

    const { rows } = await client.query('SELECT descricao FROM compras WHERE id = $1', [compra]);
    expect(rows[0].descricao).toBe('Mercado');
    expect(await eventosDaCasa(client, s.casa)).toHaveLength(2); // só a inclusão
  });

  test('inclusão sem lancado_por_id usa app.usuario_id; sem nenhum dos dois, recusa', async () => {
    const s = await criarCenario(client);
    await emTransacao(client, s.bia, () =>
      inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: null, valor: '1000.00' }));
    const [evento] = await eventosDaCasa(client, s.casa);
    expect(evento.usuario_registrador_id).toBe(s.bia);

    await expect(emTransacao(client, null, () =>
      inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: null, valor: '1.00' })))
      .rejects.toThrow(/sem usuário registrador/);
  });

  test('alteração registra quem alterou e o conteúdo antes e depois', async () => {
    const s = await criarCenario(client);
    const { compra } = await emTransacao(client, null, () =>
      inserirCompra(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, categoria: s.categoria, valores: ['10.00'] }));
    await emTransacao(client, s.bia, () =>
      client.query(`UPDATE compras SET descricao = 'Feira' WHERE id = $1`, [compra]));

    const ultimo = (await eventosDaCasa(client, s.casa)).slice(-1)[0];
    expect(ultimo.operacao).toBe('UPDATE');
    expect(ultimo.usuario_registrador_id).toBe(s.bia);
    const conteudo = JSON.parse(ultimo.conteudo);
    expect(conteudo.antes.descricao).toBe('Mercado');
    expect(conteudo.depois.descricao).toBe('Feira');
  });

  test('vincular, trocar e desvincular uma recorrência viram UPDATE com antes e depois (decisão 9)', async () => {
    const s = await criarCenario(client);
    const fixa = async (descricao: string) => (await client.query(
      `INSERT INTO despesas_fixas (casa_id, categoria_id, descricao, dia_esperado, periodicidade, tipo_valor, valor_referencia, vigente_desde)
       VALUES ($1, $2, $3, 10, 'mensal', 'fixo', 100, '2026-01-01') RETURNING id`,
      [s.casa, s.categoria, descricao])).rows[0].id as string;
    const luz = await fixa('Luz');
    const agua = await fixa('Água');
    const { compra } = await emTransacao(client, null, () =>
      inserirCompra(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, categoria: s.categoria, valores: ['100.00'] }));

    const vinculo = (id: string | null, comp: string | null) => emTransacao(client, s.ana, () => client.query(
      'UPDATE compras SET despesa_fixa_id = $2, competencia_referencia = $3 WHERE id = $1', [compra, id, comp]));
    await vinculo(luz, '2026-12');   // vincular
    await vinculo(agua, '2026-12');  // trocar
    await vinculo(null, null);       // desvincular

    const updates = (await eventosDaCasa(client, s.casa)).filter((e) => e.operacao === 'UPDATE');
    const pares = updates.map((e) => {
      const c = JSON.parse(e.conteudo);
      return [c.antes.despesa_fixa_id, c.depois.despesa_fixa_id];
    });
    expect(pares).toEqual([[null, Number(luz)], [Number(luz), Number(agua)], [Number(agua), null]]);
  });

  test('lançamento que muda de Casa gera um evento em cada Casa', async () => {
    const s = await criarCenario(client);
    const receita = await emTransacao(client, null, () =>
      inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, valor: '200.00' }));
    await emTransacao(client, s.ana, () =>
      client.query('UPDATE receitas SET casa_id = $2 WHERE id = $1', [receita, s.outraCasa]));

    const origem = await eventosDaCasa(client, s.casa);
    const destino = await eventosDaCasa(client, s.outraCasa);
    expect(origem.map((e) => e.operacao)).toEqual(['INSERT', 'UPDATE']);
    expect(destino.map((e) => e.operacao)).toEqual(['UPDATE']);
    expect(origem[1].conteudo).toBe(destino[0].conteudo);
  });

  test('compra apagada de vez: parcelas em cascata ficam na Casa certa', async () => {
    const s = await criarCenario(client);
    const { compra, parcelas } = await emTransacao(client, null, () =>
      inserirCompra(client, { casa: s.casa, pessoa: s.bia, lancador: s.ana, categoria: s.categoria, valores: ['30.00', '30.00'] }));
    await emTransacao(client, s.ana, () => client.query('DELETE FROM compras WHERE id = $1', [compra]));

    const exclusoes = (await eventosDaCasa(client, s.casa)).filter((e) => e.operacao === 'DELETE');
    expect(exclusoes.map((e) => [e.entidade, e.entidade_id]).sort()).toEqual(
      [['compras', compra], ['parcelas', parcelas[0]], ['parcelas', parcelas[1]]].sort());
    for (const e of exclusoes) {
      expect(e.pessoa_responsavel_id).toBe(s.bia);
      expect(e.usuario_registrador_id).toBe(s.ana);
      expect(JSON.parse(e.conteudo).depois).toBeNull();
    }
  });

  test('edição que recria as parcelas registra quem editou', async () => {
    const s = await criarCenario(client);
    const { compra } = await emTransacao(client, null, () =>
      inserirCompra(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, categoria: s.categoria, valores: ['10.00'] }));
    await emTransacao(client, s.bia, async () => {
      await client.query('DELETE FROM parcelas WHERE compra_id = $1', [compra]);
      await client.query(
        `INSERT INTO parcelas (compra_id, numero_parcela, valor, data_propria) VALUES ($1, 1, 12.00, '2026-12-02')`, [compra]);
    });
    const ultimos = (await eventosDaCasa(client, s.casa)).slice(-2);
    expect(ultimos.map((e) => [e.operacao, e.usuario_registrador_id])).toEqual([['DELETE', s.bia], ['INSERT', s.bia]]);
  });

  soEmA('condição A: eventos sem índice nem hash', async () => {
    const s = await criarCenario(client);
    await emTransacao(client, null, () =>
      inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, valor: '5.00' }));
    const [e] = await eventosDaCasa(client, s.casa);
    expect([e.indice, e.hash_anterior, e.hash]).toEqual([null, null, null]);
  });

  soEmB('condição B: cadeia contínua e recalculável em Node, com a cabeça no último elo', async () => {
    const s = await criarCenario(client);
    const { compra } = await emTransacao(client, null, () =>
      inserirCompra(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, categoria: s.categoria, valores: ['1.00', '2.00', '3.00'] }));
    await emTransacao(client, s.bia, () =>
      client.query(`UPDATE compras SET descricao = 'Pão de açúcar: 1,5 kg' WHERE id = $1`, [compra]));
    await emTransacao(client, null, () =>
      inserirReceita(client, { casa: s.casa, pessoa: null, lancador: s.bia, valor: '99.99' }));

    const eventos = await eventosDaCasa(client, s.casa);
    expect(eventos.map((e) => e.indice)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(problemaNaCadeia(eventos)).toBeNull();

    const { rows } = await client.query('SELECT ultimo_indice, ultimo_hash FROM audit.cadeias WHERE casa_id = $1', [s.casa]);
    expect(rows[0]).toEqual({ ultimo_indice: '6', ultimo_hash: eventos[5].hash });
  });

  soEmB('condição B: Casas têm cadeias independentes', async () => {
    const s = await criarCenario(client);
    await emTransacao(client, null, async () => {
      await inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, valor: '1.00' });
      await inserirReceita(client, { casa: s.outraCasa, pessoa: s.ana, lancador: s.ana, valor: '1.00' });
      await inserirReceita(client, { casa: s.casa, pessoa: s.ana, lancador: s.ana, valor: '2.00' });
    });
    const a = await eventosDaCasa(client, s.casa);
    const b = await eventosDaCasa(client, s.outraCasa);
    expect(a.map((e) => e.indice)).toEqual(['1', '2']);
    expect(b.map((e) => e.indice)).toEqual(['1']);
    expect(problemaNaCadeia(a)).toBeNull();
    expect(problemaNaCadeia(b)).toBeNull();
  });

  soEmB('condição B: escritas simultâneas na mesma Casa não repetem nem pulam índice', async () => {
    const s = await criarCenario(client);
    const POR_CONEXAO = 25;
    const conexoes = await Promise.all([conectar(), conectar(), conectar()]);
    try {
      await Promise.all(conexoes.map(async (c) => {
        for (let i = 0; i < POR_CONEXAO; i++) {
          await emTransacao(c, null, () =>
            inserirReceita(c, { casa: s.casa, pessoa: s.ana, lancador: s.ana, valor: '1.00' }));
        }
      }));
    } finally {
      await Promise.all(conexoes.map((c) => c.end()));
    }
    const eventos = await eventosDaCasa(client, s.casa);
    const total = POR_CONEXAO * conexoes.length;
    expect(eventos.map((e) => Number(e.indice)).sort((x, y) => x - y))
      .toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(problemaNaCadeia(eventos)).toBeNull();
  });
});
