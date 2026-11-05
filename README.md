# Se Controle — backend

Backend Express/TypeScript do Se Controle, com PostgreSQL/Supabase.

## Desenvolvimento local

```bash
npm install
npm run migrate:up
npm run dev
```

O backend local usa as variáveis de `back/.env`. Nunca use credenciais de
produção nos scripts de limpeza ou seed.

## Homologação

O ambiente de homologação usa um projeto Supabase separado e o arquivo
`.env.hml`:

```bash
npm run migrate:hml
npm run dev:hml
npm run db:seed:homolog
npm run db:clean:homolog
npm run db:reset:homolog
```

`db:seed:homolog` preserva fixtures reutilizáveis, e os scripts de limpeza
atuam somente na casa fixture. Os arquivos `.env.hml` não são versionados.

## Validação

```bash
npm test
npm run build
```

## Migrations

As migrations devem ser aplicadas em cada ambiente antes do deploy do código
que depende delas. Para homologação:

```bash
npm run migrate:hml
```

Em produção, use o `.env.prod` do ambiente de deploy e execute
`node-pg-migrate up`. As migrations de onboarding e casa principal são
`1785030000005`, `1785030000006` e `1785030000007`; a última adiciona
`casas.usa_custeio`, habilitada por padrão.
