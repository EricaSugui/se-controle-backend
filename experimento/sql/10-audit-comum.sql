-- Comum às condições A e B: schema `audit`, tabela de eventos,
-- serialização canônica e função de hash (decisões 3 e 5; roteiro, bloco 1).
--
-- A condição A usa só a tabela e as constraints daqui. A condição B
-- acrescenta, em 20-condicao-b.sql, a cabeça das cadeias e as colunas de
-- encadeamento obrigatórias. A serialização existe também em TypeScript
-- (src/serializacao.ts); as duas são testadas com os mesmos vetores.

CREATE SCHEMA audit;

-- ---------------------------------------------------------------------
-- Modelo de evento auditável
-- ---------------------------------------------------------------------
CREATE TABLE audit.eventos (
  id                      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Cadeia a que o evento pertence (decisão 2: uma cadeia por Casa).
  casa_id                 integer     NOT NULL REFERENCES public.casas (id),
  -- Posição na cadeia da Casa, a partir de 1. Só na condição B (encadeamento).
  indice                  bigint,
  operacao                text        NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
  entidade                text        NOT NULL CHECK (entidade IN ('compras', 'parcelas', 'receitas')),
  entidade_id             bigint      NOT NULL,
  -- Pessoa responsável pelo fato financeiro ("Quem gastou"); pode faltar.
  pessoa_responsavel_id   integer     REFERENCES public.pessoas (id),
  -- Usuário que registrou a operação (lancado_por_id ou app.usuario_id).
  usuario_registrador_id  integer     NOT NULL REFERENCES public.pessoas (id),
  ocorrido_em             timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Linha antes e depois da operação: {"antes": ..., "depois": ...}.
  conteudo                jsonb       NOT NULL,
  -- Só na condição B.
  hash_anterior           char(64),
  hash                    char(64),
  CONSTRAINT eventos_indice_positivo CHECK (indice IS NULL OR indice >= 1),
  CONSTRAINT eventos_indice_por_casa UNIQUE (casa_id, indice)
);

COMMENT ON TABLE audit.eventos IS
  'Log de auditoria do experimento do TCC (condições A e B). Fora das migrations do produto.';

-- ---------------------------------------------------------------------
-- Serialização canônica (decisão 3)
-- ---------------------------------------------------------------------
-- Cada campo vira `tamanho:valor,` (tamanho em bytes UTF-8, à moda das
-- netstrings), o que dispensa escape. Nulo vira `~`, sem tamanho: como
-- todo campo não nulo começa por um dígito, não há ambiguidade.
CREATE FUNCTION audit.campo(valor text) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT CASE
      WHEN valor IS NULL THEN '~'
      ELSE octet_length(valor)::text || ':' || valor || ','
    END
  $$;

-- Data em UTC, ISO-8601, sempre com 6 casas de microssegundos.
CREATE FUNCTION audit.data_canonica(valor timestamptz) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT to_char(valor AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;

-- Ordem fixa dos campos. O primeiro é a versão do formato: se ele mudar,
-- a versão muda, e cadeias antigas continuam verificáveis pela versão
-- antiga. `id`, `hash_anterior` e `hash` ficam de fora: o `id` é só
-- técnico (a ordem na cadeia é o `indice`), e o encadeamento entra no
-- cálculo do hash (audit.hash_evento).
CREATE FUNCTION audit.serializar(e audit.eventos) RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$
    SELECT audit.campo('v1')
        || audit.campo(e.casa_id::text)
        || audit.campo(e.indice::text)
        || audit.campo(e.operacao)
        || audit.campo(e.entidade)
        || audit.campo(e.entidade_id::text)
        || audit.campo(e.pessoa_responsavel_id::text)
        || audit.campo(e.usuario_registrador_id::text)
        || audit.campo(audit.data_canonica(e.ocorrido_em))
        || audit.campo(e.conteudo::text)
  $$;

-- ---------------------------------------------------------------------
-- Hash (SHA-256, FIPS 180-4), usado só na condição B
-- ---------------------------------------------------------------------
-- hash = SHA-256(hash_anterior || serialização), em hexadecimal minúsculo.
CREATE FUNCTION audit.hash_evento(hash_anterior text, serializacao text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT
  AS $$ SELECT encode(sha256(convert_to(hash_anterior || serializacao, 'UTF8')), 'hex') $$;

-- Hash anterior do primeiro evento de cada cadeia: 64 zeros.
CREATE FUNCTION audit.hash_inicial() RETURNS text
  LANGUAGE sql IMMUTABLE
  AS $$ SELECT repeat('0', 64) $$;
