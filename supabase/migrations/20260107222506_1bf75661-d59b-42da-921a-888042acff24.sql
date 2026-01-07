-- Add slug column to onboarding_sessions
ALTER TABLE public.onboarding_sessions 
ADD COLUMN slug text UNIQUE;

-- Create function to generate slug from empresa_nome
CREATE OR REPLACE FUNCTION public.generate_slug(nome text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 1;
BEGIN
  -- Convert to lowercase, remove accents, replace spaces with hyphens
  base_slug := lower(
    translate(
      regexp_replace(nome, '[^a-zA-Z0-9áàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ\s]', '', 'g'),
      'áàâãéèêíìîóòôõúùûçÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ',
      'aaaaeeeiiioooouuucAAAAEEEIIIOOOOUUUC'
    )
  );
  base_slug := regexp_replace(base_slug, '\s+', '-', 'g');
  base_slug := regexp_replace(base_slug, '-+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  
  final_slug := base_slug;
  
  -- Check for duplicates and add suffix if needed
  WHILE EXISTS (SELECT 1 FROM public.onboarding_sessions WHERE slug = final_slug) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Create trigger function to auto-generate slug on insert
CREATE OR REPLACE FUNCTION public.set_slug_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    NEW.slug := public.generate_slug(NEW.empresa_nome);
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger
CREATE TRIGGER trigger_set_slug_on_insert
BEFORE INSERT ON public.onboarding_sessions
FOR EACH ROW
EXECUTE FUNCTION public.set_slug_on_insert();

-- Generate slugs for existing sessions
UPDATE public.onboarding_sessions 
SET slug = public.generate_slug(empresa_nome)
WHERE slug IS NULL;