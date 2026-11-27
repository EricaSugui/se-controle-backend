// Uma rodada do experimento (roteiro, seção 9: piloto).
//
//   npm run exp:rodada -- --condicao b --eventos 1000 --semente 1 --saida <pasta> [--alvos 10]
//
// 1. Recria o banco de medição do zero na condição pedida.
// 2. Gera o plano (semente fixa, exatamente N eventos), cria a população e
//    executa a carga medindo a latência de cada operação.
// 3. Mede o armazenamento da auditoria e tira um retrato do contêiner.
// 4. Em B: cria o checkpoint e verifica todas as cadeias (falso positivo?).
// 5. Aplica os cenários de adulteração em alvos sorteados (mesma semente →
//    mesmos alvos em A e em B), cada um numa transação desfeita no fim.
// 6. Grava na pasta da rodada: ambiente.json, parametros.json,
//    operacoes.csv, checkpoint.json e verificacao.json (B), cenarios.csv e
//    resumo.json.

import { execFileSync, execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Client } from 'pg';
import { criarAleatorio } from './aleatorio';
import { conectar } from './banco';
import { criarPopulacao, executarPlano, RegistroOperacao } from './carga';
import { Alvo, EventoDaCasa, Esperado, VARIANTES } from './cenarios';
import { Checkpoint, criarCheckpoint, salvarCheckpoint } from './checkpoint';
import { gerarPlano, MISTURA, POPULACAO } from './gerador';
import { estatisticas, medirArmazenamento, retratoConteiner } from './medidas';
import { verificar } from './verificador';

const RAIZ_BACK = path.resolve(__dirname, '../..');

interface Argumentos { condicao: 'a' | 'b'; eventos: number; semente: number; saida: string; alvos: number }

function lerArgumentos(): Argumentos {
  const a = process.argv.slice(2);
  const valor = (nome: string) => {
    const i = a.indexOf(`--${nome}`);
    return i >= 0 ? a[i + 1] : undefined;
  };
  const condicao = valor('condicao');
  const eventos = Number(valor('eventos'));
  const semente = Number(valor('semente'));
  const saida = valor('saida');
  if ((condicao !== 'a' && condicao !== 'b') || !(eventos > 0) || !Number.isInteger(semente) || !saida) {
    throw new Error('Uso: --condicao a|b --eventos N --semente S --saida <pasta> [--alvos 10]');
  }
  return { condicao, eventos, semente, saida, alvos: Number(valor('alvos') ?? 10) };
}

const ms = (inicio: bigint) => Number(process.hrtime.bigint() - inicio) / 1e6;

function csv(linhas: Array<Record<string, unknown>>): string {
  if (linhas.length === 0) return '';
  const colunas = Object.keys(linhas[0]);
  const celula = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [colunas.join(','), ...linhas.map((l) => colunas.map((c) => celula(l[c])).join(','))].join('\n') + '\n';
}

async function eventosPorCasa(client: Client): Promise<Array<{ casa: string; n: number }>> {
  const { rows } = await client.query(
    'SELECT casa_id, count(*) AS n FROM audit.eventos GROUP BY casa_id ORDER BY casa_id');
  return rows.map((r) => ({ casa: r.casa_id as string, n: Number(r.n) }));
}

async function eventosDaCasa(client: Client, casa: string): Promise<EventoDaCasa[]> {
  const { rows } = await client.query(
    `SELECT id, entidade, jsonb_typeof(conteudo->'depois') = 'object' AS tem_depois
       FROM audit.eventos WHERE casa_id = $1 ORDER BY id`, [casa]);
  return rows.map((r, i) => ({ id: r.id, posicao: i + 1, entidade: r.entidade, temDepois: r.tem_depois === 't' }));
}

