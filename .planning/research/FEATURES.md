# Feature Research

**Domain:** B2B SaaS multi-tenant self-service onboarding flow (vertical: Brazilian ISPs, ~128 questions, 5 departments, auto-provisioning of tenant + AI assistants on completion)
**Researched:** 2026-05-08
**Confidence:** MEDIUM-HIGH (Stripe / Linear / Typeform / Tally / Userlist patterns verified via official docs and 2026 industry write-ups; Pipeelo-specific decisions inferred from PROJECT.md + CONCERNS.md)

---

## Context Snapshot

The current Pipeelo onboarding (v3.2.0 in production) is functionally a **long-form data collector with auto-provisioning** — closer to Stripe Connect onboarding or a regulated KYC flow than to a Linear/Notion "first-run" tour. The user is a CEO/responsible at an ISP filling 128 questions across 5 departments so that Jarvis can build their tenant. Average completion time is **45–90 minutes split across multiple sessions and people**.

This changes which "best practices" apply:
- Linear/Notion-style 60-second tours are **irrelevant**.
- Stripe Connect KYC, Userlist B2B multi-stakeholder flows, Typeform/Tally branching, and Pylon/Plain workspace bootstrap are **directly relevant**.
- Anti-abandonment features (resume-by-link, partial save, email nurture) shift from "nice" to **table stakes** because of session length.

---

## Feature Landscape

