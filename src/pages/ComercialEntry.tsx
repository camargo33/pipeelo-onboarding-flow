import { useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * Entrada do onboarding comercial-only (CRM Pipeelo).
 *
 * Fluxo comercial: Identificação (dados da empresa, cria tenant) → Vendas (CRM).
 * Os outros 3 departamentos (sac_geral, financeiro, suporte) são pulados.
 *
 * Redireciona pra Identificação adicionando `?modo=comercial` que ajusta UI/copy.
 * Após concluir Identificação, o Onboarding.tsx redireciona pra Vendas mantendo
 * `modo=comercial`.
 *
 * URL: /comercial/{slug}?token={magic_token}
 */
export default function ComercialEntry() {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!slug) {
      navigate('/');
      return;
    }
    const token = searchParams.get('token') ?? '';
    const params = new URLSearchParams();
    if (token) params.set('token', token);
    params.set('modo', 'comercial');
    navigate(`/${slug}/identificacao?${params.toString()}`, { replace: true });
  }, [slug, searchParams, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
