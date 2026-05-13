import { useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

/**
 * Entrada do onboarding comercial-only (CRM Pipeelo).
 *
 * Reaproveita 100% o fluxo de Vendas existente — apenas redireciona pro
 * departamento `vendas` adicionando `?modo=comercial` que ajusta UI/copy.
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
    navigate(`/${slug}/vendas?${params.toString()}`, { replace: true });
  }, [slug, searchParams, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
