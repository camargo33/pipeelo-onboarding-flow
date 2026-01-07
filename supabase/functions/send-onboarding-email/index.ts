const Resend = (await import("https://esm.sh/resend@2.0.0")).Resend;

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OnboardingEmailRequest {
  empresaNome: string;
  departamento: string;
  departamentoNome: string;
  responsavelNome: string;
  respostas: Record<string, any>;
  sessionId: string;
  allDepartmentsComplete?: boolean;
}

// Mapping of questions to prompt sections for each department
const PROMPT_MAPPING = {
  sac_geral: {
    secao_8_empresa: [
      { questionId: 'empresa_nome_oficial', placeholder: '[Nome da empresa]', section: 'SEÇÃO 8' },
      { questionId: 'empresa_cidades', placeholder: '[Cidades atendidas]', section: 'SEÇÃO 8' },
      { questionId: 'empresa_enderecos', placeholder: '[Endereço]', section: 'SEÇÃO 8' },
      { questionId: 'empresa_telefones', placeholder: '[Telefones]', section: 'SEÇÃO 8' },
      { questionId: 'empresa_site', placeholder: '[Site]', section: 'SEÇÃO 8' },
    ],
    identidade_ia: [
      { questionId: 'nome_ia_customizado', label: 'Nome IA customizado' },
      { questionId: 'nome_ia', label: 'Nome da IA' },
      { questionId: 'regionalismo', label: 'Regionalismo' },
    ],
    horarios: [
      { questionId: 'horario_atendimento', label: 'Horário de atendimento' },
      { questionId: 'tem_plantao', label: 'Tem plantão' },
      { questionId: 'horario_plantao', label: 'Horário do plantão' },
      { questionId: 'horario_aciona_plantao', label: 'Horário aciona plantão' },
    ],
    estrutura: [
      { questionId: 'departamentos_lista', label: 'Departamentos existentes' },
      { questionId: 'departamentos_destino', label: 'Departamentos destino transferência' },
      { questionId: 'clientes_prioritarios', label: 'Clientes prioritários' },
    ],
    nps: [
      { questionId: 'nps_nota_baixa_acao', label: 'NPS nota baixa (0-3)' },
      { questionId: 'nps_nota_alta_acao', label: 'NPS nota alta (9-10)' },
      { questionId: 'nps_nota_alta_acao_outra', label: 'Outra ação NPS' },
    ],
    processos_especiais: [
      { questionId: 'cancelamento_coletar_motivo', label: 'Cancelamento: coletar motivo' },
      { questionId: 'cancelamento_tentar_reter', label: 'Cancelamento: tentar reter' },
      { questionId: 'cancelamento_departamento', label: 'Cancelamento: departamento destino' },
      { questionId: 'mudanca_endereco', label: 'Mudança endereço: departamento' },
      { questionId: 'mudanca_endereco_taxa', label: 'Mudança endereço: taxa' },
      { questionId: 'valor_mudanca_endereco', label: 'Mudança endereço: valor' },
      { questionId: 'troca_titularidade_departamento', label: 'Troca titularidade: departamento' },
      { questionId: 'troca_titularidade_documentos', label: 'Troca titularidade: dados coletar' },
      { questionId: 'suspensao_temporaria_departamento', label: 'Suspensão: departamento' },
      { questionId: 'suspensao_periodo', label: 'Suspensão: período' },
      { questionId: 'suspensao_cobranca', label: 'Suspensão: cobrança' },
      { questionId: 'ponto_adicional_departamento', label: 'Ponto adicional: departamento' },
      { questionId: 'ponto_adicional_taxa', label: 'Ponto adicional: taxa' },
      { questionId: 'valor_ponto_adicional', label: 'Ponto adicional: valor' },
    ],
  },
  financeiro: {
    secao_11_empresa: [
      { questionId: 'empresa_nome_oficial', placeholder: '[Nome]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_cidades', placeholder: '[Cidades atendidas]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_enderecos', placeholder: '[Endereço]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_telefones', placeholder: '[Telefones]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_site', placeholder: '[Site]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_portal_cliente', placeholder: '[Link central de assinantes]', section: 'SEÇÃO 11', fromSacGeral: true },
    ],
    caso_4_vencimento: [
      { questionId: 'vencimentos_disponiveis', label: 'Dias de vencimento disponíveis', section: 'CASO 4' },
      { questionId: 'vencimentos_outros', label: 'Outros dias de vencimento' },
    ],
    pagamento: [
      { questionId: 'formas_pagamento_disponiveis', label: 'Formas de pagamento' },
      { questionId: 'metodo_pagamento_padrao', label: 'Método padrão' },
      { questionId: 'salvar_preferencia_pagamento', label: 'Salvar preferência' },
      { questionId: 'emite_carnes', label: 'Emite carnês' },
    ],
    bloqueio_desbloqueio: [
      { questionId: 'dias_atraso_bloqueio', label: 'Dias para bloqueio', section: 'CASOS 5 e 6' },
      { questionId: 'tipo_bloqueio', label: 'Tipo de bloqueio' },
      { questionId: 'liberacao_confianca', label: 'Liberação em confiança' },
      { questionId: 'dias_liberacao_confianca', label: 'Dias liberação confiança', section: 'SEÇÃO 10' },
      { questionId: 'limite_dias_sem_confianca', label: 'Limite dias SEM confiança' },
      { questionId: 'promessa_pagamento', label: 'Promessa de pagamento' },
    ],
    taxas: [
      { questionId: 'taxa_religacao', label: 'Taxa religação' },
      { questionId: 'valor_taxa_religacao', label: 'Valor taxa religação' },
      { questionId: 'taxa_troca_titularidade', label: 'Taxa troca titularidade' },
      { questionId: 'valor_taxa_titularidade', label: 'Valor taxa titularidade' },
      { questionId: 'outras_taxas', label: 'Outras taxas' },
    ],
    casos_especiais: [
      { questionId: 'cobranca_incorreta', label: 'Cobrança incorreta (CASO 1)' },
      { questionId: 'pagamento_duplicado', label: 'Pagamento duplicado (CASO 1)' },
      { questionId: 'comprovante_enviado', label: 'Comprovante enviado (CASO 3)' },
    ],
  },
  suporte: {
    secao_11_empresa: [
      { questionId: 'empresa_nome_oficial', placeholder: '[Nome]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_cidades', placeholder: '[Cidades atendidas]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_enderecos', placeholder: '[Endereço]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_telefones', placeholder: '[Telefones]', section: 'SEÇÃO 11', fromSacGeral: true },
      { questionId: 'empresa_site', placeholder: '[Site]', section: 'SEÇÃO 11', fromSacGeral: true },
    ],
    diagnostico: [
      { questionId: 'sequencia_customizada', label: 'Sequência diagnóstico (CASO 1)' },
      { questionId: 'sequencia_descricao', label: 'Descrição sequência' },
    ],
    integracoes: [
      { questionId: 'reset_onu_tipo', label: 'Reset ONU' },
      { questionId: 'porcentagem_onus_mapeadas', label: '% ONUs mapeadas' },
      { questionId: 'sistema_gerenciamento', label: 'Sistema gerenciamento de redes' },
      { questionId: 'protocolo_tr069', label: 'Protocolo TR-069 ativo' },
    ],
    alteracoes_remotas: [
      { questionId: 'troca_senha_wifi', label: 'Troca senha WiFi' },
      { questionId: 'validacao_troca_senha', label: 'Validação troca senha' },
      { questionId: 'troca_nome_wifi', label: 'Troca nome WiFi' },
      { questionId: 'verificar_dispositivos', label: 'Ver dispositivos conectados' },
    ],
    outros_servicos: [
      { questionId: 'suporte_tv', label: 'Suporte TV' },
      { questionId: 'diagnostico_tv', label: 'Diagnóstico TV' },
      { questionId: 'suporte_telefonia_fixa', label: 'Telefonia fixa' },
      { questionId: 'suporte_telefonia_movel', label: 'Telefonia móvel' },
    ],
    casos_especiais: [
      { questionId: 'login_senha_app', label: 'Nome app cliente' },
    ],
  },
  vendas: {
    secao_13_empresa: [
      { questionId: 'empresa_nome_oficial', placeholder: '[Nome]', section: 'SEÇÃO 13', fromSacGeral: true },
      { questionId: 'empresa_cidades', placeholder: '[Cidades atendidas]', section: 'SEÇÃO 13', fromSacGeral: true },
      { questionId: 'empresa_enderecos', placeholder: '[Endereço]', section: 'SEÇÃO 13', fromSacGeral: true },
      { questionId: 'empresa_telefones', placeholder: '[Telefones]', section: 'SEÇÃO 13', fromSacGeral: true },
      { questionId: 'empresa_site', placeholder: '[Site]', section: 'SEÇÃO 13', fromSacGeral: true },
    ],
    portfolio: [
      { questionId: 'tem_fidelidade', label: 'Tem fidelidade (SEÇÃO 12)' },
      { questionId: 'periodo_fidelidade', label: 'Período fidelidade' },
      { questionId: 'produtos_adicionais', label: 'Produtos adicionais' },
      { questionId: 'combos_disponiveis', label: 'Combos disponíveis' },
      { questionId: 'diferenciais_concorrencia', label: 'Diferenciais' },
    ],
    qualificacao: [
      { questionId: 'perguntas_qualificacao', label: 'Fazer qualificação' },
      { questionId: 'perguntas_lista', label: 'Perguntas de qualificação' },
    ],
    pre_cadastro: [
      { questionId: 'ia_faz_pre_cadastro', label: 'Tipo pré-cadastro (CASO 1)' },
      { questionId: 'dados_pre_cadastro', label: 'Dados coletar' },
      { questionId: 'solicitar_foto_documentos', label: 'Solicitar foto docs' },
    ],
    cliente_existente: [
      { questionId: 'upgrade_plano', label: 'Upgrade plano' },
      { questionId: 'segundo_ponto', label: 'Segundo ponto' },
    ],
    instalacao: [
      { questionId: 'tempo_instalacao', label: 'Prazo instalação' },
      { questionId: 'taxa_instalacao', label: 'Taxa instalação' },
      { questionId: 'valor_instalacao', label: 'Valor instalação' },
      { questionId: 'agendamento_instalacao', label: 'Agendamento' },
    ],
  },
};

