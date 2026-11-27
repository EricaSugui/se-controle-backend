# Experimento do TCC: hash chain nos registros de auditoria

Código do experimento que compara a condição A (log convencional) com a
condição B (log com hash chain e checkpoint). Plano, decisões e roteiro:
`docs/planos/pesquisa-hashchain.md` no workspace (seções 6 e 9). As
escolhas e os parâmetros usados ficam em [NOTAS.md](NOTAS.md).

**Nada daqui vai para PROD nem para o TCC:** o SQL do experimento não fica
em `migrations/`, e o banco de medição é um contêiner local próprio.

## Uso

Requer o Docker Desktop rodando.

```bash
npm run exp:recriar -- a        # banco do zero, condição A
npm run exp:recriar -- b        # banco do zero, condição B
npm run exp:recriar -- base     # só o schema do produto
npm run exp:ambiente -- experimento/resultados/<rodada>/ambiente.json
npm run exp:test                # recria em B e roda os testes do experimento
npm run exp:typecheck           # confere os tipos do experimento
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
| `sql/2*-condicao-a.sql`, `sql/2*-condicao-b.sql` | Trigger de cada condição (bloco 2) |
| `src/` | Conexão em texto bruto (`banco.ts`) e serialização/hash em TypeScript (`serializacao.ts`) |
| `test/` | Testes contra o banco de medição (`npm run exp:test`) |
| `scripts/` | Recriar o banco e registrar o ambiente |
| `resultados/` | Uma pasta por rodada (fora do git) |
