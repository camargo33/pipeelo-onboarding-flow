# Pipeelo Onboarding Flow — v2 Upgrade

## What This Is

Onboarding self-service da Pipeelo para novos clientes ISP. Cliente preenche um questionário em 5 departamentos (~128 perguntas) e, ao finalizar, todo o tenant é criado e configurado automaticamente na plataforma Pipeelo — categorias, KBs, assistentes de IA, prompts e function callings — sem toque humano no caminho feliz. Substitui o processo atual onde o time precisava configurar tudo manualmente após reuniões com o cliente.

## Core Value

**Cliente termina o questionário → tenant fica vivo na Pipeelo automaticamente em até 24h, com prompts de qualidade auditável.** Se isso falhar, o produto não cumpre sua promessa.

## Requirements

### Validated

<!-- Existing capabilities inferred from codebase map -->

- ✓ Questionário com 128 perguntas em 5 departamentos (identificacao, sac_geral, financeiro, suporte, vendas) — v3.2.0 já em produção
- ✓ Renderização de questões com tipos variados (text, select, table, conditional) via `QuestionRenderer.tsx` + DSL `evaluateConditional`
- ✓ Persistência de sessão no Supabase próprio (`llsqqbbhcdosrtpvvkml`, sa-east-1)
- ✓ Deploy Vercel funcional em `pipeelo-onboarding-flow.vercel.app`
- ✓ Sessão de teste em `/teste-pipeelo` para validação interna
- ✓ IDV 2026 parcial aplicada (Forest Floor + verde, dark-first forçado)
- ✓ Templates de prompt skeleton em `src/lib/prompt-templates/` (main, vendas DEF, suporte, financeiro, closer)
- ✓ Endpoint `/api/clients/onboarding/create` no admin-pipeelo recebe webhook e armazena sessão em `onboarding_sessions`
- ✓ Endpoint `/api/clients/onboarding/process` + `lib/onboarding-processor.ts` (1295 linhas) executa pipeline determinístico
- ✓ UI `/onboarding-sessions` no admin para listar/processar sessões manualmente

### Active

<!-- v2 Upgrade scope. Hypotheses until shipped. -->

#### Pilar 1 — Hardening do Onboarding Flow
- [ ] Persistência parcial intra-departamento (salvar a cada pergunta, não só ao terminar departamento)
- [ ] Identificação como gate de início (CNPJ + email + WhatsApp validados antes de liberar departamentos)
- [ ] Progress bar mostrando 5 departamentos (hoje hardcoded em 4 — Identificação não conta)
- [ ] Validações inline + botões voltar/adiantar consistentes
- [ ] IDV 2026 oficial completa (logo correto, paleta Forest Floor + Lime, tipografia Inter, polimento visual)
- [ ] Migrar `supabase.from()` direto do browser para `/api/*` Vercel Functions (server-side)
- [ ] Restaurar RLS estrita (reverter `relax_rls_for_testing.sql`)
- [ ] Rate limit em `/api/create-session` e demais endpoints públicos
- [ ] Validar e sanitizar inputs (XSS no email, etc)
- [ ] Webhook de finalização com `keepalive` e retry

#### Pilar 2 — Pipeline de Ingestão Robusta
- [ ] Confirmar/alinhar shape do payload entre onboarding-flow e `OnboardingRespostas` interface do admin-pipeelo
- [ ] Padronizar autenticação webhook (`ONBOARDING_WEBHOOK_TOKEN` nos 2 lados)
- [ ] Idempotência no webhook (já existe via `session_id` unique — validar)
- [ ] Validação de identificação no gate do webhook (rejeitar sessões incompletas)
- [ ] Status machine clara: `pending → processing → completed | failed | needs_review`

#### Pilar 3 — Jarvis Cron Pipeline (Substitui o Processor Determinístico)
- [ ] Schedule (`/schedule` ou cron Vercel) que aciona Jarvis em sessões `pending` diariamente
- [ ] Jarvis cria tenant + admin user via API Pipeelo
- [ ] Jarvis cria categorias do tenant baseado em `departamentos_lista` do questionário
- [ ] Jarvis cria KBs (knowledge bases) com dados do questionário (cidades, telefones, planos, etc)
- [ ] Jarvis cria assistentes (Principal, Vendas, Suporte, Financeiro, Closer) com prompts gerados via prompt-optimizer + DNA tom 8 regras
- [ ] Jarvis vincula function callings (gera_lead, transferir_atendente, consultar_cliente_erp, etc) aos assistentes corretos
- [ ] Jarvis configura ElevenLabs (TTS) se cliente optou por voz
- [ ] Resolved cases / log de tudo que Jarvis fez (auditoria + rollback)
- [ ] Notificação se Jarvis falhar em qualquer etapa (alerta Felipe)

#### Pilar 4 — Painel + Notificações
- [ ] Painel admin (`/onboarding-sessions` revisado) com filtros, status visual, drill-down em respostas
- [ ] Cliente recebe link com token pra retomar sessão se sair no meio
- [ ] Email Resend de boas-vindas (CEO recebe link do questionário)
- [ ] Email Resend de lembrete (cliente parado >48h)
- [ ] Email Resend final (credenciais + tutorial após Jarvis terminar)
- [ ] Dashboard interno: quantas sessões em pending, processing, failed por dia

