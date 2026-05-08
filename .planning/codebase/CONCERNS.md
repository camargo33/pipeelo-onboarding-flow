# Codebase Concerns

**Analysis Date:** 2026-05-08

## Tech Debt

**RLS afrouxado para testing (CRITICAL):**
- Issue: Migration de hotfix abriu policies de SELECT/INSERT/UPDATE para `anon` e `authenticated` em `onboarding_sessions` e `onboarding_respostas`. Comentário no próprio arquivo confirma que é temporário e que a migração futura "moverá tudo pra /api/* (service_role) e reapertará".
- Files: `supabase/migrations/20260419120000_relax_rls_for_testing.sql`, `src/integrations/supabase/client.ts`, `src/pages/Onboarding.tsx` (linhas 80-117, 217-241), `src/pages/OnboardingSession.tsx` (linhas 113-117), `src/pages/NovoOnboarding.tsx`
- Impact: Qualquer pessoa com a anon key pública (exposta no bundle JS) consegue ler TODAS as sessões de onboarding (CNPJ, email admin, WhatsApp, respostas completas de financeiro/vendas/suporte), inserir sessões fake e modificar respostas alheias. Sem isolamento por slug/token. CNPJs e dados estratégicos de ISPs vazados.
- Fix approach: Criar endpoints `/api/sessions/get?slug=...&token=...`, `/api/sessions/save-respostas`, `/api/sessions/complete-department`. Substituir todos os `supabase.from(...)` do front por `fetch('/api/...')`. Rodar nova migration revertendo para `service_role only` (igual `20260419000000_identificacao_and_tenant_link.sql` linhas 39-47). Validar `access_token` no servidor.

