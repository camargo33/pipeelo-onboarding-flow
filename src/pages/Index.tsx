import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PipeeloLogo } from "@/components/PipeeloLogo";
import { ArrowRight, Clock, CheckCircle2, Users, Headphones, DollarSign, Wrench, TrendingUp } from "lucide-react";

const departments = [
  {
    id: "sac_geral",
    name: "SAC/Geral",
    icon: Headphones,
    description: "Informações da empresa, identidade da IA, tom de voz",
    questions: 31,
    time: "10-15 min",
    color: "bg-primary",
  },
  {
    id: "financeiro",
    name: "Financeiro",
    icon: DollarSign,
    description: "Processos financeiros, formas de pagamento, bloqueios",
    questions: 42,
    time: "15-20 min",
    color: "bg-secondary",
  },
  {
    id: "suporte",
    name: "Suporte",
    icon: Wrench,
    description: "Diagnósticos técnicos, integrações, processos especiais",
    questions: 58,
    time: "20-25 min",
    color: "bg-pipeelo-blue",
  },
  {
    id: "vendas",
    name: "Vendas",
    icon: TrendingUp,
    description: "Portfólio, viabilidade, qualificação, instalação",
    questions: 27,
    time: "15-20 min",
    color: "bg-pipeelo-purple",
  },
];

const Index = () => {
  const navigate = useNavigate();
  
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <PipeeloLogo size="md" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>~60 min no total</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-3xl mx-auto text-center mb-16 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <CheckCircle2 className="h-4 w-4" />
            Processo simplificado de onboarding
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-6 leading-tight">
            Bem-vindo ao{" "}
            <span className="text-gradient-primary">Onboarding</span>{" "}
            Pipeelo!
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 leading-relaxed">
            Vamos coletar algumas informações sobre sua empresa para configurar 
            sua IA de atendimento da melhor forma possível. O processo é dividido 
            em <strong>4 departamentos</strong> que podem ser respondidos em paralelo.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg" 
              className="bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow gap-2 px-8"
              onClick={() => navigate('/onboarding')}
            >
              Iniciar Onboarding
              <ArrowRight className="h-5 w-5" />
            </Button>
            <Button 
              size="lg" 
              variant="outline" 
              className="gap-2"
            >
              <Users className="h-5 w-5" />
              Já tenho um link
            </Button>
          </div>
        </div>

        {/* Departments Grid */}
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-semibold text-foreground text-center mb-8">
            Departamentos do Onboarding
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {departments.map((dept, index) => (
              <Card 
                key={dept.id}
                className="p-6 hover:shadow-lg transition-all duration-300 border-border hover:border-primary/30 cursor-pointer group animate-fade-in"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${dept.color} text-primary-foreground shrink-0 group-hover:scale-110 transition-transform`}>
                    <dept.icon className="h-6 w-6" />
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                      {dept.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {dept.description}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {dept.questions} perguntas
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {dept.time}
                      </span>
                    </div>
                  </div>

                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Info Section */}
        <div className="max-w-3xl mx-auto mt-16 text-center">
          <Card className="p-8 bg-muted/30 border-dashed">
            <h3 className="text-lg font-semibold text-foreground mb-3">
              💡 Como funciona?
            </h3>
            <p className="text-muted-foreground leading-relaxed">
              Cada departamento pode ser respondido por uma pessoa diferente da sua equipe.
              Você pode compartilhar o link do onboarding com os responsáveis e acompanhar
              o progresso em tempo real. Quando todos os departamentos forem concluídos,
              iniciaremos a implementação da sua IA em até <strong>15 dias</strong>.
            </p>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Precisa de ajuda? Entre em contato pelo WhatsApp: <strong className="text-primary">(44) 93618-3018</strong></p>
        </div>
      </footer>
    </div>
  );
};

export default Index;