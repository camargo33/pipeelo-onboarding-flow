---
phase: 05-painel-notificacoes
plan: 01
subsystem: emails
tags: [react-email, idv-2026, templates, magic-link]
status: complete
completed_date: 2026-05-08
requirements: [UI-09]

dependency_graph:
  requires:
    - "@react-email/components ^1.0.12"
    - "@react-email/render ^2.0.8"
    - "Plan 01-02 IDV 2026 tokens (Forest Floor #000D0A + Lime Accent #01d5ac)"
  provides:
    - "src/emails/WelcomeCEO.tsx (template boas-vindas CEO)"
    - "src/emails/ReminderStalled.tsx (template lembrete >48h)"
    - "src/emails/CredentialsReady.tsx (template plataforma pronta + magic link 72h)"
    - "src/emails/JarvisFailedAlert.tsx (template alerta interno Felipe/ops)"
    - "src/emails/_shared/Layout.tsx (wrapper React Email com header + footer)"
    - "src/emails/_shared/tokens.ts (EMAIL_COLORS + EMAIL_FONT + EMAIL_TAILWIND_CONFIG)"
  affects:
    - "Plan 05-02 (disparo via Resend importa esses default exports)"
    - "Plan 05-03 (painel admin aciona triggers que renderizam estes templates)"

tech_stack:
  added:
    - "@react-email/components — set de blocos (Html, Body, Container, Section, Heading, Text, Button, Link, Hr, Tailwind, Preview)"
    - "@react-email/render — render(<Component />) -> Promise<string> HTML"
    - "react-email — CLI (preview local em dev, opcional)"
  patterns:
    - "Layout shared com prop urgent:boolean trocando cor da borda do header (mint default vs urgent #ef4444)"
    - "Inline styles em vez de Tailwind classes (compat email clients - Outlook nao processa class)"
    - "Intl.DateTimeFormat para BRT (America/Sao_Paulo) inline no template (Vercel Function tem Intl)"
    - "Default export por template + named export pra plan 05-02 importar livre"

key_files:
  created:
    - path: "src/emails/_shared/tokens.ts"
      role: "Single source of truth pra cores/fonts dos emails"
    - path: "src/emails/_shared/Layout.tsx"
      role: "Wrapper compartilhado (header pipeelo + footer legal + container 600px)"
    - path: "src/emails/WelcomeCEO.tsx"
      role: "Boas-vindas CEO com magic link CTA + tempo estimado"
    - path: "src/emails/ReminderStalled.tsx"
      role: "Lembrete sessao parada >48h apontando departamento atual"
    - path: "src/emails/CredentialsReady.tsx"
      role: "Plataforma pronta + magic link TTL 72h (expiresAt BRT formatado)"
    - path: "src/emails/JarvisFailedAlert.tsx"
      role: "Alerta operacional interno (urgent border, lastError em <code>, traceUrl opcional)"
    - path: "src/emails/__tests__/templates.test.tsx"
      role: "9 tests: smoke + IDV + sem-senha + magic-link + snapshot + XSS escape"
    - path: "src/emails/__tests__/__snapshots__/templates.test.tsx.snap"
      role: "4 snapshots fixados (regression visual contra mudancas nao intencionais)"
  modified: []

decisions:
  - "Inline styles em vez de classes Tailwind: clients de email (Outlook, Gmail desktop) processam mal CSS via class. Tokens centralizam cores em tokens.ts e cada template aplica via style={{}}. Tailwind config existe mas atua so como compat enquanto componentes @react-email/components ainda esperam Tailwind wrapper presente."
  - "Magic link como UNICO mecanismo de acesso em CredentialsReady: NUNCA renderizar senha plain (Pitfall 7+9 do PITFALLS.md). expiresAt formatado em BRT pra ficar inequivoco pro CEO."
  - "JarvisFailedAlert com Layout urgent=true: muda borda do header para #ef4444 sem alterar paleta IDV. Visual de incident sem inventar tom novo."
  - "lastError em <code> sem dangerouslySetInnerHTML: React escapa < > automaticamente em filhos de texto. Test XSS confirma <script>alert(1)</script> sai como &#x3C;script&#x3E;..."
  - "Tests usam helper expectIdvCompliant que faz replace & -> &amp; no magicLink antes de buscar substring (HTML escape correto na saida do render())."
  - "Tokens splittados de Layout.tsx (em vez de inline no Layout): Plan 05-02 vai precisar deles pra subject builder e fallback text/plain sem importar JSX."

metrics:
  duration_minutes: 12
  tasks_completed: 3
  files_created: 8
  files_modified: 0
  tests_added: 9
  full_suite: "116 passed | 5 skipped | 7 todo (128 total)"

