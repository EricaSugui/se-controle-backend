# Se Controle — backend

Backend Express/TypeScript do Se Controle, com PostgreSQL/Supabase.

## Ambientes

| Ambiente | Arquivo | Banco / Auth | Uso |
|---|---|---|---|
| DEV | `.env.dev` | Supabase local (`supabase start`) | Desenvolvimento |
| TCC | `.env.tcc` | Projeto Supabase do TCC (nuvem) | Pesquisa do TCC |
| PROD | — | Projeto Supabase de produção | Só no Railway |

Crie os arquivos a partir do modelo (`cp .env.example .env.dev`). Nenhum
`.env*` é versionado, exceto `.env.example`.

**Nenhum código carrega `.env` implicitamente.** As variáveis vêm sempre do
script npm (`dotenv -e .env.<ambiente>`, ou `--envPath` nas migrations).
Rodar `node` direto em `src/` ou `scripts/` não carrega ambiente nenhum. Não
existem scripts de produção locais: credenciais de produção ficam só no
Railway.

## Desenvolvimento local (DEV)

```bash
npm install
npm run migrate:up     # .env.dev
npm run db:seed        # fixtures de teste
npm run dev
```

## TCC

```bash
npm run migrate:tcc
npm run dev:tcc
npm run db:seed:tcc
npm run db:clean:tcc
npm run db:reset:tcc
```

`db:seed*` preserva fixtures reutilizáveis, e os scripts de limpeza atuam
somente na casa fixture (que não existe em produção).

## Validação

```bash
npm test
npm run build
```

## Migrations

As migrations devem ser aplicadas em cada ambiente antes do deploy do código
que depende delas:

```bash
npm run migrate:up    # DEV
npm run migrate:tcc   # TCC
```

Em produção, as migrations rodam com as variáveis do Railway
(`node-pg-migrate up`). Se é por pré-deploy no Railway ou manual ainda está
em decisão (plano de ambientes do workspace, 4.7). Faça backup antes. As migrations de onboarding e casa principal são
`1785030000005`, `1785030000006` e `1785030000007`; a última adiciona
`casas.usa_custeio`, habilitada por padrão. A migration `1785100000000`
adiciona `convites.tipo` (`email`/`interno`) e
`convites.destinatario_pessoa_id`; ela precisa estar aplicada antes do
deploy do fluxo de convites internos (ver `docs/convites.md`).

`POST /convites` consulta o Supabase Auth para saber se o e-mail já tem
conta, então `SUPABASE_SERVICE_ROLE_KEY` é obrigatória em todos os
ambientes que criam convites.
