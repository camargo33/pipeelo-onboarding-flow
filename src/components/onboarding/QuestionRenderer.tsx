import { useState, useEffect } from 'react';
import { Question, QuestionOption } from '@/types/onboarding';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ExternalLink, Info, X, Clock } from 'lucide-react';

interface QuestionRendererProps {
  question: Question;
  value: any;
  onChange: (value: any) => void;
  onSubmit: () => void;
  error?: string;
}

interface HorarioSemanal {
  segunda_sexta: { inicio: string; fim: string; nao_atende: boolean };
  sabado: { inicio: string; fim: string; nao_atende: boolean };
  domingo_feriado: { inicio: string; fim: string; nao_atende: boolean };
}

interface CheckboxMultipleValue {
  selected: string[];
  outroTexto?: string;
}

const defaultHorario: HorarioSemanal = {
  segunda_sexta: { inicio: '08:00', fim: '18:00', nao_atende: false },
  sabado: { inicio: '08:00', fim: '12:00', nao_atende: false },
  domingo_feriado: { inicio: '', fim: '', nao_atende: true }
};

export function QuestionRenderer({ 
  question, 
  value, 
  onChange, 
  onSubmit,
  error 
}: QuestionRendererProps) {
  const [localValue, setLocalValue] = useState(value ?? '');
  const [naoTemPortal, setNaoTemPortal] = useState(value === 'NAO_POSSUI');

  useEffect(() => {
    if (question.tipo === 'checkbox_multiple') {
      // Migrar valor antigo (array) para novo formato (objeto)
      if (Array.isArray(value)) {
        setLocalValue({ selected: value, outroTexto: '' });
      } else if (value && typeof value === 'object' && 'selected' in value) {
        setLocalValue(value);
      } else {
        setLocalValue({ selected: [], outroTexto: '' });
      }
    } else if (question.tipo === 'horario_semanal') {
      setLocalValue(value && typeof value === 'object' ? value : defaultHorario);
    } else if (question.tipo === 'url_optional') {
      setNaoTemPortal(value === 'NAO_POSSUI');
      setLocalValue(value ?? '');
    } else {
      setLocalValue(value ?? '');
    }
  }, [value, question.id, question.tipo]);

  const handleChange = (newValue: any) => {
    setLocalValue(newValue);
    onChange(newValue);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && question.tipo !== 'textarea') {
      e.preventDefault();
      onSubmit();
    }
  };

  const renderInput = () => {
    switch (question.tipo) {
      case 'text':
        return (
          <Input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={question.placeholder}
            className="text-lg py-6"
            autoFocus
          />
        );

      case 'textarea':
        return (
          <Textarea
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={question.placeholder}
            className="min-h-[120px] text-lg"
            autoFocus
          />
        );

      case 'number':
        return (
          <Input
            type="number"
            value={localValue}
            onChange={(e) => handleChange(e.target.value ? Number(e.target.value) : '')}
            onKeyPress={handleKeyPress}
            placeholder={question.placeholder}
            className="text-lg py-6"
            autoFocus
          />
        );

      case 'currency':
        return (
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
              R$
            </span>
            <Input
              type="number"
              step="0.01"
              value={localValue}
              onChange={(e) => handleChange(e.target.value ? Number(e.target.value) : '')}
              onKeyPress={handleKeyPress}
              placeholder={question.placeholder}
              className="text-lg py-6 pl-10"
              autoFocus
            />
          </div>
        );

      case 'url':
        return (
          <Input
            type="url"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={question.placeholder || 'https://'}
            className="text-lg py-6"
            autoFocus
          />
        );

      case 'url_optional':
        return (
          <div className="space-y-3">
            {!naoTemPortal && (
              <Input
                type="url"
                value={localValue === 'NAO_POSSUI' ? '' : localValue}
                onChange={(e) => handleChange(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={question.placeholder || 'https://'}
                className="text-lg py-6"
                autoFocus
              />
            )}
            <Button
              type="button"
              variant={naoTemPortal ? "default" : "outline"}
              className={`w-full justify-center py-3 h-auto ${
                naoTemPortal 
                  ? 'bg-pipeelo-purple hover:bg-pipeelo-purple/90 text-white' 
                  : 'border-dashed'
              }`}
              onClick={() => {
                const newState = !naoTemPortal;
                setNaoTemPortal(newState);
                handleChange(newState ? 'NAO_POSSUI' : '');
              }}
            >
              {naoTemPortal ? (
                <>
                  <X className="h-4 w-4 mr-2" />
                  Não possuo portal/área do cliente
                </>
              ) : (
                'Não possuo portal/área do cliente'
              )}
            </Button>
          </div>
        );

      case 'time':
        return (
          <div className="relative w-fit">
            <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="time"
              value={localValue}
              onChange={(e) => handleChange(e.target.value)}
              onKeyPress={handleKeyPress}
              className="text-lg py-6 pl-11 w-48"
              autoFocus
            />
          </div>
        );

      case 'horario_semanal':
        const horario: HorarioSemanal = localValue && typeof localValue === 'object' 
          ? localValue 
          : defaultHorario;

        const updateHorario = (
          periodo: keyof HorarioSemanal, 
          field: 'inicio' | 'fim' | 'nao_atende', 
          fieldValue: string | boolean
        ) => {
          const newHorario = {
            ...horario,
            [periodo]: {
              ...horario[periodo],
              [field]: fieldValue
            }
          };
          handleChange(newHorario);
        };

        return (
          <div className="space-y-4">
            {/* Segunda a Sexta */}
            <div className="p-4 border rounded-lg bg-card">
              <Label className="font-medium text-base">Segunda a Sexta</Label>
              <div className="flex gap-3 items-center mt-3">
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={horario.segunda_sexta.inicio}
                    onChange={(e) => updateHorario('segunda_sexta', 'inicio', e.target.value)}
                    className="w-36 pl-10"
                  />
                </div>
                <span className="text-muted-foreground">às</span>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="time"
                    value={horario.segunda_sexta.fim}
                    onChange={(e) => updateHorario('segunda_sexta', 'fim', e.target.value)}
                    className="w-36 pl-10"
                  />
                </div>
              </div>
            </div>

            {/* Sábados */}
            <div className={`p-4 border rounded-lg bg-card ${horario.sabado.nao_atende ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-center">
                <Label className="font-medium text-base">Sábados</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="sabado-nao-atende"
                    checked={horario.sabado.nao_atende}
                    onCheckedChange={(checked) => updateHorario('sabado', 'nao_atende', !!checked)}
                  />
                  <Label htmlFor="sabado-nao-atende" className="text-sm cursor-pointer">
                    Não atende
                  </Label>
                </div>
              </div>
              {!horario.sabado.nao_atende && (
                <div className="flex gap-3 items-center mt-3">
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={horario.sabado.inicio}
                      onChange={(e) => updateHorario('sabado', 'inicio', e.target.value)}
                      className="w-36 pl-10"
                    />
                  </div>
                  <span className="text-muted-foreground">às</span>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={horario.sabado.fim}
                      onChange={(e) => updateHorario('sabado', 'fim', e.target.value)}
                      className="w-36 pl-10"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Domingos e Feriados */}
            <div className={`p-4 border rounded-lg bg-card ${horario.domingo_feriado.nao_atende ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-center">
                <Label className="font-medium text-base">Domingos e Feriados</Label>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="domingo-nao-atende"
                    checked={horario.domingo_feriado.nao_atende}
                    onCheckedChange={(checked) => updateHorario('domingo_feriado', 'nao_atende', !!checked)}
                  />
                  <Label htmlFor="domingo-nao-atende" className="text-sm cursor-pointer">
                    Não atende
                  </Label>
                </div>
              </div>
              {!horario.domingo_feriado.nao_atende && (
                <div className="flex gap-3 items-center mt-3">
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={horario.domingo_feriado.inicio}
                      onChange={(e) => updateHorario('domingo_feriado', 'inicio', e.target.value)}
                      className="w-36 pl-10"
                    />
                  </div>
                  <span className="text-muted-foreground">às</span>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="time"
                      value={horario.domingo_feriado.fim}
                      onChange={(e) => updateHorario('domingo_feriado', 'fim', e.target.value)}
                      className="w-36 pl-10"
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case 'select':
        return (
          <div className="space-y-2">
            {question.opcoes?.map((option: QuestionOption) => (
              <Button
                key={option.value}
                type="button"
                variant={localValue === option.value ? "default" : "outline"}
                className={`w-full justify-start text-left py-4 h-auto ${
                  localValue === option.value 
                    ? 'bg-pipeelo-green hover:bg-pipeelo-green/90 text-white' 
                    : ''
                }`}
                onClick={() => {
                  handleChange(option.value);
                }}
              >
                {option.label}
              </Button>
            ))}
          </div>
        );

      case 'checkbox_multiple':
        const checkboxValue: CheckboxMultipleValue = 
          localValue && typeof localValue === 'object' && 'selected' in localValue
            ? localValue
            : { selected: Array.isArray(localValue) ? localValue : [], outroTexto: '' };
        
        const selectedValues = checkboxValue.selected;
        const hasOutroOption = question.opcoes?.some(opt => opt.value === 'outro');
        const outroSelected = selectedValues.includes('outro');

        return (
          <div className="space-y-3">
            {question.opcoes?.map((option: QuestionOption) => (
              <div key={option.value} className="flex items-center space-x-3">
                <Checkbox
                  id={`${question.id}-${option.value}`}
                  checked={selectedValues.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const newSelected = checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((v: string) => v !== option.value);
                    
                    const newValue: CheckboxMultipleValue = {
                      selected: newSelected,
                      outroTexto: option.value === 'outro' && !checked ? '' : checkboxValue.outroTexto
                    };
                    handleChange(newValue);
                  }}
                  className="h-5 w-5"
                />
                <Label 
                  htmlFor={`${question.id}-${option.value}`}
                  className="text-base cursor-pointer"
                >
                  {option.label}
                </Label>
              </div>
            ))}
            
            {/* Campo de texto para "Outro" */}
            {hasOutroOption && outroSelected && (
              <div className="ml-8 mt-2">
                <Input
                  type="text"
                  value={checkboxValue.outroTexto || ''}
                  onChange={(e) => {
                    const newValue: CheckboxMultipleValue = {
                      ...checkboxValue,
                      outroTexto: e.target.value
                    };
                    handleChange(newValue);
                  }}
                  placeholder="Especifique qual..."
                  className="text-base"
                  autoFocus
                />
              </div>
            )}
          </div>
        );

      case 'info':
        return (
          <div className="bg-muted/50 rounded-lg p-4 border border-border">
            <div className="flex gap-3">
              <Info className="h-5 w-5 text-pipeelo-blue shrink-0 mt-0.5" />
              <p className="text-muted-foreground">{question.texto}</p>
            </div>
          </div>
        );

      case 'info_link':
        return (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="flex gap-3">
                <Info className="h-5 w-5 text-pipeelo-blue shrink-0 mt-0.5" />
                <p className="text-muted-foreground">{question.hint}</p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => window.open(question.link, '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              Abrir ferramenta
            </Button>
          </div>
        );

      default:
        return (
          <Input
            type="text"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={question.placeholder}
            className="text-lg py-6"
            autoFocus
          />
        );
    }
  };

  return (
    <div className="space-y-4">
      {renderInput()}
      
      {question.hint && question.tipo !== 'info' && question.tipo !== 'info_link' && (
        <p className="text-sm text-muted-foreground">{question.hint}</p>
      )}
      
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