snapshot_hash:
  file: "src/emails/__tests__/__snapshots__/templates.test.tsx.snap"
  sha256: "45aef0b03f932e1ccf80a6c85a6803e8750c7cf9e5ee972ad6153ff29a169cdb"
---

# Phase 5 Plan 01: React Email Templates IDV 2026 Summary

**One-liner:** 4 templates React Email (Welcome/Reminder/Credentials/JarvisFailed) com IDV 2026 Forest Floor + Lime Accent, magic link only (sem senha plain), Layout shared e 9 tests verdes incluindo XSS escape.

## Templates Criados

### WelcomeCEO

**Props:**
```ts
interface WelcomeCEOProps {
  ceoNome: string;
  empresaNome: string;
  magicLink: string;
}
```

**Voz / Copy:**
- Subject preview: "Seu onboarding Pipeelo começa aqui — 45min até seu agente live"
- Saudação: "Olá, {ceoNome}." + bem-vindo
- CTA: "Começar onboarding" → magicLink
- Tempo estimado explícito (45 minutos), reassurance "salvamos a cada resposta"
- Assinatura: "Equipe Pipeelo"

### ReminderStalled

**Props:**
```ts
interface ReminderStalledProps {
  ceoNome: string;
  empresaNome: string;
  departamentoAtual: string;
  magicLink: string;
  horasParado: number;
}
```

**Voz / Copy:**
- Subject preview: "{empresaNome} — falta pouco para concluir. Continue de onde parou em {departamentoAtual}."
- Heading aponta exatamente onde parou ("Você parou em Suporte.")
- Sem culpa, foco em retomar
- CTA: "Continuar de onde parei"

### CredentialsReady

**Props:**
```ts
interface CredentialsReadyProps {
  ceoNome: string;
  empresaNome: string;
  tenantSlug: string;
  magicLink: string;
  expiresAt: string;  // ISO 8601
}
```

**Voz / Copy:**
- Subject preview: "Sua plataforma Pipeelo está pronta — acesse com o link abaixo (válido por 72h)"
- Tenant slug em `<code>` mint sobre surface
- CTA: "Acessar minha conta"
- Aviso TTL 72h com expiresAt formatado em pt-BR/BRT (Intl.DateTimeFormat America/Sao_Paulo)
- ZERO menção a senha — magic link only (Pitfall 7+9)

### JarvisFailedAlert

**Props:**
```ts
interface JarvisFailedAlertProps {
  sessionId: string;
  empresaNome: string;
  attemptCount: number;
  lastError: string;
  painelUrl: string;
  traceUrl?: string;
}
```

**Voz / Copy:**
- Subject preview: "Jarvis falhou definitivo — sessão {sessionId.slice(0,8)} ({empresaNome})"
- Layout em modo urgent (borda header #ef4444)
- session_id mono em muted
- lastError em `<code>` block com border urgent
- CTA: "Abrir no painel" → painelUrl
- Link secundário "Ver trace no Langfuse" → traceUrl (opcional)
- Footer: "Alerta automático — gerado pelo cron Jarvis após exceder MAX_ITER ou erro fatal."

## Decisões de Voz

| Decisão | Razão |
|---------|-------|
| Sem emojis em qualquer template | Voz "A Arquiteta" — calma, direta, técnica. Hype quebra confiança em incidente (JarvisFailedAlert) e parece artificial em onboarding sério. |
| Tempo estimado explícito ("45 minutos") | Felipe Camargo regra: "compromisso vale mais que evitar fricção". CEO sabe se cabe ou não. |
| Negative-space CTAs (1 botão por email) | Ambíguo = não clica. WelcomeCEO/Reminder/Credentials cada um tem CTA single + URL fallback. |
| `magicLink` é único hyperlink primário | Anti-phishing + rotacionável. Senha plain morre nos commits e logs (Pitfall 7+9). |
| BRT formatado pt-BR em CredentialsReady | "11/05/2026 18:30 BRT" é inequívoco para CEO brasileiro. ISO confunde, UTC pior. |

## Tests

```
✓ WelcomeCEO > renders valid IDV-compliant HTML with magic link
✓ WelcomeCEO > matches snapshot
✓ ReminderStalled > renders valid IDV-compliant HTML with stalled context
✓ ReminderStalled > matches snapshot
✓ CredentialsReady > renders valid IDV-compliant HTML with formatted BRT expiry
✓ CredentialsReady > matches snapshot
✓ JarvisFailedAlert > renders valid IDV-compliant HTML with painel URL
✓ JarvisFailedAlert > escapes XSS in lastError
✓ JarvisFailedAlert > matches snapshot

Test Files  1 passed (1)
Tests       9 passed (9)
Full suite  116 passed | 5 skipped | 7 todo
```

**Cobertura por template:**
1. HTML válido (DOCTYPE / `<html>`)
2. Accent IDV 2026 `#01d5ac` presente
3. Background IDV 2026 `#000D0A` presente
4. Sem `senha:` / `password:` (regression Pitfall 7)
5. magicLink ou painelUrl presente (HTML-escaped)
6. Snapshot fixado

**Bonus XSS:** JarvisFailedAlert com `lastError: '<script>alert(1)</script>'` → output contém `&#x3C;script&#x3E;`, NUNCA `<script>` literal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Missing dependency] Plan 05-00 era DNS+humano e não instalou React Email**

