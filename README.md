# Se Controle — backend

Backend Express/TypeScript do Se Controle, com PostgreSQL/Supabase.

## Ambientes

| Ambiente | Arquivo | Banco / Auth | Uso |
|---|---|---|---|
| DEV | `.env.dev` | Supabase local (`npm run supabase:start`) | Desenvolvimento |
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

Requer o **Docker Desktop** rodando. Tudo roda na sua máquina: nada
toca o TCC nem a produção.

```bash
npm install
npm run supabase:start   # sobe o Supabase local, grava as chaves em .env.dev
                         # (e em ../front/.env.dev), aplica migrations e fixtures
npm run dev              # backend em http://localhost:3000
```

No front: `npm run web`. Login de teste:
`teste.admin@fixture.example`, com a senha em
`HML_FIXTURE_ADMIN_PASSWORD` no `.env.dev`.

| Comando | O que faz |
|---|---|
| `npm run supabase:start` | Sobe (ou reaproveita) o Supabase local e prepara o banco. Pode rodar de novo sem duplicar nada |
| `npm run supabase:stop` | Para os containers **mantendo** os dados |
| `npm run supabase:reset` | Apaga o banco local e recria do zero |
| `npm run supabase:status` | URLs e estado |

| Serviço local | Endereço |
|---|---|
| API do Supabase (Auth) | http://127.0.0.1:54321 |
| Banco | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (painel) | http://127.0.0.1:54323 |
| Mailpit (e-mails de convite e do Auth) | http://127.0.0.1:54324 |

O Supabase local roda só Auth e banco (mais Studio e Mailpit). As chaves
dele são as padrão de desenvolvimento da CLI: não são segredo e não valem
na nuvem. A configuração está em `supabase/config.toml`. O arquivo
`supabase/paridade-plataforma.sql` recria o `ensure_rls` (RLS automático
em tabelas novas), que na nuvem é criado pela plataforma.

**No celular** (dev client ou APK `dev`): troque `localhost`/`127.0.0.1`
pelo IP da máquina na rede nos `EXPO_PUBLIC_*` do `front/.env.dev`.

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

## Backup e restauração

O plano gratuito do Supabase não faz backup. Os backups são lógicos
(`supabase db dump`: roles, schema e dados), **criptografados** e salvos
fora do repositório (`~/se-controle-backups`). Exigem o Docker Desktop
rodando.

```bash
npm run db:backup:prod                    # pede a DATABASE_URL de PROD na hora (não salva)
npm run db:backup:tcc                     # usa .env.tcc
npm run db:restore-test -- prod           # testa o backup de PROD mais recente (ou: tcc | <arquivo.enc>)
```

Faça `db:backup:prod` **antes de toda migration em produção**.

**Restauração real** (faz antes um backup de segurança do estado atual e
pede confirmação digitada):

```bash
npm run db:restore:tcc                    # modo app: restaura public/private no mesmo projeto
npm run db:restore:prod                   # idem, em produção
npm run db:restore:prod -- --completo     # projeto perdido: restaura tudo num projeto NOVO
```

Procedimento completo (retenção, senha, cenários de restauração) no
repositório `se-controle-workspace`, em `docs/ambiente/backup-restauracao.md`.

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
