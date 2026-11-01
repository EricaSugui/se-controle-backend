import {
  criarNomeArquivoBase,
  calcularTotalRelatorio,
  gerarCsvRelatorio,
  gerarPdfRelatorio,
  gerarAjustesEstorno,
} from './relatorioAcerto';

describe('relatório de acerto', () => {
  it('usa o nome da casa no nome base do arquivo', () => {
    expect(criarNomeArquivoBase('Casa da Mamãe', ['Erica', 'Karina'], new Date('2026-10-31T12:00:00Z')))
      .toBe('acerto-casa-da-mamae-2026-10-31');
  });

  it('usa nomes dos participantes quando a casa não tem nome', () => {
    expect(criarNomeArquivoBase('', ['Erica', 'Karina'], new Date('2026-10-31T12:00:00Z')))
      .toBe('casa-erica-karina-2026-10-31');
  });

  it('trunca o nome sem remover a data', () => {
    const nome = criarNomeArquivoBase('Uma casa com um nome extremamente longo '.repeat(10), ['Erica'], new Date('2026-10-31T12:00:00Z'));
    expect(nome).toHaveLength(180);
    expect(nome.endsWith('-2026-10-31')).toBe(true);
  });

  it('calcula o total pelo desembolso snapshotado', () => {
    expect(calcularTotalRelatorio([
      { desembolsado: 100 },
      { desembolsado: 50.5 },
    ])).toBe(150.5);
  });

  it('gera CSV com escaping e moeda explícita', () => {
    const csv = gerarCsvRelatorio({
      nome_casa: 'Casa "X"',
      moeda: 'BRL',
      confirmado_em: new Date('2026-10-31T12:00:00Z'),
      participantes: [{ nome: 'Erica', devido: 50, desembolsado: 100, saldo: 50 }],
      despesas: [{ descricao: 'Calça, azul', valor: 100, nome_pessoa: 'Erica' }],
      transferencias: [],
    });
    expect(csv).toContain('"Casa ""X"""');
    expect(csv).toContain('"Calça, azul"');
    expect(csv).toContain('participante');
    expect(csv).toContain('BRL');
  });

  it('gera um PDF válido a partir do snapshot', async () => {
    const pdf = await gerarPdfRelatorio({
      nome_casa: 'Casa X',
      moeda: 'BRL',
      confirmado_em: new Date('2026-10-31T12:00:00Z'),
      participantes: [{ nome: 'Erica', devido: 50, desembolsado: 100, saldo: 50 }],
      despesas: [],
      transferencias: [],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('cria estorno de R$ 50 para quem pagou quando a compra de R$ 100 foi rateada em 50%', () => {
    expect(gerarAjustesEstorno({
      origemId: 10,
      casaId: 2,
      valor: 100,
      desembolsadoPor: { id: 1, nome: 'Erica' },
      rateios: [{ id: 2, nome: 'Irmã', percentual: 50 }, { id: 1, nome: 'Erica', percentual: 50 }],
      data: '2026-10-31',
    })).toEqual([
      expect.objectContaining({ de_pessoa_id: 1, para_pessoa_id: 2, valor: 50, tipo: 'estorno' }),
    ]);
  });
});
