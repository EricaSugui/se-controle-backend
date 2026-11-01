import { criarNomeArquivoBase, calcularTotalRelatorio } from './relatorioAcerto';

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
});
