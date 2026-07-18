# Tenência — Registro de Decisão: Marca e Posicionamento

**Projeto:** Tenência (anteriormente Se Controle)
**Data da decisão:** Julho/2026
**Status:** Aprovado — pendente apenas execução dos registros

---

## 1. Contexto

O MVP do app de finanças familiares (casas, pessoas, contas, receitas, despesas, dashboards por caixa e competência, saldo projetado) atingiu a primeira versão funcional em web, mobile e APK Android. O projeto será usado como TCC do MBA em Engenharia de Software, com visão de longo prazo de empresa vendável — não app de renda passiva em app store.

O nome original "Se Controle" foi reavaliado por dois motivos:
1. **Semântica de restrição** ("controle-se, pare de gastar") — conflita com o reposicionamento para *planejamento e tranquilidade*.
2. Construção gramatical atípica em contexto profissional/investidor.

---

## 2. Posicionamento (frase-tese)

> **"Planejamento financeiro para a casa, não para o indivíduo."**
> A família enxerga junta o próprio futuro: o que está comprometido, o que sobra, e o que acontece se algo mudar.

**Diferenciação em dois eixos simultâneos:**
- **Colaborativo** (casa vs. pessoa) — a entidade central do sistema já é a casa; concorrentes (Mobills, Organizze etc.) são individuais e sofrem para retrofitar compartilhamento.
- **Prospectivo** (futuro vs. registro do passado) — perguntas-tese: "quanto da renda está comprometida?", "consigo comprar X agora?", "e se a renda cair 20%?".

**Diretriz de vocabulário:** evitar culpa e vigilância ("controlar gastos", "cortar", "vilão do orçamento"); usar clareza e antecipação ("saber antes", "enxergar o mês", "decidir junto"). O dashboard é um mapa, não um tribunal.

---

## 3. Nome escolhido: **Tenência** (apelido: **Tenê**)

### Origem
Expressão usada pela avó da fundadora — "tenha tenência" — no contexto de cuidado com dinheiro e planejamento. História de origem real, envolvendo três gerações na escolha (avó forneceu a palavra; fundadora e filha reconheceram o valor).

### Significado (dupla camada)
- **Uso popular brasileiro:** prudência, precaução, cautela — sinônimo de juízo, siso, tino, firmeza. "Tomar tenência" = observar com atenção e cuidado.
- **Etimologia:** do latim vulgar *tenentia* ("o que se tem, bens", de *tenēre*, ter). Derivou no séc. XIII a palavra "tença" — renda periódica para prover sustento.
- **Síntese:** a palavra carrega nas duas pontas da história os dois lados do produto — *o que a casa tem* (patrimônio) e *o juízo para cuidar dele* (prudência).

### Arquitetura nome oficial + apelido
- **Tenência** — nome oficial: sobriedade, história, registro no INPI, pitch, capa do TCC.
- **Tenê** — apelido falado do dia a dia ("lançou aquela fatura no Tenê?"). Padrão Méqui/Zap: o apelido é *permitido*, nunca imposto pelo marketing. Pode aparecer em momentos de intimidade do produto (ex.: notificações — "o Tenê lembrou: conta de luz vence amanhã"), humanizando o app como membro da casa, não sistema de vigilância.

### Riscos conhecidos e aceitos
| Risco | Avaliação |
|---|---|
| Comprimento (4 sílabas) | Mitigado pelo apelido Tenê |
| 1º significado de dicionário: "cargo de tenente" | Irrelevante na fala popular |
| "Tenencia" em espanhol = imposto veicular (México) | Limitação apenas para expansão hispânica futura; trade-off consciente de nome com raiz cultural brasileira |
| Parte do público jovem não conhece a palavra | Oportunidade de contar a história ("sua avó já sabia") |

### Finalistas descartados (registro do funil)
- **Avista** — duplo sentido forte (avistar + à vista), mas exige explicação na primeira audição.
- **Antevê** — significado perfeito, mas oxítona soou "engraçada" como nome oficial (característica que, como apelido, seria qualidade — insight que levou ao Tenê).
- **Arca** — simbologia rica (reserva + proteção familiar), mas encontro vocálico ("a Arca") e ambiguidade de artigo.
- **Vintém** — afetivo e sonoro, mas conotação de valor pequeno.
- **Tino** — bloqueado: fintech ativa tino.com.br (meio de pagamento B2B, aguardando licenças do BC).
- **Tento** — colisão semântica: ponto de truco (confirmada em teste familiar) + ambiguidade "eu tento".
- **Provi** — ex-fintech brasileira de crédito estudantil (hoje PrincipiaPay); risco de reconhecimento residual.
- **Planeo** — múltiplos apps de finanças existentes com o nome, inclusive mirando público brasileiro.

---

## 4. Verificações realizadas

### INPI (busca de anterioridade) — ✅ LIVRE
Classes **NCL 36** (serviços financeiros) e **NCL 42** (software/SaaS), para as grafias: Tenência, Tenencia, Tenê, Tene.