function formatValue(value: any): string {
  if (value === undefined || value === null) return '<não informado>';
  if (value === 'NAO_POSSUI') return 'Não possui';
  
  if (typeof value === 'object') {
    // Handle checkbox_multiple
    if (value.selected && Array.isArray(value.selected)) {
      let formatted = value.selected.join(', ');
      if (value.outroTexto) {
        formatted += ` (Outro: ${value.outroTexto})`;
      }
      return formatted;
    }
    
    // Handle horario_semanal
    if (value.segunda_sexta) {
      const parts = [];
      if (value.segunda_sexta && !value.segunda_sexta.nao_atende) {
        parts.push(`Seg-Sex: ${value.segunda_sexta.inicio} às ${value.segunda_sexta.fim}`);
      }
      if (value.sabado && !value.sabado.nao_atende) {
        parts.push(`Sáb: ${value.sabado.inicio} às ${value.sabado.fim}`);
      } else if (value.sabado?.nao_atende) {
        parts.push('Sáb: Não atende');
      }
      if (value.domingo_feriado && !value.domingo_feriado.nao_atende) {
        parts.push(`Dom/Feriado: ${value.domingo_feriado.inicio} às ${value.domingo_feriado.fim}`);
      } else if (value.domingo_feriado?.nao_atende) {
        parts.push('Dom/Feriado: Não atende');
      }
      return parts.join(' | ');
    }
    
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    
    return JSON.stringify(value);
  }
  
  return String(value);
}