### Out of Scope

- **Mudanças no questionário** — as 128 perguntas atuais são suficientes (confirmado). Add/remove de pergunta vira PR pontual, não pilar.
- **Retornar a integração Lovable Cloud** — projeto migrou pra Vercel + Supabase próprio. Não voltamos.
- **Onboarding multi-tenant** (1 sessão = N tenants) — escopo é 1:1 (1 sessão = 1 tenant ISP).
- **Onboarding pra verticais não-ISP** (LT1 IMOB, etc) — esse fluxo é específico ISP. Outras verticais terão flow próprio.
- **Substituir totalmente o processor manual** — `/onboarding-sessions` continua existindo como fallback caso Jarvis falhe.
- **Auto-deploy de tenant** — criar tenant na infraestrutura Pipeelo é só metadata, não provisiona infra (tenant compartilha banco/edge).
- **Pagamento / cobrança** — onboarding é gratuito até go-live. Cobrança é tratada à parte via contratos.

## Context

### Repositórios envolvidos
- `~/Desktop/pipeelo-onboarding-flow` — frontend Vite + React + TS + Vercel Functions (este projeto)
- `~/Desktop/admin-pipeelo` — Next.js 15 admin com endpoints `/api/clients/onboarding/{create,process}` e `lib/onboarding-processor.ts`
- API Pipeelo (`api.pipeelo.com`) — backend de produção que recebe operações de tenant (provavelmente fora deste escopo, só consumido)

### Stack confirmada
- Vite 5 + React 18 + TypeScript (não-strict)
- Tailwind + shadcn/ui (Radix), tema dark-first
- React Router, React Hook Form + Zod
- Supabase JS client (PostgreSQL + RLS)
- Vercel Functions Node runtime (extensões `.js` em imports)
- Sem testes automatizados (zero infra de Vitest/Jest/Playwright)

### Skill Jarvis (skill global no `~/.claude/skills`)
Skill que orquestra automações operacionais Pipeelo: WhatsApp Evolution API, reports, casos pendentes, criação de categorias/usuários/funções via API Pipeelo, ElevenLabs, Trello [IA] cards. Esta v2 estende Jarvis pra processar onboarding sessions.

### Posicionamento estratégico
Pipeelo se posiciona como Sistema Operacional de Relacionamento para ISPs. Onboarding é o primeiro contato real do cliente com a plataforma — qualidade técnica + UX premium aqui é gatilho de retenção.

### Branch ativa
`migration/vercel` — 2255+/544- vs `main`, ainda não mergeada. Decisão de quando merger será tomada após Pilar 1 estabilizar.

## Constraints

- **Tech stack**: Vite + React + TS + Vercel Functions (sem Next.js — Vite é a escolha histórica do projeto migrado do Lovable). Não vamos re-migrar pra Next.js neste escopo.
- **Database**: Supabase próprio em sa-east-1, pooler `aws-1-sa-east-1.pooler.supabase.com:5432` (direct connection é IPv6-only e a rede do Felipe não roteia).
- **Deploy**: Vercel auto-deploy no push pra `migration/vercel` (ou `main` quando mergeada).
- **Idioma**: pt-BR para tudo voltado ao usuário (UI, validações, emails) e domínio de negócio (variáveis, schemas, commits).
- **IDV 2026**: Forest Floor `#000D0A` background, accent `#01d5ac`, dark primary `#0F947A`. Logo oficial Pipeelo (sem Solintel).
- **Segurança**: RLS deve estar restrita em prod. Anon key não pode bypassar políticas. Tokens de webhook em env, nunca no bundle.
- **Jarvis**: skill roda via Claude Code com Felipe — automação via cron requer engenharia (Claude API server-side ou /schedule no Claude Code).
- **Compatibilidade**: API Pipeelo é fornecida (não modificamos). Devemos respeitar contratos existentes.
- **Sem testes herdados**: começar suíte de testes pelos pontos críticos (`evaluateConditional`, `expandHorarioSemanal`, payload contract com admin-pipeelo).

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manter Vite + React (não migrar pra Next.js) | Migração já feita do Lovable. Outra migração agora atrasa entrega real. | — Pending |
| Substituir `onboarding-processor.ts` determinístico por Jarvis | Flexibilidade > determinismo: cada ISP tem nuances que template fixo não cobre. Jarvis aplica DNA tom + prompt-optimizer + KB do tenant. | — Pending |
| Trigger Jarvis via cron (`/schedule`) | Server-side full-auto adicionaria muita engenharia. Cron + Felipe ver notificação de falha = MVP suficiente. | — Pending |
| Manter `/onboarding-sessions` UI como fallback | Se Jarvis quebrar, time admin precisa de plano B pra processar manualmente. | — Pending |
| 128 perguntas atuais são suficientes (não adicionar) | Validado pelo Felipe — perguntas existentes cobrem o necessário. | ✓ Good |
| Auto-process ao finalizar onboarding (sem aprovação manual) | Caminho feliz não deve ter fricção. Painel admin existe pra revisão posterior. | — Pending |

---
*Last updated: 2026-05-08 after initialization*
