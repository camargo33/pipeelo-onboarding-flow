# pipeelo-onboarding-contracts

Pacote compartilhado entre `pipeelo-onboarding-flow` (sender) e `admin-pipeelo` (receiver) com schemas Zod do webhook de onboarding. Versionar via `PAYLOAD_VERSION` constante (semver no campo `payload_version`). Build com `npm run build` antes de commit — o `dist/` é o que ambos repos consomem (workspace local + `file:` dep). Schema completo é definido a partir de Plan 02-01; este pacote começa como skeleton (sanity guard de `session.id`).
