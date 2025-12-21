import { useState, useEffect } from 'react';
import { Question, QuestionOption } from '@/types/onboarding';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ExternalLink, Info } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface QuestionRendererProps {
  question: Question;
  value: any;
  onChange: (value: any) => void;
  onSubmit: () => void;
  error?: string;
}

export function QuestionRenderer({ 
  question, 
  value, 
  onChange, 
  onSubmit,
  error 
}: QuestionRendererProps) {
  const [localValue, setLocalValue] = useState(value ?? '');

  useEffect(() => {
    setLocalValue(value ?? (question.tipo === 'checkbox_multiple' ? [] : ''));
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

      case 'time':
        return (
          <Input
            type="time"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            onKeyPress={handleKeyPress}
            className="text-lg py-6 w-40"
            autoFocus
          />
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
        const selectedValues = Array.isArray(localValue) ? localValue : [];
        return (
          <div className="space-y-3">
            {question.opcoes?.map((option: QuestionOption) => (
              <div key={option.value} className="flex items-center space-x-3">
                <Checkbox
                  id={`${question.id}-${option.value}`}
                  checked={selectedValues.includes(option.value)}
                  onCheckedChange={(checked) => {
                    const newValue = checked
                      ? [...selectedValues, option.value]
                      : selectedValues.filter((v: string) => v !== option.value);
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
