import { Card, CardContent } from "@/components/ui/card";
import { Building2, DollarSign, Wrench, TrendingUp, Clock, Users } from 'lucide-react';
import { DepartmentId, Departamento } from '@/types/onboarding';
import onboardingData from '@/lib/questions.json';

interface DepartmentSelectorProps {
  onSelect: (department: DepartmentId) => void;
  selected?: DepartmentId | null;
}

const departmentIcons: Record<DepartmentId, typeof Building2> = {
  sac_geral: Building2,
  financeiro: DollarSign,
  suporte: Wrench,
  vendas: TrendingUp
};

const departmentColors: Record<DepartmentId, string> = {
  sac_geral: 'from-pipeelo-purple/20 to-pipeelo-purple/5 border-pipeelo-purple/30 hover:border-pipeelo-purple',
  financeiro: 'from-pipeelo-green/20 to-pipeelo-green/5 border-pipeelo-green/30 hover:border-pipeelo-green',
  suporte: 'from-pipeelo-blue/20 to-pipeelo-blue/5 border-pipeelo-blue/30 hover:border-pipeelo-blue',
  vendas: 'from-amber-500/20 to-amber-500/5 border-amber-500/30 hover:border-amber-500'
};

const departmentIconColors: Record<DepartmentId, string> = {
  sac_geral: 'text-pipeelo-purple',
  financeiro: 'text-pipeelo-green',
  suporte: 'text-pipeelo-blue',
  vendas: 'text-amber-500'
};

interface DeptData {
  nome: string;
  slug: string;
  responsavel_sugerido: string;
  tempo_estimado: string;
  descricao: string;
  ordem_execucao: number;
  secoes: Record<string, { perguntas: unknown[] }>;
}

export function DepartmentSelector({ onSelect, selected }: DepartmentSelectorProps) {
  const departments = Object.entries(onboardingData.departamentos) as [DepartmentId, DeptData][];

  const countQuestions = (dept: DeptData): number => {
    return Object.values(dept.secoes).reduce((acc: number, section) => {
      return acc + section.perguntas.length;
    }, 0);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {departments.map(([id, dept]) => {
        const Icon = departmentIcons[id];
        const isSelected = selected === id;
        const questionCount = countQuestions(dept);
        
        return (
          <Card
            key={id}
            className={`cursor-pointer transition-all duration-200 bg-gradient-to-br ${departmentColors[id]} ${
              isSelected ? 'ring-2 ring-offset-2 ring-pipeelo-green' : ''
            }`}
            onClick={() => onSelect(id)}
          >
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl bg-background/80 ${departmentIconColors[id]}`}>
                  <Icon className="h-6 w-6" />
                </div>
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold text-lg">{dept.nome}</h3>
                  <p className="text-sm text-muted-foreground">{dept.descricao}</p>
                  
                  <div className="flex items-center gap-4 pt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      <span>{dept.responsavel_sugerido}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{dept.tempo_estimado}</span>
                    </div>
                    <span>•</span>
                    <span>{questionCount} perguntas</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
