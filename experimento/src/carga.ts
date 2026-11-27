// Executor da carga do piloto: cria a população e executa o plano do
// gerador, uma operação por transação, medindo a latência de cada uma.
//
// Latência de escrita = do BEGIN ao fim do COMMIT, medida no cliente
// (process.hrtime), com uma única conexão e operações em sequência (o
// projeto não alega alta concorrência). Inclui as idas e voltas ao banco,
// iguais em A e em B, e os triggers de auditoria, que são a diferença.

import { Client } from 'pg';
import { Operacao, Plano, Populacao } from './gerador';

export interface IdsPopulacao {
  pessoas: string[];
  casas: string[];
  categorias: string[];
  fixas: string[];       // por ordinal: casa * fixasPorCasa + j
}

export interface RegistroOperacao {
  ordem: number;
  tipo: Operacao['tipo'];
  eventos: number;
  latencia_ms: number;
}

async function id(client: Client, sql: string, params: unknown[]): Promise<string> {
  return (await client.query(`${sql} RETURNING id`, params)).rows[0].id as string;
}

// População: não é auditada (pessoas, casas, categorias e despesas fixas
// não têm trigger), então não entra na contagem de eventos.
export async function criarPopulacao(client: Client, p: Populacao): Promise<IdsPopulacao> {
  await client.query('BEGIN');
  try {
    const pessoas: string[] = [];
    for (let i = 0; i < p.pessoas; i++) {
      pessoas.push(await id(client, 'INSERT INTO pessoas (nome) VALUES ($1)', [`Pessoa sintética ${i + 1}`]));
    }
    const casas: string[] = [];
    let compartilhada = 0;
    for (const c of p.casas) {
      casas.push(c.pessoal
        ? await id(client, `INSERT INTO casas (nome, pessoal, dono_pessoa_id) VALUES ('Pessoal', true, $1)`, [pessoas[c.dono!]])
        : await id(client, 'INSERT INTO casas (nome) VALUES ($1)', [`Casa sintética ${++compartilhada}`]));
    }
    const categorias: string[] = [];
    for (let i = 0; i < p.categorias; i++) {
      categorias.push(await id(client, 'INSERT INTO categorias (nome) VALUES ($1)', [`Categoria sintética ${i + 1}`]));
    }
    const fixas: string[] = [];
    for (const [ci, casa] of casas.entries()) {
      for (let j = 0; j < p.fixasPorCasa; j++) {
        fixas.push(await id(client,
          `INSERT INTO despesas_fixas (casa_id, categoria_id, descricao, dia_esperado, periodicidade, tipo_valor, valor_referencia, vigente_desde)
           VALUES ($1, $2, $3, 10, 'mensal', 'fixo', 100, '2026-01-01')`,
          [casa, categorias[0], `Fixa ${ci + 1}.${j + 1}`]));
      }
    }
    await client.query('COMMIT');
    return { pessoas, casas, categorias, fixas };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function inserirParcelas(client: Client, compra: string, valores: string[], data: string) {
  for (const [i, valor] of valores.entries()) {
    await client.query(
      'INSERT INTO parcelas (compra_id, numero_parcela, valor, data_propria) VALUES ($1, $2, $3, $4)',
      [compra, i + 1, valor, data]);
  }
}

export async function executarPlano(
  client: Client, plano: Plano, ids: IdsPopulacao,
): Promise<RegistroOperacao[]> {
  const compras: string[] = [];    // ordinal → id
  const receitas: string[] = [];
  const dataDaCompra = new Map<string, string>();
  const registros: RegistroOperacao[] = [];

  for (const [ordem, op] of plano.operacoes.entries()) {
    const usuario = ids.pessoas[op.registrador];
    const inicio = process.hrtime.bigint();
    await client.query('BEGIN');
    try {
      await client.query(`SELECT set_config('app.usuario_id', $1, true)`, [usuario]);
      switch (op.tipo) {
        case 'inserir_compra': {
          const compra = await id(client,
            `INSERT INTO compras (casa_id, pessoa_id, lancado_por_id, categoria_id, descricao, data, competencia, total_parcelas)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [ids.casas[op.casa], ids.pessoas[op.pessoa], usuario, ids.categorias[op.categoria],
              op.descricao, op.data, op.competencia, op.valores.length]);
          await inserirParcelas(client, compra, op.valores, op.data);
          compras.push(compra);
          dataDaCompra.set(compra, op.data);
          break;
        }
        case 'editar_compra': {
          // Como o PUT /compras/:id do produto: atualiza a compra e recria as parcelas.
          const compra = compras[op.compra];
          await client.query('UPDATE compras SET descricao = $2, total_parcelas = $3 WHERE id = $1',
            [compra, op.descricao, op.valores.length]);
          await client.query('DELETE FROM parcelas WHERE compra_id = $1', [compra]);
          await inserirParcelas(client, compra, op.valores, dataDaCompra.get(compra)!);
          break;
        }
        case 'vincular':
          await client.query('UPDATE compras SET despesa_fixa_id = $2, competencia_referencia = $3 WHERE id = $1',
            [compras[op.compra], op.fixa === null ? null : ids.fixas[op.fixa], op.competencia]);
          break;
        case 'cancelar_compra':
          await client.query(
            `UPDATE compras SET status = 'cancelada', cancelada_em = now(), cancelada_por_id = $2,
                    cancelamento_motivo = 'Lançado por engano' WHERE id = $1`,
            [compras[op.compra], usuario]);
          break;
        case 'apagar_compra':
          await client.query('DELETE FROM compras WHERE id = $1', [compras[op.compra]]);
          break;
        case 'inserir_receita':
          receitas.push(await id(client,
            `INSERT INTO receitas (casa_id, pessoa_id, lancado_por_id, valor_liquido, observacao, data, competencia)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [ids.casas[op.casa], op.pessoa === null ? null : ids.pessoas[op.pessoa], usuario,
              op.valor, op.observacao, op.data, op.competencia]));
          break;
        case 'editar_receita':
          await client.query('UPDATE receitas SET valor_liquido = $2, observacao = $3 WHERE id = $1',
            [receitas[op.receita], op.valor, op.observacao]);
          break;
        case 'apagar_receita':
          await client.query('DELETE FROM receitas WHERE id = $1', [receitas[op.receita]]);
          break;
        case 'mudar_casa': {
          const tabela = op.alvo === 'compras' ? 'compras' : 'receitas';
          const alvo = op.alvo === 'compras' ? compras[op.ordinal] : receitas[op.ordinal];
          await client.query(`UPDATE ${tabela} SET casa_id = $2 WHERE id = $1`, [alvo, ids.casas[op.casaDestino]]);
          break;
        }
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Operação ${ordem} (${op.tipo}) falhou: ${(err as Error).message}`);
    }
    const latencia = Number(process.hrtime.bigint() - inicio) / 1e6;
    registros.push({ ordem, tipo: op.tipo, eventos: op.eventos, latencia_ms: latencia });
  }
  return registros;
}