### Buscas abertas (web, apps, empresas) — ✅ SEM COLISÃO NO BRASIL
Nenhuma empresa, app, fintech ou startup brasileira usando Tenência ou Tenê no setor.

### Domínios
| Domínio | Status | Decisão |
|---|---|---|
| tenencia.com.br | Registrado por terceiro (sem site) | Monitorar expiração via whois; eventual compra amigável futura, **após** protocolo da marca |
| tene.com.br | Registrado por terceiro (sem site) | Ignorar |
| tenencia.com | Especulado (R$ 40 mil, GoDaddy) | Ignorar solenemente — provável mira no mercado mexicano ("tenencia" = imposto veicular) |
| **tenhatenencia.com.br** | ✅ Disponível | **Registrar** no registro.br (~R$ 40/ano) |
| **tenencia.app** | ✅ Disponível | **Registrar** na Cloudflare Registrar (US$ 14,20/ano, renovação idêntica — preço de custo) |

---

## 5. Arquitetura de domínios (divisão por FUNÇÃO, não por dispositivo)

**Decisão:** um domínio para *convencer*, outro para *usar*. Rejeitada a divisão por dispositivo (desktop vs. celular), que fragmentaria sessão de auth (Supabase), quebraria links compartilhados entre membros da casa e dividiria SEO.

### tenhatenencia.com.br — casa institucional
- Landing page com a história (a avó, a tenência, o planejamento da casa)
- Explicação do produto; futuramente blog/conteúdo educativo (aquisição orgânica)
- Endereço do marketing, do TCC, do pitch
- Frase-domínio passa no "teste do rádio" (ouvir e digitar sem soletrar)
- Pode nascer depois — o app funciona sem ele

### tenencia.app — o produto inteiro, em qualquer dispositivo
- Web app responsivo (Expo web) servindo notebook e celular no mesmo endereço
- Sessão única, auth com um só conjunto de redirect URLs
- **Futuro (lojas/APK):** hospeda os arquivos de associação — `assetlinks.json` (Android) e Apple App Site Association — habilitando **links universais**: tenencia.app/convite/xyz abre direto no app nativo se instalado, ou no web app se não. Essencial para o fluxo de convite de membros da casa.
- TLD .app: HTTPS obrigatório (HSTS no nível do TLD) — atendido automaticamente pela Vercel

**Fluxo entre os dois:** site institucional → botões "Entrar"/"Criar conta" → tenencia.app. App → link discreto de volta ao site.

**Infra:** dois projetos na Vercel (site pode ser estático simples); backend único no Railway; DNS na Cloudflare (obrigatório pelo registrar; começar em modo "DNS only", proxy opcional no futuro). Certificados SSL: automáticos e gratuitos (Let's Encrypt via Vercel) — custo zero de HTTPS em toda a stack.

---

## 6. Checklist de execução

- [ ] Protocolar marca **Tenência** no INPI — classes NCL 36 e NCL 42 (fazer ANTES de qualquer contato com donos de domínios ocupados)
- [ ] Registrar **tenencia.app** na Cloudflare Registrar
- [ ] Registrar **tenhatenencia.com.br** no registro.br
- [ ] Reservar handles nas redes sociais (@tenencia ou variação disponível)
- [ ] Anotar titular e data de expiração do tenencia.com.br (whois no registro.br) para monitoramento
- [ ] Migrar o produto de se-controle-app.vercel.app para tenencia.app (configurar domínio na Vercel + redirect URLs do Supabase Auth)
- [ ] Atualizar nome no app, repositório e textos (remover "se-controle" antes que o codebase cresça)
- [ ] Revisar microtextos do app: eliminar resquícios de semântica "controle/restrição", adotar voz da tenência
- [ ] (Depois, com calma) Construir landing em tenhatenencia.com.br

---

## 7. Backlog relacionado (já documentado anteriormente)

- **Motor de cenários** — camada pura de projeção (estado real + deltas hipotéticos → linha do tempo projetada), entidade `cenario` persistível e comparável. Responde às três perguntas-tese. Pré-requisito: desacoplar lógica de projeção da tela de saldo projetado. Frase de marca disponível: *"tome tenência do seu futuro"*.
- **Decisões em aberto para a visão empresa:** auditabilidade/LGPD (event log deferido ganha segundo motivo de existir); modelo de cobrança por casa vs. por pessoa (multi-casa cria a pergunta: quem paga a assinatura de uma casa com membros de planos diferentes?).

---

## 8. Nota para o TCC

A distância entre "Se Controle" (imperativo de restrição — vigiar gastos) e "Tenência" (substantivo de sabedoria herdada — cuidar do que a casa tem) é exatamente a distância entre o app de registro e o sistema de planejamento familiar. O nome novo *conta* o reposicionamento — material para o capítulo de branding/produto.