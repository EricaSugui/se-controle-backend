// Gerador de dados sintéticos do piloto (roteiro, seção 9).
//
// Puro: a partir de uma semente, monta a população e um plano de operações
// que gera EXATAMENTE N eventos de auditoria. O mesmo plano roda em A e em
// B (mesma semente → mesmas operações, na mesma ordem). As operações imitam
// o produto: a edição de compra atualiza a compra e recria todas as
// parcelas (1 + 2k eventos), o cancelamento é um UPDATE de status e a
// exclusão de compra apaga as parcelas em cascata (NOTAS.md, requisitos do
// gerador).
//
// As referências a compras e receitas são ordinais (ordem de criação); o
// executor (carga.ts) traduz para os ids do banco.

import { Aleatorio, criarAleatorio } from './aleatorio';

// ---------------------------------------------------------------------
// Parâmetros (registrados em parametros.json de cada rodada)
// ---------------------------------------------------------------------
export const POPULACAO = {
  pessoas: 12,              // cada uma com o seu espaço pessoal
  casasCompartilhadas: 4,   // com 2 a 4 membros cada
  categorias: 5,
  fixasPorCasa: 2,          // despesas fixas por Casa, para os vínculos
  pesoCompartilhadas: 0.6,  // chance de uma inclusão cair numa Casa compartilhada
};

// Mistura de operações (pesos em %). Sem dados reais de uso: é uma
// suposição declarada, com inclusões predominando e todas as formas de
// escrita do produto presentes.
export const MISTURA = [
  ['inserir_compra', 35],
  ['inserir_receita', 20],
  ['editar_compra', 15],
  ['editar_receita', 8],
  ['vincular', 7],
  ['cancelar_compra', 5],
  ['apagar_receita', 4],
  ['apagar_compra', 3],
  ['mudar_casa', 3],
] as const;

// Parcelas por compra: 70% à vista; o resto de 2 a 12 vezes.
const PARCELAS: ReadonlyArray<readonly [number, number]> = [
  [1, 70], [2, 6], [3, 6], [4, 3], [5, 2], [6, 4], [8, 2], [10, 4], [12, 3],
];

const DESCRICOES = [
  'Mercado', 'Feira', 'Farmácia', 'Padaria', 'Açougue: 2,5 kg', 'Combustível',
  'Restaurante', 'Conta de luz', 'Água', 'Internet', 'Presente 🎁', 'Pão de açúcar',
];
const OBSERVACOES = ['Salário', 'Freelance', 'Reembolso', 'Aluguel recebido', 'Venda: bicicleta'];

export type TipoOperacao = (typeof MISTURA)[number][0];

// ---------------------------------------------------------------------
// População
// ---------------------------------------------------------------------
export interface CasaPlano {
  pessoal: boolean;
  dono: number | null;   // índice da pessoa (espaço pessoal)
  membros: number[];     // índices das pessoas
}

export interface Populacao {
  pessoas: number;
  casas: CasaPlano[];    // compartilhadas primeiro, depois os espaços pessoais
  categorias: number;
  fixasPorCasa: number;
}

function gerarPopulacao(r: Aleatorio): Populacao {
  const casas: CasaPlano[] = [];
  for (let c = 0; c < POPULACAO.casasCompartilhadas; c++) {
    const membros = new Set<number>();
    const tamanho = r.inteiro(2, 4);
    while (membros.size < tamanho) membros.add(r.inteiro(0, POPULACAO.pessoas - 1));
    casas.push({ pessoal: false, dono: null, membros: [...membros].sort((x, y) => x - y) });
  }
  for (let p = 0; p < POPULACAO.pessoas; p++) casas.push({ pessoal: true, dono: p, membros: [p] });
  return { pessoas: POPULACAO.pessoas, casas, categorias: POPULACAO.categorias, fixasPorCasa: POPULACAO.fixasPorCasa };
}

// ---------------------------------------------------------------------
// Operações
// ---------------------------------------------------------------------
interface Base { eventos: number; registrador: number }