async function aplicarCenarios(
  client: Client, args: Argumentos, checkpoint: Checkpoint | null,
): Promise<Array<Record<string, unknown>>> {
  // Semente própria para os alvos, derivada da semente da rodada.
  const r = criarAleatorio(args.semente * 7919 + 17);
  const casas = await eventosPorCasa(client);
  const cache = new Map<string, EventoDaCasa[]>();
  const linhas: Array<Record<string, unknown>> = [];

  for (const v of VARIANTES) {
    for (let tentativa = 1; tentativa <= args.alvos; tentativa++) {
      let alvo: Alvo | null = null;
      for (let sorteio = 0; sorteio < 50 && !alvo; sorteio++) {
        const { casa } = r.escolher(casas.filter((c) => c.n >= v.minimoEventos));
        if (!cache.has(casa)) cache.set(casa, await eventosDaCasa(client, casa));
        alvo = v.escolher(r, casa, cache.get(casa)!);
      }
      if (!alvo) throw new Error(`Sem alvo para a variante ${v.id}`);

      const esperado: Esperado | null = args.condicao === 'b' ? v.esperadoB(alvo) : null;
      let obtido: { situacao: string; motivo?: string; indice?: string; nao_protegidos?: number; erro?: string };
      await client.query('BEGIN');
      try {
        for (const sql of args.condicao === 'a' ? v.sqlA(alvo) : v.sqlB(alvo)) await client.query(sql);
        if (args.condicao === 'a') {
          obtido = { situacao: 'nao_detectado' };   // A não tem verificação histórica
        } else {
          const ckpt = checkpoint!.cadeias.find((c) => c.casa_id === alvo!.casa)!;
          const res = (await verificar(client, { ...checkpoint!, cadeias: [ckpt] })).cadeias[0];
          obtido = { situacao: res.situacao, motivo: res.motivo, indice: res.indice, nao_protegidos: res.nao_protegidos };
        }
      } catch (err) {
        // Em A, uma constraint que barre o ataque conta como detecção.
        obtido = { situacao: args.condicao === 'a' ? 'barrado' : 'erro', erro: (err as Error).message };
      } finally {
        await client.query('ROLLBACK');
      }

      const detectado = obtido.situacao === 'adulterada' || obtido.situacao === 'barrado';
      const conforme = args.condicao === 'a'
        ? obtido.situacao === 'nao_detectado'
        : obtido.situacao === esperado!.situacao && (esperado!.motivo ?? null) === (obtido.motivo ?? null)
          && (esperado!.naoProtegidos === undefined || esperado!.naoProtegidos === obtido.nao_protegidos);
      linhas.push({
        variante: v.id, cenario: v.cenario, tentativa, casa: alvo.casa, eventos_da_casa: alvo.n,
        posicao: alvo.posicao,
        esperado_situacao: esperado?.situacao ?? 'nao_detectado', esperado_motivo: esperado?.motivo ?? '',
        obtido_situacao: obtido.situacao, obtido_motivo: obtido.motivo ?? '', obtido_indice: obtido.indice ?? '',
        detectado, conforme,
        localizado: esperado?.indice !== undefined && obtido.indice !== undefined
          ? String(esperado.indice) === obtido.indice : '',
        erro: obtido.erro ?? '',
      });
    }
  }
  return linhas;
}

function resumirLatencias(registros: RegistroOperacao[]) {
  const porTipo: Record<string, ReturnType<typeof estatisticas>> = {};
  for (const tipo of new Set(registros.map((r) => r.tipo))) {
    porTipo[tipo] = estatisticas(registros.filter((r) => r.tipo === tipo).map((r) => r.latencia_ms));
  }
  return { geral: estatisticas(registros.map((r) => r.latencia_ms)), por_tipo: porTipo };
}