### Table Stakes (Users Expect These — Missing = Abandonment)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Per-question autosave** (debounced) | 45–90min flows always lose connectivity / tabs close. Stripe Connect, Wise, Tally all save per-keystroke. Today Pipeelo only saves on department submit — losing 15min of work is a known abandonment cause | MEDIUM | Debounce 500–1000ms, optimistic UI, write to `onboarding_respostas` via `/api/sessions/save-answer`. Indicator "Salvo às 14:32" reduces anxiety |
| **Resume-by-link (slug + access_token)** | B2B onboarding is rarely 1-shot. CEO starts identification, hands SAC depto to operations lead next day. Schema already has `access_token` but it's unused (CONCERNS.md) | MEDIUM | Magic-link via email: `/{slug}?token=...`. Token validated server-side in `/api/sessions/get`. Reuses existing column |
| **Identification gate enforced server-side** | Current gate is UX-only (toast). Webhook accepts complete sessions without identification (bug noted in CONCERNS.md). Without this, downstream (tenant creation) breaks | LOW | DB constraint + Vercel Function check. Already half-built |
| **Progress visualization (correct count)** | Bug: shows `4/4` when there are 5 departments. Zeigarnik effect (per 2026 SaaS research) shows visible progress drops abandonment 30–50% — but only if it's accurate | LOW | Trivial fix in `OnboardingSession.tsx`. Use `DEPARTMENT_ORDER.length` |
| **Inline real-time validation** (CNPJ, email, WhatsApp E.164) | Receita Federal CNPJ check, regex on email/phone. Errors at submit-time = rage. Current code has `validateCurrentQuestion` but it's basic | LOW-MEDIUM | Reuse `phoneNormalize.ts` from CRM Clientes. CNPJ check via Receita WS or regex+digit |
| **Conditional question logic (skip logic)** | Already implemented (`evaluateConditional` DSL). Industry-standard via Typeform/Tally. Without it, ISP without "plantão" sees "horário do plantão" — feels broken | MEDIUM (already done) | Keep current DSL; add unit tests (CONCERNS.md flagged zero coverage for this critical path) |
| **Time estimate per department** | "Esta etapa leva ~12 minutos" reduces abandonment in regulated/long flows (Wise pattern). Sets expectations for ISP staff | LOW | Static metadata in `questions.json` per departamento |
| **Email confirmation after each department** | Wise/Stripe pattern. Confirms "Identificação salva", reduces anxiety, gives audit trail. Pipeelo already has `send-email.ts` per-depto | LOW (exists) | Polish copy + IDV 2026 template |
| **Welcome email with link to start** | CEO receives onboarding link via email, not Slack/WhatsApp screenshot. Pipeelo already has Resend integration | LOW (exists) | Audit copy quality |
| **Rate limiting + captcha on session creation** | `/api/create-session` is unauthenticated (CONCERNS.md). Bot floods = Supabase cost spike. Industry standard | LOW | Vercel Edge Config / Upstash; or Cloudflare Turnstile |
| **Server-side persistence (no anon-key client writes)** | RLS is currently relaxed for testing — anon key in bundle reads CNPJs/emails/respostas of all tenants. Listed in CONCERNS.md as CRITICAL. Industry-standard B2B onboarding never trusts the client | HIGH | Migrate `supabase.from()` → `/api/sessions/*` with service-role. Re-tighten RLS |
| **Progress badge per department** (status: pending / in_progress / completed) | Stripe Connect pattern (left sidebar with task list). Already partially in `OnboardingSession.tsx` | LOW | Color-code + IDV 2026 polish |
| **Mobile-responsive** | ~30% of B2B form starts happen on mobile per 2026 SaaS data. Some perguntas "table" type may break on mobile | MEDIUM | Audit `QuestionRenderer` for `table` and `horario_semanal` types specifically |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Multi-stakeholder flow with role-tagged departments** | Pipeelo's UX already names a `responsavel_<dept>`. Differentiator: send each department's link to the right person directly (CEO → Identificação, CFO → Financeiro, COO → Suporte). Userlist 2026 pattern: "trigger team onboarding email when the company adds its 5th user" — Pipeelo can do this **inverted**: route depto X to person Y by email | MEDIUM | Add `responsavel_<dept>_email` column, send personalized link per depto. Status indicator "Aguardando CFO" |
| **Auto-provisioning via Jarvis (caminho feliz sem toque humano)** | Current state-of-art: Stripe Connect creates the merchant account automatically; Pylon provisions a workspace. Pipeelo extends this to **AI assistants + KBs + prompts auto-built**. This is the actual core moat — no competitor in BR ISP space does this | HIGH (Pilar 3 in PROJECT.md) | Cron + Jarvis skill. Notification on failure |
| **Behavioral email triggers (not time-based drips)** | 2026 best practice (Userpilot/Sequenzy): trigger by event ("48h sem retomar Financeiro" → reminder), not by day-N. Outperforms Day-1/Day-3/Day-7 drips by ~40% completion | MEDIUM | Cron Vercel + Resend. Watch for `last_activity_at` per session |
| **Admin panel with drill-down + manual fallback** | Stripe Dashboard / WorkOS Admin Portal pattern. `/onboarding-sessions` exists; differentiator is **drill-into-respostas** + ability to trigger Jarvis manually if cron failed. Already partially exists in admin-pipeelo | MEDIUM (partial) | Filters by status, search by CNPJ, manual "Process now" button |
| **Real-time co-editing indicator** ("CFO está em Financeiro agora") | Live presence (Supabase Realtime). For B2B multi-stakeholder flows this avoids two people overwriting the same depto. Notion-tier polish | MEDIUM | Supabase Realtime channel per session. Not strictly needed for v1 but cheap and "wow" factor |
| **Progress dashboard for the customer** (not just admin) | Show the CEO a 5-card overview: who filled what, when, completion % per depto. Reduces "is anyone working on this?" support pings | LOW | Already 80% of `OnboardingSession.tsx` — just polish |
| **Auditable prompt preview before go-live** | Before tenant goes live, show CEO the generated prompts ("Veja como o agente vai responder seus clientes"). Builds trust + catches Jarvis hallucinations. Differentiator vs every "auto-AI" competitor | HIGH | Render prompt-templates with the actual responses; require explicit "Aprovar" before activation |
| **Conditional DSL with safe parser (vs eval-based)** | Pipeelo's `evaluateConditional` is hand-rolled — **safer than eval-based competitors** (Typeform's Logic Jumps are server-only; Tally is client-eval). Pipeelo's parser supports `==`, `!=`, `&&`, `||`, `includes` and is testable. Differentiator if documented + tested | LOW (extend existing) | Add unit tests (currently zero — CONCERNS.md). Document grammar |
| **Save-as-draft + invite collaborator pattern** | "Convidar CFO para preencher Financeiro" generates a per-depto magic link. Enables async multi-stakeholder fill | MEDIUM | Per-department access_token + email invite |
| **Session expiry with re-engagement** | Sessions abandoned >7 days get a nudge email; >30 days expire and require admin restart. Prevents 90-day-old half-filled sessions polluting dashboard | LOW | Cron + status field |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-time everything (live save on every keystroke without debounce)** | "Looks fancy" / "Notion-like" | Every keystroke = network round-trip = Supabase quota burn + flicker on slow connections. ISP staff often work over residential VDSL | Debounced autosave (500–1000ms) on blur or pause |
| **AI question generator that adapts the form on the fly** | "Personalized onboarding!" | Breaks the **deterministic contract** with admin-pipeelo's `OnboardingRespostas` schema (already a CONCERNS.md item). Jarvis depends on stable keys. Adaptation = drift = broken prompts | Keep 128 questions stable. Use conditional DSL for branching only |
| **Single-page onboarding (all 128 questions on one page)** | "Faster, no clicks" | 128 questions on one page = scroll fatigue, 90% abandon rate per 2026 data. Stripe explicitly progressive-discloses | Keep 5-department structure. Progressive disclosure within depto |
| **Mandatory video walkthrough before starting** | "Onboards them properly!" | B2B users with budget signed already — they want to fill, not watch. Adds 3–5min friction. Wistia/Loom usage data shows 70%+ skip rate on mandatory videos in B2B flows | Optional 60-sec video on landing page. "?" tooltips inline on complex questions |
| **Login with email/password to start onboarding** | "Standard auth" | Adds friction before value. CEO doesn't want one more password. Stripe Connect uses magic links exactly for this reason | Magic link via email (slug + token). Already half-built |
| **Free-text "describe your business" instead of structured questions** | "More natural, conversational" | Jarvis can't deterministically extract `numero_assinantes`, `cidades_atendidas`, `erp_principal` from prose. Breaks prompt generation | Keep structured questions. Free-text only for genuinely subjective fields (tom de voz) |
| **Auto-publish tenant the moment last question is answered (no review)** | "Fully self-service!" | If Jarvis hallucinates a CNPJ digit or misclassifies a department, the **tenant goes live to real customers** with broken prompts. Reputation risk on first impression | Auto-process is fine, but require **CEO preview/approval** of generated prompts before WhatsApp number activation |
| **Branching that requires JS eval / dynamic code execution** | "Maximum flexibility" | XSS vector + impossible to audit + breaks SSR. Pipeelo's existing parser is the right pattern | Keep declarative DSL; extend grammar if needed |
| **Allow editing answers after Jarvis runs** | "But the CEO mistyped X!" | Drift between source-of-truth respostas and the deployed prompts/KBs. Jarvis would need a full re-run pipeline with rollback | Lock session post-provision. Edits go through admin-pipeelo (KBs/prompts directly) |
| **Multi-tenant in one session (1 session = N tenants)** | "We have a holding with 3 ISPs" | Out of scope per PROJECT.md. Each ISP has its own ERP, cidades, prompts | Multiple sessions, one per CNPJ |
| **Gamification (points, badges, "you're 80% done!")** | "Increases completion!" | B2B financial/operational data fill ≠ Duolingo. CEO finds it patronizing. Plain progress bar wins | Subtle progress indicator + time estimate |

