import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PipeeloLogo } from "@/components/PipeeloLogo";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { sessionApi, ApiError } from "@/lib/api-client";
import { cleanCnpj, formatCnpj, validateCnpj } from "@/lib/cnpj";

/**
 * Tela de criação de sessão (HARD-01 + HARD-07).
 *
 * - Substitui POST /api/create-session legacy por sessionApi.create.
 * - Renderiza TurnstileWidget; sem siteKey (dev) o token vem '' e o submit
 *   confia no fallback server (Plan 04 fará o verify obrigatório).
 * - Após sucesso navega para /<slug>?token=<access_token> — o token na URL
 *   é a base do magic link (HARD-03).
 *
 * NOTA: input de CNPJ ainda não está aqui — Plan 04 (HARD-05) adiciona
 * validação inline BrasilAPI. Por ora enviamos cnpj="" e o endpoint
 * `create.ts` aceita (validação dura também migra em Plan 04).
 */
export default function NovoOnboarding() {
  const navigate = useNavigate();
  const [empresaNome, setEmpresaNome] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [cnpjTouched, setCnpjTouched] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [loading, setLoading] = useState(false);

  const hasSiteKey = Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY);
  const cnpjDigits = cleanCnpj(cnpj);
  const cnpjValid = cnpjDigits.length === 14 && validateCnpj(cnpjDigits) === null;
  const canSubmit =
    empresaNome.trim().length >= 2 &&
    cnpjValid &&
    (hasSiteKey ? turnstileToken.length > 0 : true);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const masked = formatCnpj(e.target.value);
    setCnpj(masked);
    if (cnpjTouched) {
      setCnpjError(validateCnpj(masked));
    }
  };

  const handleCnpjBlur = () => {
    setCnpjTouched(true);
    setCnpjError(validateCnpj(cnpj));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (empresaNome.trim().length < 2) {
        toast.error("Informe o nome da empresa");
      } else if (!cnpjValid) {
        const err = validateCnpj(cnpj) ?? "CNPJ inválido";
        setCnpjError(err);
        setCnpjTouched(true);
        toast.error(err);
      } else if (hasSiteKey && !turnstileToken) {
        toast.error("Complete o captcha antes de continuar");
      }
      return;
    }
    setLoading(true);
    try {
      const { slug, access_token } = await sessionApi.create({
        empresa_nome: empresaNome.trim(),
        cnpj: cnpjDigits,
        turnstileToken,
      });
      toast.success(`Onboarding criado: ${slug}`);
      navigate(`/${slug}?token=${access_token}`);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          toast.error("Já existe uma sessão para este CNPJ");
        } else if (err.status === 403) {
          toast.error("Captcha inválido — recarregue a página e tente de novo");
        } else if (err.status === 429) {
          toast.error("Muitas tentativas. Aguarde 1 minuto e tente de novo.");
        } else {
          toast.error(`Falha ao criar sessão: ${err.message}`);
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <PipeeloLogo size="md" />
        </div>
      </header>

      <main className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-xl mx-auto">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3">
            Iniciar Onboarding
          </h1>
          <p className="text-muted-foreground mb-8">
            Preencha os dados da sua empresa para começar. Você receberá um link
            único pra continuar e compartilhar com os responsáveis de cada
            departamento.
          </p>

          <Card className="p-6 md:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Nome da empresa <span className="text-primary">*</span>
                </label>
                <Input
                  type="text"
                  value={empresaNome}
                  onChange={(e) => setEmpresaNome(e.target.value)}
                  placeholder="Ex: Pipeelo Telecom"
                  className="text-lg py-6"
                  autoFocus
                  disabled={loading}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  CNPJ <span className="text-primary">*</span>
                </label>
                <Input
                  type="text"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  onBlur={handleCnpjBlur}
                  placeholder="00.000.000/0000-00"
                  className="text-lg py-6"
                  inputMode="numeric"
                  disabled={loading}
                  aria-invalid={Boolean(cnpjError)}
                  aria-describedby="cnpj-error"
                />
                {cnpjError ? (
                  <p
                    id="cnpj-error"
                    className="text-xs text-destructive mt-1"
                    role="alert"
                  >
                    {cnpjError}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    Validação local de checksum — formatação é automática.
                  </p>
                )}
              </div>

              {hasSiteKey && (
                <div>
                  <TurnstileWidget onSuccess={setTurnstileToken} />
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                className="w-full gap-2"
                disabled={loading || !canSubmit}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Criando...
                  </>
                ) : (
                  <>
                    Criar onboarding
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </Button>
            </form>
          </Card>

          <p className="text-sm text-muted-foreground text-center mt-6">
            Já tem um link?{" "}
            <button
              type="button"
              className="text-primary hover:underline"
              onClick={() => navigate("/")}
            >
              Volte pra home
            </button>
          </p>
        </div>
      </main>
    </div>
  );
}