export type Operacao = Base & (
  | { tipo: 'inserir_compra'; casa: number; pessoa: number; categoria: number; descricao: string; data: string; competencia: string; valores: string[] }
  | { tipo: 'editar_compra'; compra: number; descricao: string; valores: string[] }
  | { tipo: 'vincular'; compra: number; fixa: number | null; competencia: string | null }
  | { tipo: 'cancelar_compra'; compra: number }
  | { tipo: 'apagar_compra'; compra: number }
  | { tipo: 'inserir_receita'; casa: number; pessoa: number | null; valor: string; observacao: string; data: string; competencia: string }
  | { tipo: 'editar_receita'; receita: number; valor: string; observacao: string }
  | { tipo: 'apagar_receita'; receita: number }
  | { tipo: 'mudar_casa'; alvo: 'compras' | 'receitas'; ordinal: number; casaDestino: number }
);

export interface Plano {
  semente: number;
  eventos: number;
  populacao: Populacao;
  operacoes: Operacao[];
}

interface CompraViva { casa: number; parcelas: number; ativa: boolean; vinculada: boolean }

export function gerarPlano(semente: number, eventosAlvo: number): Plano {
  const r = criarAleatorio(semente);
  const populacao = gerarPopulacao(r);
  const compartilhadas = populacao.casas.map((c, i) => (c.pessoal ? -1 : i)).filter((i) => i >= 0);
  const pessoais = populacao.casas.map((c, i) => (c.pessoal ? i : -1)).filter((i) => i >= 0);

  const compras = new Map<number, CompraViva>();   // ordinal → estado
  const receitas = new Map<number, number>();      // ordinal → casa
  let proximaCompra = 0;
  let proximaReceita = 0;

  const escolherCasa = () =>
    r.chance(POPULACAO.pesoCompartilhadas) ? r.escolher(compartilhadas) : r.escolher(pessoais);
  const membro = (casa: number) => r.escolher(populacao.casas[casa].membros);
  const dataCompetencia = () => {
    const mes = r.inteiro(1, 12);
    const dia = r.inteiro(1, 28);
    const mm = String(mes).padStart(2, '0');
    return { data: `2026-${mm}-${String(dia).padStart(2, '0')}`, competencia: `2026-${mm}` };
  };
  const valoresParcelas = () => {
    const k = r.ponderado(PARCELAS);
    const valor = r.centavos(5, 500);
    return Array.from({ length: k }, () => valor);
  };
  const ativas = () => [...compras.entries()].filter(([, c]) => c.ativa).map(([o]) => o);

  const novaReceita = (): Operacao => {
    const casa = escolherCasa();
    const { data, competencia } = dataCompetencia();
    return {
      tipo: 'inserir_receita', eventos: 1, casa, registrador: membro(casa),
      pessoa: r.chance(0.1) ? null : membro(casa), valor: r.centavos(50, 8000),
      observacao: r.escolher(OBSERVACOES), data, competencia,
    };
  };
  const novaCompra = (): Operacao => {
    const casa = escolherCasa();
    const valores = valoresParcelas();
    return {
      tipo: 'inserir_compra', eventos: 1 + valores.length, casa, registrador: membro(casa),
      pessoa: membro(casa), categoria: r.inteiro(0, populacao.categorias - 1),
      descricao: r.escolher(DESCRICOES), ...dataCompetencia(), valores,
    };
  };

  // Monta a operação sorteada; sem alvo possível, cai numa inclusão de compra.
  const montar = (tipo: TipoOperacao): Operacao => {
    switch (tipo) {
      case 'inserir_compra': return novaCompra();
      case 'inserir_receita': return novaReceita();
      case 'editar_compra': {
        const lista = ativas();
        if (lista.length === 0) return novaCompra();
        const compra = r.escolher(lista);
        const antes = compras.get(compra)!;
        const valores = valoresParcelas();
        return {
          tipo, compra, registrador: membro(antes.casa), descricao: r.escolher(DESCRICOES), valores,
          eventos: 1 + antes.parcelas + valores.length,
        };
      }
      case 'vincular': {
        const lista = ativas();
        if (lista.length === 0) return novaCompra();
        const compra = r.escolher(lista);
        const c = compras.get(compra)!;
        const desvincular = c.vinculada && r.chance(0.5);
        const fixa = desvincular ? null : c.casa * populacao.fixasPorCasa + r.inteiro(0, populacao.fixasPorCasa - 1);
        return {
          tipo, compra, registrador: membro(c.casa), eventos: 1,
          fixa, competencia: desvincular ? null : dataCompetencia().competencia,
        };
      }
      case 'cancelar_compra': {
        const lista = ativas();
        if (lista.length === 0) return novaCompra();
        const compra = r.escolher(lista);
        return { tipo, compra, registrador: membro(compras.get(compra)!.casa), eventos: 1 };
      }
      case 'apagar_compra': {
        const lista = [...compras.keys()];
        if (lista.length === 0) return novaCompra();
        const compra = r.escolher(lista);
        const c = compras.get(compra)!;
        return { tipo, compra, registrador: membro(c.casa), eventos: 1 + c.parcelas };
      }
      case 'editar_receita':
      case 'apagar_receita': {
        const lista = [...receitas.keys()];
        if (lista.length === 0) return novaCompra();
        const receita = r.escolher(lista);
        const registrador = membro(receitas.get(receita)!);
        return tipo === 'editar_receita'
          ? { tipo, receita, registrador, eventos: 1, valor: r.centavos(50, 8000), observacao: r.escolher(OBSERVACOES) }
          : { tipo, receita, registrador, eventos: 1 };
      }
      case 'mudar_casa': {
        // Só entre Casas compartilhadas (o espaço pessoal é de uma pessoa só).
        const candidatas: Array<['compras' | 'receitas', number, number]> = [
          ...ativas().map((o) => ['compras', o, compras.get(o)!.casa] as ['compras', number, number]),
          ...[...receitas.entries()].map(([o, casa]) => ['receitas', o, casa] as ['receitas', number, number]),
        ].filter(([, , casa]) => !populacao.casas[casa].pessoal);
        if (candidatas.length === 0) return novaCompra();
        const [alvo, ordinal, casa] = r.escolher(candidatas);
        const casaDestino = r.escolher(compartilhadas.filter((c) => c !== casa));
        return { tipo, alvo, ordinal, casaDestino, registrador: membro(casa), eventos: 2 };
      }
    }
  };

  // Atualiza o estado conhecido depois de cada operação.
  const aplicar = (op: Operacao) => {
    switch (op.tipo) {
      case 'inserir_compra':
        compras.set(proximaCompra++, { casa: op.casa, parcelas: op.valores.length, ativa: true, vinculada: false });
        break;
      case 'inserir_receita': receitas.set(proximaReceita++, op.casa); break;
      case 'editar_compra': compras.get(op.compra)!.parcelas = op.valores.length; break;
      case 'vincular': compras.get(op.compra)!.vinculada = op.fixa !== null; break;
      case 'cancelar_compra': compras.get(op.compra)!.ativa = false; break;
      case 'apagar_compra': compras.delete(op.compra); break;
      case 'apagar_receita': receitas.delete(op.receita); break;
      case 'editar_receita': break;
      case 'mudar_casa':
        if (op.alvo === 'compras') compras.get(op.ordinal)!.casa = op.casaDestino;
        else receitas.set(op.ordinal, op.casaDestino);
        break;
    }
  };

  const operacoes: Operacao[] = [];
  let restante = eventosAlvo;
  while (restante > 0) {
    let op = montar(r.ponderado(MISTURA));
    // Fecha em exatamente N eventos: se a operação passaria do alvo, vira
    // uma inclusão de receita (1 evento).
    if (op.eventos > restante) op = novaReceita();
    aplicar(op);
    operacoes.push(op);
    restante -= op.eventos;
  }
  return { semente, eventos: eventosAlvo, populacao, operacoes };
}
