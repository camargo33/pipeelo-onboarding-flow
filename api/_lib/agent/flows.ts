/**
 * Catálogo de FLUXOS PADRÃO de atendimento de ISP para o agente de onboarding V2.
 *
 * Derivado da análise de 162 reports reais da Netdigital (07/2026): 37% dos
 * problemas em produção eram pontos de decisão que nunca foram apresentados ao
 * dono como escolha explícita. Cada fluxo aqui tem: o fluxo padrão (o que a IA
 * de atendimento faz por default) e os PONTOS DE DECISÃO que variam entre
 * provedores — o agente apresenta o padrão, oferece as opções, o cliente
 * configura, o agente MONTA o fluxo final e confirma via `confirm_flow` antes
 * de concluir a etapa.
 */

export interface FlowDecision {
  id: string;
  pergunta: string;
  opcoes: string[];
  padrao?: string;
}

export interface StandardFlow {
  id: string;
  departamento: string;
  titulo: string;
  objetivo: string;
  fluxoPadrao: string[];
  decisoes: FlowDecision[];
}

export const STANDARD_FLOWS: StandardFlow[] = [
  {
    id: 'saudacao_menu',
    departamento: 'sac_geral',
    titulo: 'Saudação e menu inicial',
    objetivo: 'Primeira mensagem que o cliente vê no WhatsApp — identidade da marca e triagem.',
    fluxoPadrao: [
      'Saudação com o nome da empresa e do assistente',
      'Triagem: "já sou cliente" / "quero contratar"',
      'Menu de assuntos (suporte, financeiro, comercial...)',
      'Roteia para o agente/setor certo',
    ],
    decisoes: [
      { id: 'identidade', pergunta: 'Como deve ser a cara da primeira mensagem (emojis, negrito, cor/identidade da marca, tom)? Peça um exemplo aprovado pelo cliente.', opcoes: ['texto simples e direto', 'com emojis e identidade da marca (pedir exemplo)'], padrao: 'texto simples e direto' },
      { id: 'triagem', pergunta: 'Faz triagem "já sou cliente / não sou" ou vai direto ao assunto?', opcoes: ['triagem primeiro', 'direto ao assunto', 'pular triagem quando o número já está no cadastro'], padrao: 'triagem primeiro' },
      { id: 'itens_menu', pergunta: 'Quais os itens EXATOS do menu (nomes e ordem, como o cliente deve ler)?', opcoes: ['padrão: Suporte / Financeiro / Comercial / Outros', 'lista personalizada (coletar item a item)'] },
    ],
  },
  {
    id: 'identificacao_cliente',
    departamento: 'sac_geral',
    titulo: 'Identificação do cliente e multi-contrato',
    objetivo: 'Como confirmar quem é o cliente e qual contrato/endereço vale para o atendimento.',
    fluxoPadrao: [
      'Localiza o cadastro (telefone ou CPF/CNPJ)',
      'Confirma o titular ("encontrei o cadastro de Fulano, confere?")',
      'Se houver mais de um contrato/endereço, pergunta qual endereço é o do atendimento',
      'Segue para o assunto',
    ],
    decisoes: [
      { id: 'momento_endereco', pergunta: 'Com vários contratos: escolhe o endereço logo após identificar, ou só quando o assunto exigir?', opcoes: ['logo após identificar', 'só quando o assunto exigir'], padrao: 'logo após identificar' },
      { id: 'confirma_titular', pergunta: 'Confirma o nome do titular antes de mostrar qualquer dado?', opcoes: ['sempre', 'só em assuntos sensíveis (financeiro, senha, cancelamento)'], padrao: 'sempre' },
      { id: 'validacao_identidade', pergunta: 'Que dado valida a identidade para ações sensíveis?', opcoes: ['CPF', 'telefone cadastrado', 'CPF + telefone', 'nenhum'], padrao: 'CPF' },
      { id: 'titularidade', pergunta: 'Troca de titularidade: qual setor trata e que documentos podem ser pedidos pelo WhatsApp (selfie com documento é aceitável?)', opcoes: ['financeiro, sem selfie', 'comercial', 'outro (descrever)'] },
    ],
  },
  {
    id: 'roteamento_intencoes',
    departamento: 'sac_geral',
    titulo: 'Roteamento de assuntos para setores',
    objetivo: 'Mapa assunto → destino usando os setores REAIS da empresa (nada de setor que não existe).',
    fluxoPadrao: [
      'Para cada assunto (suporte, 2ª via, venda, cancelamento, mudança de endereço, PJ/empresarial, alteração de plano), definir: agente de IA, fila humana, ou IA primeiro e humano depois',
      'Assunto fora do escopo: informa educadamente e retoma o menu',
    ],
    decisoes: [
      { id: 'mapa_setores', pergunta: 'Liste os setores/filas que EXISTEM na empresa (ex.: existe retenção? existe comercial separado de vendas?) e o destino de cada assunto.', opcoes: ['coletar mapa assunto→setor com o cliente'] },
      { id: 'pj', pergunta: 'Cliente PJ/empresarial (inclusive órgão público): atendimento é diferente? Vai para onde?', opcoes: ['mesmo fluxo do PF', 'fila/setor específico (qual?)'] },
      { id: 'fora_escopo', pergunta: 'Assunto fora do escopo do provedor: o que fazer?', opcoes: ['recusar educadamente e reoferecer o menu', 'após 2 insistências, transferir para humano'], padrao: 'após 2 insistências, transferir para humano' },
    ],
  },
  {
    id: 'cancelamento_retencao',
    departamento: 'sac_geral',
    titulo: 'Cancelamento e retenção',
    objetivo: 'O fluxo mais sensível: o destino depende do MOTIVO do cancelamento.',
    fluxoPadrao: [
      'Cliente pede cancelamento → coleta o motivo',
      'Por motivo: lentidão/problema técnico → suporte diagnostica ANTES de qualquer oferta; preço → alternativa/desconto se houver; mudança de endereço → verificar cobertura no novo endereço',
      'Se o cliente insistir, encaminha para o setor definido com os dados coletados',
    ],
    decisoes: [
      { id: 'existe_retencao', pergunta: 'Existe setor/fila de retenção? Se não, quem recebe o cancelamento?', opcoes: ['existe retenção', 'vai para financeiro', 'vai para comercial', 'outro'] },
      { id: 'motivo_lentidao', pergunta: 'Cancelamento por lentidão/problema técnico: oferece upgrade de plano ou manda para o suporte diagnosticar primeiro?', opcoes: ['suporte diagnostica primeiro, sem oferta', 'suporte primeiro; upgrade só se o plano for abaixo de X Mega (definir X)', 'oferece upgrade direto'], padrao: 'suporte diagnostica primeiro, sem oferta' },
      { id: 'motivo_preco', pergunta: 'Cancelamento por preço: a IA pode oferecer algo (desconto, plano menor) ou só encaminha?', opcoes: ['só encaminha', 'oferece plano menor', 'oferece desconto (definir alçada)'] },
      { id: 'ponto_humano', pergunta: 'Em que ponto o cancelamento SEMPRE vai para humano?', opcoes: ['sempre, após coletar motivo', 'só se o cliente recusar as alternativas'], padrao: 'só se o cliente recusar as alternativas' },
    ],
  },
  {
    id: 'fora_horario_transferencia',
    departamento: 'sac_geral',
    titulo: 'Fora do horário e mensagens de transferência',
    objetivo: 'O que a IA diz ao transferir e fora do expediente — com horários REAIS por setor.',
    fluxoPadrao: [
      'Dentro do horário: transfere com mensagem curta ("nosso time X vai te atender em instantes")',
      'Fora do horário: informa o horário EXATO de retorno do setor e registra a solicitação',
      'Depois de transferir, a IA NÃO pede mais nada ao cliente',
    ],
    decisoes: [
      { id: 'agenda_setores', pergunta: 'Confirme a agenda real de CADA setor (a IA vai citar o horário exato de retorno) e se existe plantão.', opcoes: ['coletar agenda por setor'] },
      { id: 'msg_fora_horario', pergunta: 'Como deve ser a mensagem fora do horário? O cliente tem um texto preferido?', opcoes: ['padrão: registrar + informar horário de retorno', 'template do cliente (coletar o texto)'] },
      { id: 'pos_transferencia', pergunta: 'Confirmar: depois de transferir, a IA fica em silêncio (não pede foto, não faz pergunta)?', opcoes: ['sim, silêncio total', 'pode concluir coleta pendente antes'], padrao: 'sim, silêncio total' },
    ],
  },
  {
    id: 'encerramento_nps',
    departamento: 'sac_geral',
    titulo: 'Encerramento e pesquisa de satisfação (NPS)',
    objetivo: 'Como a conversa termina — nota, agradecimento e o que fazer com cada nota.',
    fluxoPadrao: [
      'Antes da nota: "posso ajudar em algo mais?"',
      'Pede a nota de 0 a 10',
      'Nota alta: agradece (e ação extra se o provedor quiser, ex.: link de avaliação no Google)',
      'Nota baixa: pergunta o que faltou, agradece e encaminha para o destino definido',
      'Se o cliente trouxer demanda nova durante o encerramento, atende a demanda antes de fechar',
    ],
    decisoes: [
      { id: 'nota_alta', pergunta: 'Nota alta (8-10): só agradece ou envia algo (link do Google, pedido de indicação)?', opcoes: ['só agradece', 'envia link de avaliação do Google (coletar o link)', 'pede indicação'], padrao: 'só agradece' },
      { id: 'nota_baixa', pergunta: 'Nota baixa: o motivo vai para onde?', opcoes: ['setor do assunto', 'quem realizou o atendimento', 'fila de retenção (se existir)'], padrao: 'setor do assunto' },
      { id: 'demanda_no_nps', pergunta: 'Cliente pede algo novo (ex.: "quero cancelar") durante o NPS: atende antes de fechar?', opcoes: ['sim, sempre atende/roteia a demanda nova', 'registra e fecha'], padrao: 'sim, sempre atende/roteia a demanda nova' },
    ],
  },
  {
    id: 'diagnostico_suporte',
    departamento: 'suporte',
    titulo: 'Diagnóstico de "sem internet / internet lenta"',
    objetivo: 'A sequência exata do suporte técnico — o que a IA verifica, pede e resolve antes de transferir.',
    fluxoPadrao: [
      'Identifica o contrato do atendimento',
      'Consulta o status no sistema ANTES de perguntar (proativa: "identifiquei que sua conexão está X")',
      'Verifica bloqueio financeiro (se bloqueado, explica e direciona para o financeiro)',
      'Testes guiados (reiniciar equipamento etc.)',
      'Se não resolver: coleta os detalhes e transfere com tudo nas notas',
    ],
    decisoes: [
      { id: 'status_proativo', pergunta: 'A IA consulta o status no sistema antes de perguntar e comunica o que viu?', opcoes: ['sim, proativa', 'pergunta primeiro, consulta depois'], padrao: 'sim, proativa' },
      { id: 'bloqueio_primeiro', pergunta: 'Checa bloqueio financeiro antes do diagnóstico técnico?', opcoes: ['sim', 'não'], padrao: 'sim' },
      { id: 'quando_foto', pergunta: 'Quando pedir foto do equipamento/roteador?', opcoes: ['só quando SEM conexão', 'sempre no diagnóstico', 'nunca'], padrao: 'só quando SEM conexão' },
      { id: 'reinicio_remoto', pergunta: 'Reinício remoto do equipamento: quando oferecer?', opcoes: ['sempre que disponível', 'só com conexão estável há mais de N dias (definir N)', 'não temos'], padrao: 'sempre que disponível' },
      { id: 'resolver_antes_transferir', pergunta: 'O que a IA deve tentar resolver SOZINHA antes de transferir (senha Wi-Fi, reinício, status)?', opcoes: ['tudo que tiver ferramenta', 'só consulta, sem ação', 'lista específica (coletar)'], padrao: 'tudo que tiver ferramenta' },
    ],
  },
  {
    id: 'apresentacao_planos',
    departamento: 'vendas',
    titulo: 'Apresentação de planos e preços',
    objetivo: 'Como a IA mostra os planos — nomes, preços, quantas opções e o que vai junto.',
    fluxoPadrao: [
      'Cliente pede planos → apresenta as opções com nome amigável, velocidade, preço e benefícios',
      'Recomenda um plano com base na necessidade (qualificação)',
      'Fidelidade e taxa de instalação informadas junto',
    ],
    decisoes: [
      { id: 'tabela_planos', pergunta: 'Colete a tabela EXATA: nome amigável (não o código do ERP, ex.: "Fibra 200 Mega" e não "MIG.24/200MB"), velocidade, preço exato (ou "a partir de"), benefícios inclusos (TV, apps, roteador).', opcoes: ['coletar plano a plano'] },
      { id: 'quantas_opcoes', pergunta: 'Quando o cliente pede opções: mostra 1 recomendação, 2-3 opções, ou a lista toda?', opcoes: ['1 recomendação', '2-3 opções', 'lista completa'], padrao: '2-3 opções' },
      { id: 'qual_priorizar', pergunta: 'Qual plano priorizar na recomendação?', opcoes: ['o mais barato que atende', 'o intermediário/superior (subir ticket)', 'o mais vendido'], padrao: 'o mais barato que atende' },
      { id: 'beneficios_quando', pergunta: 'Benefícios e fidelidade entram já na primeira apresentação ou só se o cliente perguntar?', opcoes: ['na primeira apresentação', 'só se perguntar'], padrao: 'na primeira apresentação' },
    ],
  },
  {
    id: 'qualificacao_pre_cadastro',
    departamento: 'vendas',
    titulo: 'Qualificação do lead e pré-cadastro',
    objetivo: 'As perguntas EXATAS que os vendedores usam hoje e os campos do pré-cadastro.',
    fluxoPadrao: [
      'Qualifica a necessidade (dispositivos, pessoas, uso)',
      'Verifica viabilidade no endereço',
      'Pré-cadastro com os dados necessários',
      'Informa o processo e prazo reais (validação → agendamento → instalação)',
    ],
    decisoes: [
      { id: 'roteiro_proprio', pergunta: 'Vocês têm um roteiro/perguntas de qualificação próprios? Peça o texto EXATO (não inventar).', opcoes: ['usar roteiro do cliente (coletar)', 'usar padrão (dispositivos, pessoas, tipo de imóvel, streaming, home office)'] },
      { id: 'campos_pre_cadastro', pergunta: 'Campos exatos do pré-cadastro (incluindo "por onde nos conheceu?" e vencimentos disponíveis)?', opcoes: ['coletar lista de campos'] },
      { id: 'processo_pos', pergunta: 'Processo e prazo REAIS pós-cadastro: quem valida, quem agenda, SLA de instalação?', opcoes: ['coletar processo'] },
    ],
  },
  {
    id: 'viabilidade_sem_cobertura',
    departamento: 'vendas',
    titulo: 'Endereço sem cobertura',
    objetivo: 'O que fazer quando a viabilidade dá negativa.',
    fluxoPadrao: [
      'Sem cobertura: agradece o interesse, registra o lead para expansão futura e pergunta se ajuda em mais algo',
    ],
    decisoes: [
      { id: 'destino_sem_cobertura', pergunta: 'Sem cobertura: encerra registrando o lead para expansão, ou transfere para alguém confirmar manualmente?', opcoes: ['registra lead e encerra', 'transfere para confirmação manual'], padrao: 'registra lead e encerra' },
    ],
  },
  {
    id: 'segunda_via_cobranca',
    departamento: 'financeiro',
    titulo: '2ª via, cobrança e cliente em dia',
    objetivo: 'Como entregar fatura e o que fazer quando NÃO há débito.',
    fluxoPadrao: [
      'Cliente pede 2ª via → localiza mensalidades pendentes',
      'Envia PIX + boleto/linha digitável',
      'Sem pendências: informa que está tudo em dia e pergunta se ajuda em mais algo (sem oferecer 2ª via de fatura paga)',
    ],
    decisoes: [
      { id: 'formato_envio', pergunta: 'Envia sempre PIX + boleto + linha digitável juntos, ou pergunta a preferência?', opcoes: ['tudo junto', 'pergunta a preferência', 'usa a preferência salva do cliente'], padrao: 'tudo junto' },
      { id: 'sem_debito', pergunta: 'Cliente em dia pede 2ª via: o que fazer?', opcoes: ['informa que está em dia e encerra', 'oferece a última fatura paga', 'pergunta a competência desejada'], padrao: 'informa que está em dia e encerra' },
      { id: 'desbloqueio', pergunta: 'Desbloqueio de confiança: a IA pode liberar sozinha? Com quais condições?', opcoes: ['sim, conforme regra do ERP', 'só humano libera', 'não oferecemos'] },
    ],
  },
];