- **Found during:** Task 1 setup
- **Issue:** `package.json` não tinha `@react-email/components` nem `@react-email/render`. Plan 05-00 cobre só DNS Cloudflare + Resend domain verify (humano). Sem deps, Task 1 não compila.
- **Fix:** `npm i @react-email/components @react-email/render react-email` — `package-lock.json` já tinha entries antigas (pre-existing), npm install foi no-op em package.json mas ativou node_modules. Sem commit separado pra deps (já estavam declaradas).
- **Files modified:** nenhum (workspace já tinha as deps no lockfile)
- **Commit:** N/A (no-op)

**2. [Rule 1 - Test bug] HTML escape não considerado em assertion inicial**

- **Found during:** Task 1 verify
- **Issue:** `expect(html).toContain(magicLink)` falhava porque React Email escapa `&` → `&amp;` em href no HTML output (correto, é HTML válido).
- **Fix:** Helper `expectIdvCompliant` agora aplica `magicLink.replace(/&/g, '&amp;')` antes de buscar substring. Documentado em comentário.
- **Files modified:** `src/emails/__tests__/templates.test.tsx`
- **Commit:** `a32af68`

**3. [Rule 1 - Test bug] React insere `<!-- -->` entre nós de texto adjacentes**

- **Found during:** Task 2 + Task 3 verify
- **Issue:** Assertions `'49h'` e `'3 tentativas'` falhavam pois React renderiza `49<!-- -->h` e `3<!-- --> tentativas` no HTML para separar text nodes.
- **Fix:** Mudei pra `'>49<'` e `'>3<' + 'tentativas'` em chamadas separadas. Tokens permanecem legíveis no email final.
- **Files modified:** `src/emails/__tests__/templates.test.tsx`
- **Commit:** `a32af68`

### Auth Gates / Architectural Changes

Nenhum.

## Snapshot Hash

```
file:   src/emails/__tests__/__snapshots__/templates.test.tsx.snap
sha256: 45aef0b03f932e1ccf80a6c85a6803e8750c7cf9e5ee972ad6153ff29a169cdb
```

Mudança não intencional dos templates → snapshot diff fica óbvio em CI.

## Commits

| Task | Hash | Message |
|------|------|---------|
| 1 | `c93bd5c` | feat(05-01): tokens + Layout shared + WelcomeCEO + ReminderStalled |
| 2 | `3e22b61` | feat(05-01): CredentialsReady (magic link 72h) + JarvisFailedAlert |
| 3 | `a32af68` | test(05-01): snapshot + smoke + XSS escape para os 4 templates |

## Próximos Passos

- **Plan 05-02** (Wave 2): triggers de envio — `lib/email-triggers.ts` com `sendWelcomeCEO`, `sendReminderStalled`, `sendCredentialsReady`, `sendJarvisFailedAlert`. Cada um faz `await render(<Template ...props />)` + chama Resend API. Subject hardcoded por trigger (não vive no template).
- **Plan 05-03** (Wave 3): painel admin aciona triggers (botão "Reenviar magic link" / "Disparar lembrete agora").

## Self-Check: PASSED

- src/emails/_shared/tokens.ts FOUND
- src/emails/_shared/Layout.tsx FOUND
- src/emails/WelcomeCEO.tsx FOUND
- src/emails/ReminderStalled.tsx FOUND
- src/emails/CredentialsReady.tsx FOUND
- src/emails/JarvisFailedAlert.tsx FOUND
- src/emails/__tests__/templates.test.tsx FOUND
- src/emails/__tests__/__snapshots__/templates.test.tsx.snap FOUND
- Commit c93bd5c FOUND
- Commit 3e22b61 FOUND
- Commit a32af68 FOUND
- 9/9 tests passing
- Full suite 116 passing
