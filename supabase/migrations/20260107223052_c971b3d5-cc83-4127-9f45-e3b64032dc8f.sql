-- Add DELETE policy for onboarding_sessions
CREATE POLICY "Allow public delete onboarding_sessions" 
ON public.onboarding_sessions 
FOR DELETE 
USING (true);

-- Add DELETE policy for onboarding_respostas
CREATE POLICY "Allow public delete onboarding_respostas" 
ON public.onboarding_respostas 
FOR DELETE 
USING (true);