import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PipeeloLogo } from "@/components/PipeeloLogo";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function NovoOnboarding() {
  const navigate = useNavigate();
  const [empresaNome, setEmpresaNome] = useState("");
  const [ceoEmail, setCeoEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (empresaNome.trim().length < 2) {
      toast.error("Informe o nome da empresa");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/create-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_nome: empresaNome.trim(),
          ceo_email: ceoEmail.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Falha ao criar sessão");
      }
      toast.success(`Onboarding criado: ${data.session.slug}`);
      navigate(`/${data.session.slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
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
                  Email do responsável (CEO/Admin)
                </label>
                <Input
                  type="email"
                  value={ceoEmail}
                  onChange={(e) => setCeoEmail(e.target.value)}
                  placeholder="seunome@suaempresa.com.br"
                  className="text-lg py-6"
                  disabled={loading}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Opcional — usado pra enviar o link do onboarding por email.
                </p>
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full gap-2"
                disabled={loading}
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
