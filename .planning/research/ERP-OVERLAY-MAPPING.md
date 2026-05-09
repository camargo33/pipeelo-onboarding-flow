# ERP Overlay Mapping — Tenants de Referência por ERP

**Status:** Mapeado em 2026-05-09 via Jarvis (`GET /v1/function-calling` + `GET /v1/assistant` em cada tenant).
**Fonte:** API Pipeelo prod.

---

## 1. Conceito

Cada cliente novo é montado em **2 camadas**:

```
PACOTE BASE (igual pra todo cliente)         [prompts AGT, KBs comuns, assistentes, fns transversais]
        +
CAMADA ERP (clonada do tenant referência)    [fns que falam com o ERP do cliente]
        =
TENANT NOVO PRONTO
```

A "camada ERP" é resolvida em runtime pelo Jarvis: lê `respostas.suporte.infraestrutura.erp_utilizado`,
consulta o mapping abaixo, clona functions + KBs ERP-bound do tenant referência pro tenant novo.

---

## 2. Mapping ERP → Tenant Referência

| ERP slug (onboarding) | Tenant referência | tenant_id | pipeelo_token (prefix) | Custom fns |
|---|---|---|---|---|
| `hubsoft` | AGT NET | `b3a5f5a2-4b41-4410-b0dc-b13ede853504` | `nhjpYcrG…` | 15 |
| `voalle` | Techy Internet | `ea7327cd-d59b-40ba-9042-e4c591dcfe91` | `jq8ncgjd…` | 17 (16 reais + `custom_teste` ignorada) |
| `ixc` | Ciabrasnet | `3f81c0f6-d1ef-4b85-96c9-63ac6a5f2667` | `MSW9Q3rv…` | 14 (13 reais + `custom_verificar_mensalidades_testes` ignorada) |
| `mk_solutions` | SEA Telecom | `130c59d7-f6d9-4231-b473-77ca057ac23b` | `mx7HUInH…` | 16 |
| `sgp` | Vale Telecom | `9a9dbb19-975c-4f46-919c-31624c036c63` | `PPPEGbiM…` | 12 |
| `topsapp` | (não atendemos) | — | — | — |
| `integrator` | (sem referência) | — | — | — |
| `outro` | (sem referência) | — | — | — |

**Quando `erp_utilizado ∈ {topsapp, integrator, outro}`** → Jarvis escala via `markNeedsReview('erp_overlay_missing')`.

**iFoz Telecom** (`4bf6cfd2-7a30-49d0-bd7d-652cd39ef30a`) também é SGP mas tem padrão divergente (sem `gera_lead`, sem `status_onu`, com `verificar_sinal`+`verificar_conexao` separados). **Não é referência** — mantido só como observação.

---

## 3. Núcleo CORE — 8 functions universais (presentes em TODOS os 6 tenants)

Mesmo nome em todos, **backend interno difere por ERP**:

```
custom_desbloqueio_confianca
custom_gerar_cobranca
custom_novo_atendimento
custom_reiniciar_conexao
custom_verificar_caixas
custom_verificar_contratos
custom_verificar_mensalidades
custom_verificar_viabilidade
```

→ Estas SEMPRE são clonadas da camada ERP (backend correto vai junto).

---

## 4. Functions transversais (não-ERP) — vão pro PACOTE BASE

Não dependem do ERP. Vão na camada base, idênticas em todos os clientes:

| Function | Origem | Por quê é base |
|---|---|---|
| `custom_gera_lead` | AGT, Techy, Vale | Vai pro CRM Pipeelo, não pro ERP do cliente |
| `custom_verificar_viabilidade` | (todos têm) | Consulta GeoSite/cobertura, não ERP — mesmo backend |
| `custom_enviar_imagem` | AGT | Mídia genérica via Evolution |
| `custom_enviar_arquivo` | AGT | Mídia genérica via Evolution |

→ Estas são criadas **uma vez via skill `pipeelo-lead-capture`** (já existe) e clonadas do AGT (referência das 4) pra qualquer ERP novo.

---

## 5. Functions ERP-bound divergentes (cobertura parcial)

Estas **só existem em alguns ERPs**. Quando o tenant referência do ERP escolhido NÃO tem,
o cliente novo também NÃO terá (estratégia "overlay puro"):

| Function | Hubsoft | Voalle | IXC | MK | SGP-Vale | Lacuna a registrar |
|---|---|---|---|---|---|---|
| `custom_alterar_nome_wifi` | ✓ | ✓ | ✗ | ✓ | ✗ | IXC e SGP não fazem |
| `custom_alterar_senha_wifi` | ✓ | ✓ | ✗ | ✓ | ✗ | IXC e SGP não fazem |
| `custom_status_onu` | ✓ | ✓ | ✗ | ✓ | ✓ | IXC não faz |
| `custom_verificar_dispositivos_conectados` | ✓ | ✓ | ✗ | ✓ | ✗ | IXC e SGP não fazem |
| `custom_verificar_senha_wifi` | ✗ | ✓ | ✗ | ✓ | ✗ | só Voalle/MK |
| `custom_listar_redes_wifi` | ✗ | ✓ | ✗ | ✓ | ✗ | só Voalle/MK |
| `custom_pre_cadastro` | ✗ | ✓ | ✓ | ✓ | ✓ | AGT não tem |

