-- Condição B: log com hash chain, uma cadeia por Casa (decisões 2 e 3).
--
-- Acrescenta à tabela comum as colunas de encadeamento obrigatórias e a
-- cabeça de cada cadeia, travada com SELECT ... FOR UPDATE a cada evento.
--
-- Os triggers (30-triggers.sql) são os mesmos nas duas condições; só a
-- função audit.gravar_evento muda.

ALTER TABLE audit.eventos
  ALTER COLUMN indice        SET NOT NULL,
  ALTER COLUMN hash_anterior SET NOT NULL,
  ALTER COLUMN hash          SET NOT NULL;

-- Último elo de cada cadeia. O verificador NÃO confia nesta tabela (ela
-- fica no banco que pode ser adulterado): ele compara a cadeia recalculada
-- com o checkpoint guardado fora (decisão 4).
CREATE TABLE audit.cadeias (
  casa_id        integer   PRIMARY KEY REFERENCES public.casas (id),
  ultimo_indice  bigint    NOT NULL CHECK (ultimo_indice >= 0),
  ultimo_hash    char(64)  NOT NULL
);

-- Encadeia e grava o evento montado pelo trigger:
--   1. cria a cabeça da cadeia da Casa, se for o primeiro evento dela;
--   2. trava a cabeça (escritas na mesma Casa esperam; Casas diferentes, não);
--   3. índice = último + 1; hash = SHA-256(hash anterior || serialização);
--   4. grava o evento e avança a cabeça.
-- Tudo na transação da operação auditada.
CREATE FUNCTION audit.gravar_evento(e audit.eventos) RETURNS void
  LANGUAGE plpgsql
  AS $$
DECLARE
  cabeca audit.cadeias;
BEGIN
  INSERT INTO audit.cadeias (casa_id, ultimo_indice, ultimo_hash)
  VALUES (e.casa_id, 0, audit.hash_inicial())
  ON CONFLICT (casa_id) DO NOTHING;

  SELECT * INTO cabeca FROM audit.cadeias WHERE casa_id = e.casa_id FOR UPDATE;

  e.indice        := cabeca.ultimo_indice + 1;
  e.hash_anterior := cabeca.ultimo_hash;
  e.hash          := audit.hash_evento(e.hash_anterior, audit.serializar(e));

  INSERT INTO audit.eventos
    (casa_id, indice, operacao, entidade, entidade_id, pessoa_responsavel_id,
     usuario_registrador_id, ocorrido_em, conteudo, hash_anterior, hash)
  VALUES
    (e.casa_id, e.indice, e.operacao, e.entidade, e.entidade_id, e.pessoa_responsavel_id,
     e.usuario_registrador_id, e.ocorrido_em, e.conteudo, e.hash_anterior, e.hash);

  UPDATE audit.cadeias
     SET ultimo_indice = e.indice, ultimo_hash = e.hash
   WHERE casa_id = e.casa_id;
END
$$;