/** Fluxos de um departamento. */
export function flowsForDepartment(departamento: string): StandardFlow[] {
  return STANDARD_FLOWS.filter((f) => f.departamento === departamento);
}

export function findFlow(flowId: string): StandardFlow | null {
  return STANDARD_FLOWS.find((f) => f.id === flowId) ?? null;
}

/** Render compacto do catálogo de um departamento para o <session_context>. */
export function renderFlowsSection(
  departamento: string,
  confirmedFlowIds: Set<string>
): string[] {
  const flows = flowsForDepartment(departamento);
  if (!flows.length) return [];
  const lines: string[] = [];
  lines.push(`### Fluxos de atendimento a montar neste departamento (confirmar com confirm_flow):`);
  for (const f of flows) {
    const status = confirmedFlowIds.has(f.id) ? 'CONFIRMADO ✓' : 'PENDENTE';
    lines.push(`- [${status}] ${f.id} — ${f.titulo}: ${f.objetivo}`);
    if (!confirmedFlowIds.has(f.id)) {
      lines.push(`  Fluxo padrão: ${f.fluxoPadrao.join(' → ')}`);
      for (const d of f.decisoes) {
        lines.push(
          `  • Decisão "${d.id}": ${d.pergunta} Opções: ${d.opcoes.join(' | ')}${d.padrao ? ` (padrão: ${d.padrao})` : ''}`
        );
      }
    }
  }
  return lines;
}