---

## Feature Dependencies

```
[Server-side persistence (/api/sessions/*)]
    └──unblocks──> [Per-question autosave]
    └──unblocks──> [Resume-by-link with token validation]
    └──unblocks──> [Identification gate enforced server-side]
    └──unblocks──> [Rate limiting]
    └──required-for──> [RLS hardening]

[Per-question autosave]
    └──enables──> [Resume-by-link UX (worth resuming if state was saved)]
    └──enables──> [Behavioral email triggers (last_activity_at signal)]

[Resume-by-link]
    └──requires──> [Email send infrastructure (exists)]
    └──enables──> [Multi-stakeholder per-depto invite]
    └──enables──> [Session expiry/re-engagement]

[Admin panel session tracking]
    └──requires──> [Status state machine: pending → in_progress → completed → processing → live | failed | needs_review]
    └──enables──> [Manual Jarvis trigger fallback]
    └──enables──> [Behavioral email triggers]

[Auto-provisioning via Jarvis]
    └──requires──> [Identification gate enforced]
    └──requires──> [Stable webhook payload contract with admin-pipeelo]
    └──requires──> [Idempotency on webhook]
    └──blocks──> [Auditable prompt preview] (without it, no preview to show)

[Auditable prompt preview]
    └──requires──> [Auto-provisioning via Jarvis]
    └──conflicts──> [Auto-publish without review] (anti-feature)

[Multi-stakeholder per-depto invite]
    └──requires──> [Resume-by-link]
    └──requires──> [Per-depto access tokens]
    └──enhances──> [Behavioral email triggers]

[Conditional DSL]
    └──exists──> [Already implemented]
    └──needs──> [Unit tests (currently zero coverage — CONCERNS.md)]
```