async function main() {
  const args = lerArgumentos();
  const saida = path.resolve(args.saida);
  fs.mkdirSync(saida, { recursive: true });
  const gravar = (nome: string, conteudo: string) => fs.writeFileSync(path.join(saida, nome), conteudo);
  const gravarJson = (nome: string, obj: unknown) => gravar(nome, JSON.stringify(obj, null, 2) + '\n');

  console.log(`→ Rodada ${args.condicao.toUpperCase()}, ${args.eventos} eventos, semente ${args.semente}`);
  execFileSync('bash', ['experimento/scripts/recriar-banco.sh', args.condicao], { cwd: RAIZ_BACK, stdio: 'pipe' });

  const plano = gerarPlano(args.semente, args.eventos);
  gravarJson('parametros.json', {
    condicao: args.condicao, eventos: args.eventos, semente: args.semente, alvos_por_variante: args.alvos,
    operacoes: plano.operacoes.length, populacao: POPULACAO, mistura: Object.fromEntries(MISTURA),
    commit: execSync('git rev-parse HEAD', { cwd: RAIZ_BACK, encoding: 'utf8' }).trim(),
  });

  const client = await conectar();
  try {
    const ids = await criarPopulacao(client, plano.populacao);
    const inicioCarga = process.hrtime.bigint();
    const registros = await executarPlano(client, plano, ids);
    const cargaMs = ms(inicioCarga);
    const retrato = retratoConteiner();

    const total = Number((await client.query('SELECT count(*) AS n FROM audit.eventos')).rows[0].n);
    if (total !== args.eventos) throw new Error(`Esperava ${args.eventos} eventos, há ${total}`);

    gravar('operacoes.csv', csv(registros.map((r) => ({ ...r, latencia_ms: r.latencia_ms.toFixed(4) }))));
    const armazenamento = await medirArmazenamento(client);

    let checkpoint: Checkpoint | null = null;
    let verificacao = null;
    if (args.condicao === 'b') {
      checkpoint = await criarCheckpoint(client);
      salvarCheckpoint(checkpoint, path.join(saida, 'checkpoint.json'));
      const rel = await verificar(client, checkpoint);
      gravarJson('verificacao.json', rel);
      verificacao = {
        situacao: rel.situacao,
        casas: rel.cadeias.length,
        falsos_positivos: rel.cadeias.filter((c) => c.situacao !== 'integra').length,
        eventos_verificados: rel.cadeias.reduce((s, c) => s + c.eventos_verificados, 0),
        total_ms: rel.total_ms,
        leitura_ms: rel.cadeias.reduce((s, c) => s + c.leitura_ms, 0),
        calculo_ms: rel.cadeias.reduce((s, c) => s + c.calculo_ms, 0),
      };
    }

    const cenarios = await aplicarCenarios(client, args, checkpoint);
    gravar('cenarios.csv', csv(cenarios));
    const porVariante: Record<string, { tentativas: number; detectados: number; conformes: number }> = {};
    for (const c of cenarios) {
      const v = (porVariante[c.variante as string] ??= { tentativas: 0, detectados: 0, conformes: 0 });
      v.tentativas += 1;
      if (c.detectado) v.detectados += 1;
      if (c.conforme) v.conformes += 1;
    }

    gravarJson('resumo.json', {
      condicao: args.condicao, eventos: args.eventos, semente: args.semente,
      operacoes: registros.length,
      carga_ms: cargaMs,
      vazao_operacoes_s: registros.length / (cargaMs / 1000),
      vazao_eventos_s: args.eventos / (cargaMs / 1000),
      latencia_ms: resumirLatencias(registros),
      armazenamento,
      verificacao,
      cenarios: porVariante,
      conteiner_apos_carga: retrato,
    });

    execFileSync('node', ['experimento/scripts/ambiente.js', path.join(saida, 'ambiente.json')],
      { cwd: RAIZ_BACK, stdio: 'pipe' });

    const naoConformes = cenarios.filter((c) => !c.conforme).length;
    console.log(`✓ ${registros.length} operações em ${(cargaMs / 1000).toFixed(1)} s; `
      + `latência mediana ${resumirLatencias(registros).geral.mediana.toFixed(2)} ms; `
      + `${(armazenamento.bytes_por_evento).toFixed(0)} B/evento`
      + (verificacao ? `; verificação ${verificacao.total_ms.toFixed(0)} ms, ${verificacao.falsos_positivos} falsos positivos` : '')
      + `; cenários fora do esperado: ${naoConformes}`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Erro na rodada:', err.message);
  process.exit(1);
});