**Logo PNG legado pode estar fora do IDV 2026:**
- Issue: `src/assets/pipeelo-logo.png` (9.3 KB, modificado em 19/Apr) pode não refletir a nova identidade visual 2026 (#01d5ac / lime). Commit `ea79204 feat(idv): apply Pipeelo 2026 visual identity` aplicou tokens CSS mas não há registro de troca do PNG.
- Files: `src/assets/pipeelo-logo.png`, `src/assets/pipeelo-icon.png`, `src/components/PipeeloLogo.tsx`
- Impact: Inconsistência visual com brandbook 2026. Cliente recebe link com logo antigo.
- Fix approach: Validar com brandbook oficial 2026. Substituir PNG ou migrar para SVG inline.

**Endpoint final `/api/clients/onboarding/create` não confirmado:**
- Issue: `complete-onboarding.ts` aponta para `${PIPEELO_ADMIN_API_URL}/api/clients/onboarding/create`. Memory de projeto confirma "Falta endpoint /api/v1/onboarding/ingest no admin-pipeelo pra criar prompts via Jarvis". Path do código (`/api/clients/onboarding/create`) diverge do path mencionado em memory (`/api/v1/onboarding/ingest`).
- Files: `api/complete-onboarding.ts:91`
- Impact: Quando todos os 4 deptos forem concluídos, o webhook final pode falhar com 404, e o cliente fica em estado "tudo verde" mas sem tenant configurado de fato no admin.
- Fix approach: Confirmar com admin-pipeelo o path canônico. Atualizar `targetUrl` ou adicionar handler no admin. Garantir que `PIPEELO_ADMIN_API_TOKEN` está configurado em ambos os lados.

**Schema do payload de complete-onboarding pode divergir do `OnboardingRespostas` no admin:**
- Issue: Payload enviado em `complete-onboarding.ts` tem estrutura `{ session: {...}, respostas: { identificacao, sac_geral, financeiro, suporte, vendas } }`. Memory de projeto indica que `lib/onboarding-processor.ts` no admin-pipeelo usa interface `OnboardingRespostas` cuja forma exata não foi validada cross-repo.
- Files: `api/complete-onboarding.ts:67-89`
- Impact: Webhook 200 OK com parse silencioso falho, ou 4xx no admin. Onboarding "concluído" sem prompts gerados.
- Fix approach: Cross-check com `admin-pipeelo/lib/onboarding-processor.ts`. Adicionar Zod schema compartilhado ou validação contract-first. Adicionar teste de integração com payload real.

**Branch `migration/vercel` não merjada com main (37 arquivos, +2255/-544):**
- Issue: Branch atual diverge significativamente de main: identificacao dept, prompt-templates, NovoOnboarding, vercel.json, migrations 20260419*, IDV 2026.
- Files: branch local `migration/vercel` vs `origin/main`
- Impact: Risco de rollback acidental para main perder todo o trabalho de migração. Deploy em produção pode estar apontando para commit `00a3007` da branch errada.
- Fix approach: Validar com Felipe se main deve ser fast-forwarded para `migration/vercel` ou se PR deve ser aberto. Confirmar qual branch o Vercel está deployando.

**Versão deployada (`00a3007`) pode estar desatualizada:**
- Issue: Memory: "Última versão deployada (00a3007) trim questions v3.2.0 — pode estar desatualizada vs o que cliente realmente precisa". Trim removeu defaults assumidos.
- Files: `src/lib/questions.json`, commits `00a3007`, `e5926cd`, `b894cbd`, `1280d10`, `7b15dc0`
- Impact: Cliente pode receber perguntas que assumem contexto que ele não tem, ou faltar perguntas que o admin precisa para gerar prompts completos.
- Fix approach: Auditar `questions.json` v3.2.0 contra prompt-templates (`src/lib/prompt-templates/*.md`) — toda variável `[placeholder]` precisa ter pergunta correspondente.

## Known Bugs

**Progress bar mostra `/4` mas existem 5 departamentos:**
- Symptoms: Após concluir Identificação + 3 deptos, progresso mostra `4/4 100%` mas Vendas ainda está pendente. Mensagem "Onboarding Completo" pode aparecer prematuramente.
- Files: `src/pages/OnboardingSession.tsx:201` (`allCompleted = completedCount === 4`), `src/pages/OnboardingSession.tsx:229` (`${completedCount}/4 departamentos concluídos`), `src/pages/OnboardingSession.tsx:272,278` (`(completedCount / 4) * 100`)
- Trigger: `getCompletedCount()` (linha 167-176) já conta os 5 status incluindo `status_identificacao`. Inconsistência: contador inclui Identificação mas o denominador permanece 4 (legado pré-Identificação dept).
- Workaround: Trocar todas as ocorrências de `4` por `5` (ou usar `DEPARTMENT_ORDER.length`). Validar com Felipe se Identificação deve contar para o progresso visível ou ficar em "etapa 0/separada".

**Webhook `complete-onboarding` ignora Identificação no gate:**
- Symptoms: Endpoint considera completo quando `status_sac_geral`, `status_financeiro`, `status_suporte`, `status_vendas` estão concluídos. Não checa `status_identificacao`.
- Files: `api/complete-onboarding.ts:39-41`
- Trigger: Em teoria, alguém poderia preencher os 4 deptos sem Identificação (se RLS não bloquear) e disparar webhook sem `tenant_id` no payload (que vai como `null`).
- Workaround: Adicionar `status_identificacao` ao array `requiredDepts` ou validar `session.tenant_id !== null` antes de enviar webhook.

**`access_token` enviado no webhook mas não usado para auth:**
- Symptoms: `complete-onboarding.ts:71` envia `access_token` da session no payload, mas autenticação com admin é via `PIPEELO_ADMIN_API_TOKEN` global no header. Token da session é dead weight.
- Files: `api/complete-onboarding.ts:71`
- Trigger: N/A (informacional)
- Workaround: Decidir se admin deve validar `access_token` por session (preferível) ou remover do payload.

## Security Considerations

**Anon key + RLS aberto = leak total de dados sensíveis:**
- Risk: CNPJ, razão social, admin email, WhatsApp business, e respostas completas (estrutura financeira, ERP, sinal ONU, planos comerciais, fluxo de cobrança) acessíveis via anon key extraída do bundle JS.
- Files: `src/integrations/supabase/client.ts`, migration `20260419120000_relax_rls_for_testing.sql`
- Current mitigation: Nenhuma. Slug é o único "segredo" e está na URL.
- Recommendations: Migrar para `/api/*` com service_role (ver Tech Debt item 1). Validar `slug` + `access_token` opaco no servidor. Re-aplicar policy `service_role only`.

**Service role key e admin tokens em env vars Vercel:**
- Risk: `SUPABASE_SERVICE_ROLE_KEY`, `PIPEELO_ADMIN_API_TOKEN`, `PIPEELO_ADMIN_PASSWORD`, `RESEND_API_KEY` no Vercel. Se Vercel for comprometido ou alguém com acesso ao projeto exfiltrar, controle total.
- Files: `api/_lib/supabase.ts:7-11`, `api/_lib/admin-pipeelo.ts:1-12`, `api/send-email.ts:4`
- Current mitigation: Vercel project access control.
- Recommendations: Rotacionar tokens periodicamente. Preferir `PIPEELO_ADMIN_API_TOKEN` sobre EMAIL/PASSWORD (basic auth tem risco maior se logado em servidor errado). Auditar quem tem acesso ao Vercel.

**`ONBOARDING_WEBHOOK_TOKEN` mencionado mas não implementado:**
- Risk: Webhook `/api/clients/onboarding/create` no admin-pipeelo precisa validar origem do request. Memory diz que token "precisa estar nos 2 lados", mas no código atual a auth é via `PIPEELO_ADMIN_API_TOKEN` (Bearer global).
- Files: `api/complete-onboarding.ts:92,95`
- Current mitigation: Bearer token global (não específico do webhook).
- Recommendations: Definir se `ONBOARDING_WEBHOOK_TOKEN` substitui ou complementa o Bearer atual. Adicionar header `X-Onboarding-Webhook-Token` no client e validar no admin.

**Sem rate limiting nos endpoints públicos:**
- Risk: `/api/create-session` (linhas 18-26) cria sessions sem auth. Atacante pode floodar a tabela com sessions fake → DoS e custo Supabase.
- Files: `api/create-session.ts`
- Current mitigation: Nenhuma.
- Recommendations: Adicionar rate limit por IP (Vercel Edge Config / Upstash) ou captcha em `/novo`.

**`empresa_nome` aceito sem sanitização para HTML:**
- Risk: `send-email.ts:209` interpola `${empresaNome}` diretamente em HTML do email. XSS em emails recebidos por `onboarding@pipeelo.com`.
- Files: `api/send-email.ts:202-220`, `api/create-session.ts:14-22`
- Current mitigation: Apenas `trim()` e `length >= 2`.
- Recommendations: Escapar HTML antes de interpolar (ex: `escape-html` package) ou trocar para template engine que faz auto-escape.

## Performance Bottlenecks

**Fire-and-forget `postJson` sem await pode perder requests:**
- Problem: Em `Onboarding.tsx:251-303`, integrações com `/api/provision-tenant`, `/api/sync-department`, `/api/complete-onboarding`, `/api/send-email` são disparadas sem await após mostrar tela de sucesso. Se usuário fechar a aba antes do `fetch` resolver, o request pode ser cancelado.
- Files: `src/pages/Onboarding.tsx:252-259`
- Cause: Browser pode abortar requests pending quando a tab fecha. `keepalive: true` não está setado.
- Improvement path: Adicionar `keepalive: true` ao fetch (limita body a 64KB, OK para esses payloads). Ou await com toast "finalizando integração". Ou usar `navigator.sendBeacon`.

**N+1 implícito em `Onboarding.tsx` ao retomar edição:**
- Problem: `Onboarding.tsx:80-117` faz uma query para session e outra condicional para respostas. Não usa join nem Promise.all.
- Files: `src/pages/Onboarding.tsx:80-117`
- Cause: Sequencial. Latência ~2x.
- Improvement path: `Promise.all([fetchSession, fetchExisting])` ou single RPC.

## Fragile Areas

**Type safety perdida com casts `as any` no resumo:**
- Files: `src/pages/Onboarding.tsx:436-488` (`q.tipo`, `q.opcoes`, `q.pergunta` via `any`), `src/pages/Onboarding.tsx:304` (`error: any`)
- Why fragile: Mudanças em `Question` interface não geram erros. Renomear `tipo` para `type` quebra silenciosamente.
- Safe modification: Tipar `section.perguntas` como `Question[]`. Trocar `error: any` por type guard `error instanceof Error`.
- Test coverage: Zero testes (não há `*.test.*` no repo).

**`expandHorarioSemanal` em complete vs `horarioToOfficeHours` em sync — duas representações:**
- Files: `api/complete-onboarding.ts:4-21`, `api/sync-department.ts:24-46`
- Why fragile: Dois mappings diferentes do mesmo `horario_semanal`. Um expande para 7 dias estilo flat (`segunda_feira`, `terca_feira`...), outro converte para formato week_days nested. Mudança no schema de horário precisa ser feita em 2 lugares + frontend.
- Safe modification: Centralizar em `api/_lib/horario.ts` com 2 funções nomeadas. Adicionar testes unitários para cada output.

**`provision-tenant` sem retry/idempotência:**
- Files: `api/provision-tenant.ts:84-114`
- Why fragile: Se admin-pipeelo retornar 5xx após criar tenant mas antes de devolver, sessão fica sem `tenant_id` mas tenant existe. Re-tentativa cria duplicata (admin tem unique por CNPJ? não confirmado).
- Safe modification: Sempre fazer search por CNPJ primeiro (já faz, linhas 57-65), mas garantir transação no admin. Adicionar idempotency key.

**Webhook fire-and-forget = dados podem não chegar no admin:**
- Files: `src/pages/Onboarding.tsx:283-293`, `api/complete-onboarding.ts`
- Why fragile: Se `complete-onboarding` falhar (network, 5xx no admin), erro vai pra `console.error` e usuário nunca sabe. Onboarding aparece concluído mas admin não recebeu.
- Safe modification: Adicionar tabela `webhook_log` com retry policy. Cron Vercel reprocessa falhas.

## Scaling Limits

**Onboarding sessions sem TTL/limpeza:**
- Current capacity: Ilimitado.
- Limit: Custo Supabase cresce indefinidamente com sessões abandonadas.
- Scaling path: Cron mensal `DELETE FROM onboarding_sessions WHERE status_identificacao = 'pendente' AND created_at < now() - interval '90 days'`. Manter sessions concluídas.

## Dependencies at Risk

**`@vercel/node ^3.2.24` para Vercel Functions:**
- Risk: Vercel pode fazer breaking change na runtime. Tipos podem divergir.
- Impact: Build quebra ao atualizar.
- Migration plan: Pin exato em `package.json` ou monitorar release notes.

**Supabase client carregando types auto-gerados:**
- Risk: `src/integrations/supabase/types.ts` foi gerado em fase Lovable. Migrations recentes (`20260419*`) podem não estar refletidas no types.
- Impact: TypeScript pode mostrar campos faltando ou tipos errados em queries.
- Migration plan: Rodar `supabase gen types typescript` localmente após cada migration.

## Missing Critical Features

**Sem validação de slug/token no client:**
- Problem: Qualquer slug retorna dados (ou 404). Não há autorização — quem tem o link ler tudo. `access_token` existe no schema mas não é usado.
- Blocks: Compartilhamento seguro do link. Hoje, se vazar, qualquer um lê.

**Sem retomar progresso parcial dentro de um departamento:**
- Problem: Respostas só são salvas no `handleSubmit` final. Se usuário fecha a aba na pergunta 30/40, perde tudo do depto.
- Blocks: UX. Cliente reclama em deptos longos (sac_geral, ~15min).

**Sem indicador de qual depto vai para qual prompt:**
- Problem: Cliente não sabe que respostas de "tom de voz" alimentam prompt principal vs vendas.
- Blocks: Qualidade das respostas. Cliente preenche sem contexto.

## Test Coverage Gaps

**Zero testes em todo o projeto:**
- What's not tested: Tudo. Não há Vitest/Jest config, nenhum `*.test.ts*`, nenhum `*.spec.ts*`.
- Files: Repo inteiro.
- Risk: Mudanças quebram silenciosamente. Refactor de RLS sem testes é risco alto.
- Priority: High para `api/*` (lógica de provisionamento, webhook, mapping de horário). Medium para componentes UI.

**Sem teste de contrato com admin-pipeelo:**
- What's not tested: Schema do payload `complete-onboarding` vs interface `OnboardingRespostas` no admin.
- Files: `api/complete-onboarding.ts:67-89`
- Risk: Drift silencioso entre repos. Webhook 200 OK com parse falho.
- Priority: High.

**Sem teste de regressão para progress bar / contador:**
- What's not tested: `getCompletedCount()`, `allCompleted`, `4/4 vs 5/5`.
- Files: `src/pages/OnboardingSession.tsx:167-201`
- Risk: Bug do `/4` passa para produção (já passou).
- Priority: Medium.

---

*Concerns audit: 2026-05-08*
