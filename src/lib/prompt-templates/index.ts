import mainTemplate from "./main.md?raw";
import vendasTemplate from "./vendas.md?raw";
import suporteTemplate from "./suporte.md?raw";
import financeiroTemplate from "./financeiro.md?raw";
import closerTemplate from "./closer.md?raw";

export const PROMPT_TEMPLATES = {
  main: mainTemplate,
  vendas: vendasTemplate,
  suporte: suporteTemplate,
  financeiro: financeiroTemplate,
  closer: closerTemplate,
} as const;

export type PromptTemplateId = keyof typeof PROMPT_TEMPLATES;

export function renderTemplate(
  template: string,
  vars: Record<string, string | number | null | undefined>
): string {
  return template.replace(/\{\{([a-z_0-9]+)\}\}/gi, (_, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") return `[[${key}]]`;
    return String(value);
  });
}