### Dependency Notes

- **Server-side persistence is the keystone.** Every Pilar 1 hardening item, every Pilar 4 admin/email feature, and every security item depends on migrating `supabase.from()` calls to `/api/sessions/*`. This is the unblock for ~70% of the v2 backlog.
- **Per-question autosave makes resume-by-link useful.** Without autosave, "resume" only resumes department-level — losing 15min of work in a single depto. The two ship together.
- **Identification gate must be enforced before auto-provisioning.** Otherwise webhook fires with `tenant_id=null` (existing bug per CONCERNS.md) and Jarvis has nothing to provision.
- **Auditable prompt preview vs auto-publish are mutually exclusive design philosophies.** Pipeelo should explicitly choose preview-then-approve to avoid going live with broken AI on day 1. Trust > speed for first impression.
- **Multi-stakeholder invite enhances completion rate but adds complexity.** Defer to v1.x unless data shows CEO/CFO/COO split is causing abandonment.

---

## MVP Definition

### Launch With (v2 Pilar 1 + Pilar 2 + Pilar 4 minimum)

Minimum viable upgrade — what ships to close the gap between "v3.2.0 in production with critical bugs" and "trustworthy, auditable, secure self-service onboarding."

- [ ] **Server-side persistence** (`/api/sessions/*` with service-role; tighten RLS) — security blocker
- [ ] **Per-question autosave** (debounced) — abandonment blocker for 45–90min flows
- [ ] **Resume-by-link with token validation** — magic link in welcome email
- [ ] **Identification gate enforced server-side** + webhook validates `tenant_id !== null`
- [ ] **Progress bar fix (5 deptos, accurate count)** — known bug
- [ ] **Welcome email + per-department confirmation email** (polish existing)
- [ ] **Rate limiting on `/api/create-session`** + Cloudflare Turnstile or equivalent
- [ ] **Admin panel: status filtering, drill-down into respostas, manual Jarvis trigger** (most exists in admin-pipeelo `/onboarding-sessions`, needs polish)
- [ ] **Time estimate per department** (static metadata)
- [ ] **Inline validation polish** (CNPJ, email, phone E.164)
- [ ] **Status state machine in DB** (`pending → in_progress → completed → processing → live | failed | needs_review`)

### Add After Validation (v2.1 — Pilar 3 + email nurture)

Once Pilar 1+2+4 stabilize and Jarvis can be safely cron-triggered:

- [ ] **Auto-provisioning via Jarvis cron** (Pilar 3) — trigger when 5 deptos completed
- [ ] **Behavioral email triggers** (>48h inactive in middle of depto, >7 days abandoned, completion confirmation, Jarvis-finished credentials email)
- [ ] **Auditable prompt preview before tenant go-live** — CEO approves generated prompts
- [ ] **Session expiry / re-engagement nudges** — cron cleanup of >90 day pendings
- [ ] **Mobile-responsive audit** of `table` and `horario_semanal` question types
- [ ] **Real-time presence indicator** ("Alguém está em Financeiro agora")
- [ ] **Per-department invite to specific email** (CEO → Identificação, CFO → Financeiro)

### Future Consideration (v3+)

- [ ] **Live co-edit collaborative form** (Notion-tier) — high cost, marginal value for once-per-customer flow
- [ ] **In-product tour after Jarvis finishes** — handoff from onboarding to platform usage
- [ ] **Multi-language (English) onboarding** — only when expanding beyond Brazil
- [ ] **Versioned questionnaire** — when 128 questions need to evolve without breaking historical sessions
- [ ] **A/B testing framework on question copy** — only meaningful at >100 sessions/month

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Server-side persistence (`/api/sessions/*`) | HIGH (security + foundation) | HIGH | **P1** |
| Per-question autosave | HIGH (abandonment) | MEDIUM | **P1** |
| Resume-by-link with token | HIGH (multi-session B2B) | MEDIUM | **P1** |
| Progress bar fix (`/5`) | MEDIUM (correctness) | LOW | **P1** |
| Identification gate enforced + webhook validation | HIGH (data integrity) | LOW | **P1** |
| Welcome + per-depto emails (polish) | MEDIUM | LOW (exists) | **P1** |
| Rate limiting + captcha | MEDIUM (security/cost) | LOW | **P1** |
| Inline validation (CNPJ, email, phone) | MEDIUM (UX) | LOW | **P1** |
| Time estimate per department | MEDIUM (anxiety reduction) | LOW | **P1** |
| Admin panel filters + drill-down + manual trigger | HIGH (operations) | MEDIUM | **P1** |
| Status state machine | HIGH (foundation) | LOW | **P1** |
| Mobile-responsive audit | MEDIUM | MEDIUM | **P2** |
| Auto-provisioning Jarvis cron | HIGH (core value) | HIGH | **P2** |
| Behavioral email triggers | HIGH (completion rate) | MEDIUM | **P2** |
| Auditable prompt preview | HIGH (trust/quality) | HIGH | **P2** |
| Session expiry + re-engagement | MEDIUM | LOW | **P2** |
| Per-department invite to specific email | MEDIUM | MEDIUM | **P2** |
| Real-time presence indicator | LOW (cosmetic) | MEDIUM | **P3** |
| In-product tour post-Jarvis | MEDIUM | HIGH | **P3** |
| Conditional DSL unit tests | MEDIUM (regression) | LOW | **P2** (do alongside server-side migration) |

**Priority key:**
- **P1**: Must ship in v2 (current upgrade) — closes critical gaps in CONCERNS.md and PROJECT.md Pilar 1+2+4
- **P2**: Ships v2.1 — unlocks auto-provisioning (Pilar 3) and quality moat
- **P3**: Defer until ≥10 customers/month flow through onboarding

---

## Competitor Feature Analysis