function generateSubstituicoesBlock(mapping: any[], respostas: Record<string, any>): string {
  return mapping.map(item => {
    const value = respostas[item.questionId];
    const formattedValue = formatValue(value);
    const sectionInfo = item.section ? ` <span style="color: #666; font-size: 11px;">(${item.section})</span>` : '';
    const note = item.fromSacGeral ? ' <span style="color: #f59e0b; font-size: 10px;">⚠️ Vem do SAC/Geral</span>' : '';
    return `<tr>
      <td style="padding: 10px; border: 1px solid #e2e8f0; font-family: monospace; background: #f8fafc;">${item.placeholder}</td>
      <td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>${formattedValue}</strong>${sectionInfo}${note}</td>
    </tr>`;
  }).join('');
}

function generateConfigBlock(title: string, mapping: any[], respostas: Record<string, any>): string {
  const rows = mapping.map(item => {
    const value = respostas[item.questionId];
    const formattedValue = formatValue(value);
    const sectionInfo = item.section ? ` <span style="color: #666; font-size: 11px;">(${item.section})</span>` : '';
    return `<tr>
      <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 500;">${item.label}${sectionInfo}</td>
      <td style="padding: 8px; border: 1px solid #e2e8f0;">${formattedValue}</td>
    </tr>`;
  }).join('');
  
  return `
    <div style="margin: 20px 0;">
      <h3 style="color: #1ECAA3; margin-bottom: 10px; font-size: 14px; text-transform: uppercase;">${title}</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

function generateSacGeralEmail(respostas: Record<string, any>): string {
  const mapping = PROMPT_MAPPING.sac_geral;
  
  return `
    <div style="background: #f0fdf4; border-left: 4px solid #1ECAA3; padding: 15px; margin: 20px 0;">
      <h3 style="color: #166534; margin: 0 0 10px 0;">📋 Substituições Diretas no Prompt - SEÇÃO 8</h3>
      <p style="color: #15803d; margin: 0; font-size: 13px;">Copie e cole os valores abaixo nos placeholders correspondentes do prompt</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background: #1ECAA3;">
          <th style="padding: 12px; text-align: left; color: white; width: 40%;">Placeholder no Prompt</th>
          <th style="padding: 12px; text-align: left; color: white;">Valor para Substituir</th>
        </tr>
      </thead>
      <tbody>
        ${generateSubstituicoesBlock(mapping.secao_8_empresa, respostas)}
      </tbody>
    </table>
    
    ${generateConfigBlock('🤖 Identidade da IA', mapping.identidade_ia, respostas)}
    ${generateConfigBlock('🕐 Horários e Plantão', mapping.horarios, respostas)}
    ${generateConfigBlock('🏗️ Estrutura de Departamentos', mapping.estrutura, respostas)}
    ${generateConfigBlock('⭐ Configurações NPS', mapping.nps, respostas)}
  `;
}

function generateFinanceiroEmail(respostas: Record<string, any>): string {
  const mapping = PROMPT_MAPPING.financeiro;
  
  return `
    <div style="background: #f0fdf4; border-left: 4px solid #1ECAA3; padding: 15px; margin: 20px 0;">
      <h3 style="color: #166534; margin: 0 0 10px 0;">📋 Substituições Diretas no Prompt - SEÇÃO 11</h3>
      <p style="color: #15803d; margin: 0; font-size: 13px;">⚠️ Campos marcados com amarelo devem ser copiados do SAC/Geral</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background: #1ECAA3;">
          <th style="padding: 12px; text-align: left; color: white; width: 40%;">Placeholder no Prompt</th>
          <th style="padding: 12px; text-align: left; color: white;">Valor para Substituir</th>
        </tr>
      </thead>
      <tbody>
        ${generateSubstituicoesBlock(mapping.secao_11_empresa, respostas)}
      </tbody>
    </table>
    
    ${generateConfigBlock('📅 Configurações CASO 4 (Mudar Vencimento)', mapping.caso_4_vencimento, respostas)}
    ${generateConfigBlock('💳 Configurações de Pagamento (CASO 2)', mapping.pagamento, respostas)}
    ${generateConfigBlock('🔒 Bloqueio/Desbloqueio (CASOS 5 e 6)', mapping.bloqueio_desbloqueio, respostas)}
    ${generateConfigBlock('💵 Taxas (SEÇÃO 10 - Guias Gerais)', mapping.taxas, respostas)}
    ${generateConfigBlock('⚠️ Casos Especiais (CASOS 1 e 3)', mapping.casos_especiais, respostas)}
  `;
}

function generateSuporteEmail(respostas: Record<string, any>): string {
  const mapping = PROMPT_MAPPING.suporte;
  
  return `
    <div style="background: #f0fdf4; border-left: 4px solid #1ECAA3; padding: 15px; margin: 20px 0;">
      <h3 style="color: #166534; margin: 0 0 10px 0;">📋 Substituições Diretas no Prompt - SEÇÃO 11</h3>
      <p style="color: #15803d; margin: 0; font-size: 13px;">⚠️ Campos marcados com amarelo devem ser copiados do SAC/Geral</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background: #1ECAA3;">
          <th style="padding: 12px; text-align: left; color: white; width: 40%;">Placeholder no Prompt</th>
          <th style="padding: 12px; text-align: left; color: white;">Valor para Substituir</th>
        </tr>
      </thead>
      <tbody>
        ${generateSubstituicoesBlock(mapping.secao_11_empresa, respostas)}
      </tbody>
    </table>
    
    ${generateConfigBlock('🌐 Diagnóstico (CASO 1)', mapping.diagnostico, respostas)}
    ${generateConfigBlock('🔌 Integrações Técnicas', mapping.integracoes, respostas)}
    ${generateConfigBlock('🔧 Alterações Remotas', mapping.alteracoes_remotas, respostas)}
    ${generateConfigBlock('📺 Outros Serviços (TV, Telefonia)', mapping.outros_servicos, respostas)}
    ${generateConfigBlock('🔍 Casos Específicos (CASOS 2, 3, 4)', mapping.casos_especiais, respostas)}
  `;
}

function generateVendasEmail(respostas: Record<string, any>): string {
  const mapping = PROMPT_MAPPING.vendas;
  
  return `
    <div style="background: #f0fdf4; border-left: 4px solid #1ECAA3; padding: 15px; margin: 20px 0;">
      <h3 style="color: #166534; margin: 0 0 10px 0;">📋 Substituições Diretas no Prompt - SEÇÃO 13</h3>
      <p style="color: #15803d; margin: 0; font-size: 13px;">⚠️ Campos marcados com amarelo devem ser copiados do SAC/Geral</p>
    </div>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background: #1ECAA3;">
          <th style="padding: 12px; text-align: left; color: white; width: 40%;">Placeholder no Prompt</th>
          <th style="padding: 12px; text-align: left; color: white;">Valor para Substituir</th>
        </tr>
      </thead>
      <tbody>
        ${generateSubstituicoesBlock(mapping.secao_13_empresa, respostas)}
      </tbody>
    </table>
    
    ${generateConfigBlock('📦 Portfólio (SEÇÃO 12)', mapping.portfolio, respostas)}
    ${generateConfigBlock('🎯 Qualificação do Lead', mapping.qualificacao, respostas)}
    ${generateConfigBlock('📝 Pré-Cadastro (CASO 1)', mapping.pre_cadastro, respostas)}
    ${generateConfigBlock('👤 Cliente Existente', mapping.cliente_existente, respostas)}
    ${generateConfigBlock('🔧 Instalação', mapping.instalacao, respostas)}
  `;
}

function getDepartmentSpecificContent(departamento: string, respostas: Record<string, any>): string {
  switch (departamento) {
    case 'sac_geral':
      return generateSacGeralEmail(respostas);
    case 'financeiro':
      return generateFinanceiroEmail(respostas);
    case 'suporte':
      return generateSuporteEmail(respostas);
    case 'vendas':
      return generateVendasEmail(respostas);
    default:
      return '';
  }
}

function getDepartmentColor(departamento: string): string {
  switch (departamento) {
    case 'sac_geral': return '#9333ea';
    case 'financeiro': return '#1ECAA3';
    case 'suporte': return '#3b82f6';
    case 'vendas': return '#f59e0b';
    default: return '#1ECAA3';
  }
}

function getDepartmentEmoji(departamento: string): string {
  switch (departamento) {
    case 'sac_geral': return '🏢';
    case 'financeiro': return '💰';
    case 'suporte': return '🔧';
    case 'vendas': return '📈';
    default: return '✅';
  }
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: OnboardingEmailRequest = await req.json();
    console.log("Received onboarding email request:", JSON.stringify(data, null, 2));

    const { 
      empresaNome, 
      departamento, 
      departamentoNome, 
      responsavelNome, 
      respostas,
      sessionId,
      allDepartmentsComplete 
    } = data;

    const departmentColor = getDepartmentColor(departamento);
    const departmentEmoji = getDepartmentEmoji(departamento);
    const departmentContent = getDepartmentSpecificContent(departamento, respostas);

    // Format all responses for reference section
    const respostasFormatadas = Object.entries(respostas)
      .map(([perguntaId, valor]) => {
        const valorFormatado = formatValue(valor);
        return `<tr>
          <td style="padding: 8px; border: 1px solid #e2e8f0; font-family: monospace; font-size: 12px; background: #f8fafc;">${perguntaId}</td>
          <td style="padding: 8px; border: 1px solid #e2e8f0;">${valorFormatado}</td>
        </tr>`;
      })
      .join('');

    // Send email notification
    const emailResponse = await resend.emails.send({
      from: "Pipeelo Onboarding <onboarding@resend.dev>",
      to: ["onboarding@pipeelo.com"],
      subject: `${departmentEmoji} Onboarding ${empresaNome} - ${departamentoNome} concluído`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 800px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, ${departmentColor} 0%, ${departmentColor}dd 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .info-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
            .info-item { margin-bottom: 10px; }
            .info-label { font-weight: 600; color: #666; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
            .badge-success { background: #d4edda; color: #155724; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #1ECAA3; color: white; padding: 12px 8px; text-align: left; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
            .section-divider { border-top: 2px solid #e2e8f0; margin: 30px 0; padding-top: 20px; }
            .copy-tip { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 15px; margin: 15px 0; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${departmentEmoji} ${departamentoNome} - Onboarding Concluído</h1>
            </div>
            <div class="content">
              <div class="info-box">
                <div class="info-item">
                  <span class="info-label">Empresa:</span> <strong>${empresaNome}</strong>
                </div>
                <div class="info-item">
                  <span class="info-label">Departamento:</span> 
                  <span class="badge badge-success">${departamentoNome}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Responsável:</span> ${responsavelNome}
                </div>
                <div class="info-item">
                  <span class="info-label">Session ID:</span> <code style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${sessionId}</code>
                </div>
                <div class="info-item">
                  <span class="info-label">Data/Hora:</span> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </div>
              </div>
              
              <div class="copy-tip">
                💡 <strong>Dica:</strong> Os blocos abaixo estão organizados para facilitar a customização do prompt. Copie os valores e substitua os placeholders correspondentes.
              </div>
              
              ${departmentContent}
              
              <div class="section-divider">
                <h3 style="color: #64748b;">📚 Referência Completa - Todas as Respostas</h3>
                <p style="color: #94a3b8; font-size: 13px;">Lista completa de todas as respostas coletadas (para conferência)</p>
              </div>
              
              <details style="margin-top: 15px;">
                <summary style="cursor: pointer; color: #1ECAA3; font-weight: 600;">Expandir todas as respostas (${Object.keys(respostas).length} campos)</summary>
                <table style="margin-top: 10px;">
                  <thead>
                    <tr>
                      <th style="width: 35%;">ID da Pergunta</th>
                      <th>Resposta</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${respostasFormatadas}
                  </tbody>
                </table>
              </details>
            </div>
            <div class="footer">
              <p>Este e-mail foi enviado automaticamente pelo sistema de onboarding Pipeelo.</p>
              <p style="margin-top: 10px; color: #94a3b8;">Session: ${sessionId}</p>
            </div>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, emailResponse }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-onboarding-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

Deno.serve(handler);
