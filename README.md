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