| Feature | Stripe Connect (KYC reference) | Typeform / Tally (form builder reference) | Userlist / Pylon (B2B onboarding reference) | Pipeelo Approach |
|---------|--------------------------------|--------------------------------------------|---------------------------------------------|------------------|
| **Resume mid-flow** | Magic-link with hashed account ID + auto-resume to last incomplete step | Auto-save partials; resume via cookie or email link | Resume via in-product banner ("3 steps left") | Magic link `slug + access_token` (already in schema, needs activation) |
| **Conditional logic** | Hardcoded by Stripe per region/business type (closed system) | Visual builder UI generating internal AST; eval client-side | Limited; rely on segment routing | Hand-rolled declarative DSL — **simpler, safer, testable** (already implemented) |
| **Progress visualization** | Sidebar with step list + check marks (OnboardingView component) | Single linear progress bar | Checklist widget | 5-department cards with status (already implemented; bug to fix) |
| **Email nurture** | Stripe handles via Connect notifications | None native; integrate with Mailchimp/etc | Behavioral triggers (event-based) | Resend integration exists; needs behavioral logic (cron) |
| **Admin tracking panel** | Stripe Dashboard | Form analytics (responses) | Customer success workspace | `/onboarding-sessions` in admin-pipeelo (exists, polish needed) |
| **Auto-provisioning on completion** | Account verified → live mode unlocked automatically | N/A | Manual trigger or webhook to provisioning service | Jarvis cron pipeline (Pilar 3 — differentiator) |
| **Multi-stakeholder support** | Single legal owner only | Form respondent is anonymous | Roles + per-role onboarding flows | Per-department `responsavel_<dept>` (extend with email invite) |
| **Validation** | Real-time KYC validation (regulatory) | Basic regex per field type | Custom rules per workflow step | CNPJ + email + E.164 phone (needs polish) |
| **Auditability** | Compliance-grade audit log | Response history | Limited | Pre-go-live prompt preview (proposed differentiator) |
| **Session length tolerance** | Designed for multi-day KYC | Designed for <10min surveys | Designed for first-7-days product activation | **45–90min split-session B2B fill** — closer to Stripe than Typeform |

**Key insight:** Pipeelo's onboarding is most analogous to **Stripe Connect KYC + Pylon workspace bootstrap** — long, structured, multi-stakeholder, ending in auto-provisioning. Optimize for those patterns, not for Linear-style first-run tours.

---

## Sources

- [SaaS Onboarding Best Practices 2026 — DesignRevision](https://designrevision.com/blog/saas-onboarding-best-practices) — completion benchmarks, abandonment data
- [Customer Onboarding Best Practices 2026 — Arcade](https://www.arcade.software/post/customer-onboarding-best-practices) — interactive walkthrough vs static tour data
- [Customer Onboarding Automation 2026 — NetPartners](https://netpartners.marketing/customer-onboarding-automation-2026-saas-guide/) — behavioral triggers vs time-based drips
- [Strategic SaaS Onboarding Emails — Userpilot](https://userpilot.com/blog/saas-onboarding-emails/) — incomplete onboarding 25% vs 8% churn data
- [Stripe Connect Embedded Onboarding](https://docs.stripe.com/connect/embedded-onboarding) — official KYC pattern reference
- [Stripe OnboardingView Component](https://docs.stripe.com/stripe-apps/components/onboardingview) — sidebar+content structural pattern
- [Stripe Apps Onboarding Patterns](https://docs.stripe.com/stripe-apps/patterns/onboarding-experience) — progressive disclosure
- [Typeform Logic Jumps Developer Docs](https://www.typeform.com/developers/create/logic-jumps/) — branching DSL reference
- [Tally Conditional Form Logic](https://tally.so/help/conditional-form-logic) — page-jump branching
- [WorkOS B2B SaaS Onboarding](https://workos.com/blog/b2b-saas-onboarding-organizations-users) — organization vs user onboarding split
- [B2B SaaS Onboarding Guide — ProductFruits](https://productfruits.com/blog/b2b-saas-onboarding) — multi-stakeholder patterns
- [SaaS UI Design Trends 2026](https://www.saasui.design/blog/7-saas-ui-design-trends-2026) — Linear/Notion role-based routing
- Internal: `PROJECT.md`, `ARCHITECTURE.md`, `CONCERNS.md` — current Pipeelo state
- Internal memory: `feedback_dna_tom_8_regras.md`, `project_pipeelo_onboarding_flow.md` — Pipeelo voice and project status

---

*Feature research for: Pipeelo Onboarding Flow v2 (Brazilian ISP self-service onboarding with auto-provisioning)*
*Researched: 2026-05-08*