**Implicação:** Se o cliente IXC respondeu no onboarding `troca_senha_wifi == 'sim'`, o Jarvis
sinaliza `needs_review` com motivo `tool_unavailable_for_erp:custom_alterar_senha_wifi:ixc`.

---

## 6. Functions únicas por tenant (NÃO clonar — features específicas do tenant)

Filtradas durante o clone para evitar lixo no novo cliente:

```
agt-hubsoft:    custom_enviar_arquivo, custom_enviar_imagem  → vão pro BASE
techy-voalle:   custom_teste                                  → ignorar (scratch)
ciabrasnet-ixc: custom_cadastrar_participante, custom_consultar_participante,
                custom_finalizar_os, custom_verificar_mensalidades_testes  → ignorar (features Ciabrasnet ou WIP)
sea-mk:         custom_verificar_acesso_app                   → ignorar (specific tenant)
vale-sgp:       custom_enviar_pix                             → ignorar (feature Vale)
ifoz-sgp:       custom_checar_cliente_existente, custom_verificar_conexao,
                custom_verificar_sinal                         → ignorar (padrão divergente)
```

**Regra de filtro do Jarvis:** ao clonar do tenant referência, aplica blacklist `IGNORE_FUNCTIONS_BY_REFERENCE_TENANT[tenant_id]`.

---

## 7. Mapping function → assistente (modelo AGT como base)

Padrão extraído do AGT NET (Hubsoft) — vale como template para qualquer ERP:

| Assistente | Type | Functions custom (esperadas no novo tenant) |
|---|---|---|
| **Principal** | MAIN | `custom_novo_atendimento` |
| **Suporte** | NORMAL | viabilidade, caixas, status_onu, dispositivos, alterar_senha_wifi, alterar_nome_wifi, reiniciar_conexao, contratos, enviar_imagem, enviar_arquivo, novo_atendimento |
| **Financeiro** | NORMAL | contratos, mensalidades, gerar_cobranca, desbloqueio_confianca, novo_atendimento |
| **Vendas** | NORMAL | viabilidade, contratos, gera_lead, novo_atendimento, enviar_imagem |
| **Closer (Inatividade)** | CLOSURE_INACTIVITY | contratos |
| **Closer IA / Atendente** | CLOSURE_AI / CLOSURE_USER | (só nativas) |
| **Análise (Atendente/Cliente)** | ATTENDANT_ANALYSER / ANALYSER | (nenhuma) |

Quando o ERP referência não tiver alguma function listada acima, o Jarvis **vincula só as que existem**
e registra a lacuna na audit trail.

---

## 8. KBs base (vinculadas em todos os assistentes principais)

Identificadas no AGT NET — viram template do pacote base:

```
Chat Protocol             (sistema)
Current Time              (sistema)
Customer Details          (sistema)
Protocolo de Priorização  ← clonar conteúdo
Regras para Resposta por Áudio  ← clonar conteúdo
Tagueamento de conversas  ← gerar do onboarding (skill pipeelo-lead-capture)
Abertura de URA ao transferir  ← clonar conteúdo
```

KBs adicionais por assistente:
- **Vendas:** `Planos disponíveis` ← gerar do onboarding (`respostas.vendas.planos[]`)
- **Closer (Inatividade):** `Protocolo de Conflito`
- **Análise (Cliente):** `CONHECIMENTO_<EMPRESA>` ← gerado por extração

---

## 9. Decisões registradas

| # | Decisão | Justificativa |
|---|---|---|
| 1 | SGP referência = **Vale Telecom** (não iFoz) | Vale tem `gera_lead` + `status_onu` + lean (12 fns). iFoz tem padrão divergente (`verificar_sinal`/`verificar_conexao` separados). |
| 2 | MK e Voalle ficam **separados** mesmo com 95% overlap | Backend interno difere; tratar como ERPs distintos evita decisões cross-API |
| 3 | "Camada ERP = clone puro" — sem fallback inventado | Se referência não tem, novo tenant também não tem. Lacunas viram `needs_review` |
| 4 | 4 functions transversais (`gera_lead`, `verificar_viabilidade`, `enviar_imagem`, `enviar_arquivo`) → BASE | Não dependem do ERP do cliente |
| 5 | TopsApp não atendemos | `topsapp` mantém-se no enum do onboarding mas leva a `needs_review` |
| 6 | Comandos (`PackageCommand`) não usados pelo Jarvis | Escopo confirmado em 2026-05-09: prompts + function callers + KBs |

---

## 10. Refs cruzadas

- Skill `jarvis` (~/.claude/skills/jarvis/) — usada pra mapear e atualizar tools por ERP
- Skill `pipeelo-lead-capture` — gera `custom_gera_lead` em qualquer tenant novo
- `src/lib/questions.json:882` — pergunta `erp_utilizado` (enum source-of-truth)
- `lib/onboarding-processor.ts:1142` (admin-pipeelo) — método legacy `createFunctionsInPipeelo`
