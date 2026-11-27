# Diário de método do experimento

Registro das escolhas e dos parâmetros usados, bloco a bloco, para a
redação de Material e Métodos (no passado, com o que foi realmente feito).
O plano e as decisões de desenho ficam no workspace, em
`docs/planos/pesquisa-hashchain.md` (seções 6 e 9).

## Bloco 0: banco de medição (27/11/2026)

**O que foi feito**

- Banco de medição num contêiner Docker dedicado (`docker-compose.yml`),
  separado do Supabase local do DEV, com a imagem oficial
  `postgres:17.12` (mesma versão principal do Supabase usado pelo
  produto). Primeira execução com o id de imagem
  `sha256:97fb53376be3e4fb1a8a61421daa69dcc3bf2fa39bda3259f5245f9a455af1a9`.
- Limites do contêiner: **4 CPUs**, **4 GB de memória** e 256 MB de
  memória compartilhada. Porta `127.0.0.1:55432`. Servidor e sessão em
  UTC.
- Configurações do Postgres: as **padrão da imagem**, sem ajuste
  (por exemplo `shared_buffers` = 128 MB, `synchronous_commit` = on,
  `fsync` = on, `jit` = on). Cada rodada grava os valores efetivos no
  `ambiente.json`.
- O banco é recriado do zero antes de cada rodada
  (`npm run exp:recriar -- a|b|base`): o contêiner e o volume são
  apagados, e o schema é montado na ordem compatibilidade → migrations
  do produto (78 em 27/11/2026) → SQL do experimento.
- **Compatibilidade com o Supabase** (`sql/00-compat-supabase.sql`): 31
  migrations do produto concedem permissões ao papel `authenticated` e
  usam `auth.uid()` nas políticas de RLS. O arquivo cria só os papéis
  `anon`, `authenticated` e `service_role`, o schema `auth` e a função
  `auth.uid()`. Com isso, as migrations rodaram sem alteração num
  Postgres puro, e o plano B (imagem `supabase/postgres`) não foi
  necessário. O harness conecta como `postgres`, que não é afetado
  pelo RLS, então esses objetos não interferem na medição.
- Registro do ambiente (`npm run exp:ambiente -- <arquivo>`): data,
  commit e branch (com indicação de alterações não commitadas), CPU,
  threads e memória da máquina, sistema, versões do Node, do driver
  `pg`, do Docker e do Postgres, limites efetivos do contêiner e as
  configurações do Postgres que afetam escrita e armazenamento.

**Máquina usada (27/11/2026)**

- Intel Core i7-13620H (16 threads lógicos), 15,7 GB de RAM, Windows 11
  Home (10.0.26300), Docker Desktop 29.9.3 (backend WSL 2), Node 22.23.4.

**Tempo de recriação:** cerca de 15 segundos com a imagem já baixada.

**A lembrar nas rodadas**

- Desligar o Supabase local do DEV (`npm run supabase:stop`) e fechar
  programas pesados, para reduzir o ruído (a máquina é compartilhada
  com o contêiner pelo WSL 2).
- Não usar o `src/db.ts` do produto no verificador: ele converte
  `numeric` em `float` (bloco 1).
