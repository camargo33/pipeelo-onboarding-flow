import { describe, it } from 'vitest';

describe('api/sessions Wave 1+ stubs', () => {
  it.todo('create.test.ts — POST /api/sessions/create cria session com slug+token');
  it.todo('get.test.ts — GET /api/sessions/get retorna estado por slug+token válidos');
  it.todo('save-answer.test.ts — PUT /api/sessions/save-resposta upsert idempotente');
  it.todo('save-answer.idempotency.test.ts — mesmo payload 2x = 1 row');
  it.todo('_lib/access.test.ts — assertSessionAccess valida TTL 30 dias');
  it.todo('advance-department.test.ts — gate 403 se identificação pendente');
  it.todo('create.ratelimit.test.ts — 6ª req/IP/min retorna 429');
});
