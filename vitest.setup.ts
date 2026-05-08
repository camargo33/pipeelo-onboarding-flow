import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock env vars usadas pelo cliente Supabase anon e dependências server-side
process.env.VITE_SUPABASE_URL ??= 'https://test.supabase.co';
process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??= 'test-anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role';
process.env.UPSTASH_REDIS_REST_URL ??= 'https://test-redis.upstash.io';
process.env.UPSTASH_REDIS_REST_TOKEN ??= 'test-token';
process.env.TURNSTILE_SECRET_KEY ??= 'test-turnstile-secret';

// Silenciar warning de "vi unused" quando setup minimal
void vi;
