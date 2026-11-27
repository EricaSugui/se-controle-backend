# Experimento do TCC: hash chain nos registros de auditoria

Código do experimento que compara a condição A (log convencional) com a
condição B (log com hash chain e checkpoint). Plano, decisões e roteiro:
`docs/planos/pesquisa-hashchain.md` no workspace (seções 6 e 9). As
escolhas e os parâmetros usados ficam em [NOTAS.md](NOTAS.md), e as figuras e
tabelas para o texto, em [FIGURAS.md](FIGURAS.md).

**Nada daqui vai para PROD nem para o TCC:** o SQL do experimento não fica
em `migrations/`, e o banco de medição é um contêiner local próprio.

## Uso

Requer o Docker Desktop rodando.

```bash
npm run exp:recriar -- a        # banco do zero, condição A
npm run exp:recriar -- b        # banco do zero, condição B
npm run exp:recriar -- base     # só o schema do produto
npm run exp:ambiente -- experimento/resultados/<rodada>/ambiente.json
npm run exp:test                # testes em A e em B, cada uma com o banco recriado
npm run exp:test -- b           # só uma condição
npm run exp:typecheck           # confere os tipos do experimento
npm run exp:checkpoint -- <rodada>/checkpoint.json          # condição B
npm run exp:verificar -- <rodada>/checkpoint.json [relatorio.json]
npm run exp:figuras             # imagens dos diagramas de FIGURAS.md em figuras/
npm run exp:parar               # derruba o contêiner e apaga o volume
```

Banco de medição: `postgresql://postgres:experimento@127.0.0.1:55432/experimento`
(só local; senha fixa e sem valor fora da máquina).

## Estrutura

| Caminho | O quê |
|---|---|
| `docker-compose.yml` | Postgres 17.12 de medição, 4 CPUs e 4 GB |
| `sql/00-*.sql` | Compatibilidade mínima com o Supabase para as migrations do produto |
| `sql/1*.sql` | Comum às condições: schema `audit`, eventos, serialização (bloco 1) |
| `sql/2*-condicao-a.sql`, `sql/2*-condicao-b.sql` | O que muda entre A e B: constraints e `audit.gravar_evento` (bloco 2) |
| `sql/3*.sql` | Triggers de auditoria em `compras`, `parcelas` e `receitas`, iguais nas duas condições (bloco 2) |
| `src/` | Conexão em texto bruto (`banco.ts`), serialização e hash (`serializacao.ts`), checkpoint (`checkpoint.ts`), verificador (`verificador.ts`) e linha de comando (`cli.ts`) |
| `test/` | Testes contra o banco de medição (`npm run exp:test`) |
| `scripts/` | Recriar o banco, registrar o ambiente, rodar os testes e gerar as figuras |
| `figuras/` | Imagens dos diagramas (PNG e SVG), geradas por `npm run exp:figuras` |
| `resultados/` | Uma pasta por rodada (fora do git) |

## Antes de levar esta branch para a `develop`

A `pesquisa/hashchain` não roda a CI (o workflow só dispara em `develop` e
`main`). Ao integrar:

- **CI mais lenta por causa do `mermaid-cli`.** Ele é devDependency e, no
  `npm ci`, o Puppeteer baixa um navegador headless (centenas de MB) a cada
  execução. A CI não gera figuras, então basta definir
  `PUPPETEER_SKIP_DOWNLOAD: "true"` no `env` do job em
  `.github/workflows/ci.yml`. Quem precisar gerar figuras localmente roda o
  `npm install` normal, que baixa o navegador.
- **Os testes do experimento ficam fora da CI de propósito**: o
  `jest.config.js` da raiz só olha `src/`, e `npm run exp:test` precisa do
  Docker com o banco de medição.
