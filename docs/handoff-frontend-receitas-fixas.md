# Features novas no backend: Receitas Fixas + Fuso Horário — implementar no app

> Brief para levar ao Claude Code do repo do frontend. O contrato completo
> está no `openapi.bundled.yml` (versão **3.3.0**) do backend — usar como
> fonte da verdade. Auth igual ao resto: Bearer token do Supabase.

## Contexto

Duas novidades no backend (se-controle-backend):

1. **Receitas fixas** — espelho das despesas fixas para o lado das entradas:
   salário CLT, pensão, aluguel recebido, freelance recorrente. Se o app já
   implementa despesas fixas, ~90% do padrão se repete — este brief destaca
   as diferenças.
2. **Fuso horário por pessoa** — o "hoje" dos cálculos de status agora é o
   do usuário, não o do servidor.

## Receitas Fixas

### Modelo mental (igual a despesas fixas)

Contrato (`receitas_fixas`) → recebimento (receita comum vinculada) →
status calculado pelo backend. **Nunca calcular status no frontend.**
Receita pontual/avulsa continua indo direto em `POST /receitas`, sem template.

### Endpoints

- `GET /receitas-fixas` — filtros `casa_id`, `pessoa_id`, `vigente=true|false`;
  itens trazem `origem_nome`
- `GET /receitas-fixas/:id`
- `POST /receitas-fixas` — body: `casa_id` OU `pessoa_id`, `origem_id`,
  `descricao`, `tipo_confiabilidade` (`fixa`|`variavel`), `valor_esperado?`
  (number ou null), `periodicidade` (`mensal`|`anual`),
  `dia_esperado_recebimento` (1–31), `vigente_desde`, `vigente_ate?`,
  `receita_fixa_anterior_id?`
- `PUT /receitas-fixas/:id` — escopo, sucessão e lancado_por imutáveis
- `PATCH /receitas-fixas/:id/encerrar` — body opcional `{ vigente_ate }`
  (default hoje). É o fluxo de "fim de recorrência" (ex.: demissão)
- `GET /receitas-fixas/status?competencia=JUL-26&folga_dias=3`
- `GET /receitas?receita_fixa_id=N` — histórico de recebimentos do contrato
- "Marcar como recebido" = `POST /receitas` com `receita_fixa_id` +
  `competencia_referencia`

### Diferenças vs despesas fixas (atenção!)

| Aspecto | Despesas fixas | Receitas fixas |
|---|---|---|
| Catálogo | `categoria_id` → categorias | **`origem_id` → origens-receita** |
| Valor | `valor_referencia` obrigatório | **`valor_esperado` opcional (pode ser null)** |
| Dia | `dia_esperado` | **`dia_esperado_recebimento`** |
| Natureza | `tipo_valor`: fixo/variavel_estimado | **`tipo_confiabilidade`: fixa/variavel** |
| Status | 4 estados (pago/em_dia/vencendo_hoje/em_atraso) | **3 estados: `recebido` / `aguardando` / `atrasado`** |

- UI do status: `valor_esperado` null → mostrar algo como "valor variável"
  (o `tipo_confiabilidade` vem em cada item do status para diferenciar CLT
  de freelance).
- Vínculo com receita fixa **pessoal** exige `pessoa_id` preenchido na
  receita (400 sem ele).
- Receita sem `competencia` só pode ser vinculada se mandar
  `competencia_referencia` explícita (400 se ambas ausentes).
- 13º salário: modelar como receita fixa **anual** com `vigente_desde` em
  dezembro — a `competencia_referencia` do recebimento deve usar esse
  mês-âncora (DEZ-25, DEZ-26, ...); outros meses são rejeitados com 400.

### Sugestão de telas

1. Espelhar as telas de despesas fixas: gestão de contratos + status.
2. Uma visão combinada "mês esperado" (receitas `atrasado`/`aguardando` +
   despesas `em_atraso`/`vencendo_hoje`) é a semente da futura projeção de
   saldo — mas a projeção em si está fora de escopo por enquanto.

## Fuso horário por pessoa

- Campo novo `fuso_horario` em pessoas (IANA, ex. `America/Sao_Paulo`,
  `America/Manaus`, `Pacific/Honolulu`). Default: `America/Sao_Paulo` —
  ninguém é obrigado a configurar.
- Vem no `GET /auth/me`; editável via `PUT /pessoas/:id` (só os próprios
  dados; omitido no PUT, mantém o atual; inválido → 400).
- **Efeito**: o "hoje" usado em `/despesas-fixas/status`,
  `/receitas-fixas/status`, no filtro `?vigente=` e no default do encerrar é
  calculado no fuso do usuário. Consultar às 23h não vira o dia antes da hora.
- **Sugestão de UX**: na tela de perfil, oferecer o fuso com sugestão do
  dispositivo (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — enviar
  só se o usuário confirmar/alterar.
- ~~**Atenção**: o PUT de pessoas é replace de `nome`/`email`~~ (corrigido
  depois: `email` omitido agora mantém o atual; `null` explícito limpa).

## Checklist de integração

- [ ] Client/services de receitas-fixas (CRUD + encerrar + status)
- [ ] Form de receita ganha vínculo opcional com receita fixa
- [ ] Telas de contratos e status de recebimentos (3 estados)
- [ ] Perfil: seleção de fuso horário com sugestão do dispositivo
- [ ] Tipos TypeScript regenerados/atualizados a partir do bundle 3.3.0
