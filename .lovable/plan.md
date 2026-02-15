

## Plano: Corrigir Permissoes e Liberar Edicao de Etapas

### Problema Identificado

O erro "permission denied" ocorre porque as politicas de seguranca (RLS) do banco de dados estao configuradas como **RESTRICTIVE** em vez de **PERMISSIVE**. No PostgreSQL, quando so existem politicas restritivas e nenhuma permissiva, o acesso e negado por padrao -- mesmo que a condicao seja `true`.

Alem disso, o botao "Editar" so aparece quando nem todos os 4 departamentos estao concluidos. Se todos estiverem concluidos, nao e possivel editar nenhum.

### O que sera feito

**1. Corrigir as politicas de seguranca do banco de dados**

Remover todas as politicas RESTRICTIVE e recriar como PERMISSIVE nas duas tabelas:

- `onboarding_sessions`: SELECT, INSERT, UPDATE, DELETE
- `onboarding_respostas`: SELECT, INSERT, UPDATE, DELETE

**2. Liberar edicao mesmo apos todos os departamentos estarem concluidos**

Atualmente, o botao "Editar" some quando os 4 departamentos estao finalizados. Vamos alterar para que o botao "Editar" apareca **sempre** que um departamento estiver concluido, independentemente do status dos demais.

Arquivos alterados:
- `src/pages/OnboardingSession.tsx` -- remover a condicao `!allCompleted` do botao "Editar"
- `src/pages/Onboarding.tsx` -- remover o bloqueio que impede edicao quando todos os departamentos estao completos

### Detalhes Tecnicos

**Migracao SQL:**

```sql
-- Dropar politicas restritivas existentes
DROP POLICY IF EXISTS "Allow public delete onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public insert onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public read onboarding_sessions" ON public.onboarding_sessions;
DROP POLICY IF EXISTS "Allow public update onboarding_sessions" ON public.onboarding_sessions;

DROP POLICY IF EXISTS "Allow public delete onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public insert onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public read onboarding_respostas" ON public.onboarding_respostas;
DROP POLICY IF EXISTS "Allow public update onboarding_respostas" ON public.onboarding_respostas;

-- Recriar como PERMISSIVE
CREATE POLICY "Allow public select onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete onboarding_sessions" ON public.onboarding_sessions AS PERMISSIVE FOR DELETE TO public USING (true);

CREATE POLICY "Allow public select onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Allow public insert onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow public update onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR UPDATE TO public USING (true);
CREATE POLICY "Allow public delete onboarding_respostas" ON public.onboarding_respostas AS PERMISSIVE FOR DELETE TO public USING (true);
```

**Alteracoes no frontend:**

- `OnboardingSession.tsx` linha 325: remover condicao `!allCompleted` para sempre mostrar o botao "Editar"
- `Onboarding.tsx` linhas 96-110: remover bloqueio que impede edicao quando todos departamentos estao completos

