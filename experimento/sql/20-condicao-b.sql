-- Condição B: log com hash chain, uma cadeia por Casa (decisões 2 e 3).
--
-- Acrescenta à tabela comum as colunas de encadeamento obrigatórias e a
-- cabeça de cada cadeia, travada com SELECT ... FOR UPDATE a cada evento.
--
-- Os triggers nas tabelas auditadas entram no bloco 2 do roteiro.

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
