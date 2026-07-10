# Dados comerciais na criação do link de onboarding

**Data:** 2026-07-10 · **Aprovado por:** Felipe

## Objetivo

Registrar, já na criação do link pelo admin, os dados comerciais do deal: valor da
sessão, quantidade de sessões, valor mensal, dia de vencimento da mensalidade e
observações — e propagar tudo no payload final enviado ao admin.pipeelo.com.

## Armazenamento

5 colunas novas em `onboarding_sessions` (padrão flat existente, todas opcionais):

| Coluna | Tipo | Nota |
| --- | --- | --- |
| `valor_sessao` | `numeric(10,2)` | R$ por sessão (ex: 0.65) |
| `qtd_sessoes` | `integer` | sessões contratadas/mês |
| `valor_mensal` | `numeric(12,2)` | R$ mensal — livre, com sugestão sessão × qtd na UI |
| `dia_vencimento` | `smallint` | dia do mês 1–31 (check) |
| `observacoes` | `text` | livre |

DDL aplicada em prod via `scripts/apply-dados-comerciais.mjs` (pooler 6543).

## Superfícies

- **Form admin (Criar Novo Link):** seção "Dados Comerciais · opcional" abaixo da
  Stack. Valor mensal auto-sugere `valor_sessao × qtd_sessoes` enquanto não editado
  manualmente. Dia de vencimento = select 1–31.
- **APIs:** `_sessions-create.ts` aceita/insere os 5 campos; `_sessions-update.ts`
  aceita patch (edição posterior). Zod em ambos.
- **Card da sessão:** resumo dos dados comerciais quando preenchidos (chips) +
  edição via popover no mesmo padrão da Stack.
- **Payload final (`complete-onboarding.ts`):** bloco nested
  `session.comercial = { valor_sessao, qtd_sessoes, valor_mensal, dia_vencimento, observacoes }`
  + `SessionEnvelopeSchema` (contracts) atualizado com teste.

## Fora de escopo

- Receiver: admin.pipeelo.com precisa passar a ler `session.comercial` (lado Alisson).
  O schema é `passthrough()`, então nada quebra até lá.
- Mensagens de WhatsApp/e-mail não incluem os dados comerciais.

## Deploy

DDL via script → commit+push `main` → EasyPanel auto-build → sonda
`onboarding.pipeelo.com/build-info.json`.
