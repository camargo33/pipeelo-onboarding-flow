// Mensagem de liberação de IPs pós-onboarding — Toledo Fibra (modo=completo,
// ERP=IXC, gateway=boleto próprio, sem OLT). Credenciais do IXC já vieram no
// formulário (URL + token) — pedido foca em IPs + cliente de testes.

const BASE = 'https://pipeelo-evolution-api.zhh0vo.easypanel.host';
const INSTANCE = 'Avisos';
const KEY = '4F8E4FE7EFB8-49ED-8096-F859C93A0007';
const TOLEDO_GROUP_JID = '120363409637695326@g.us'; // Pipeelo & Toledo Fibra (TO)

const text = `Próximo passo da implantação 👇

Já recebemos a URL e o token da API do IXC pelo formulário — credenciais OK do nosso lado. ✅

Antes do nosso time iniciar a integração, precisamos de duas coisas do lado de vocês:

*1.* Liberação dos seguintes IPs dentro do IXC (whitelist da API):
\`154.53.42.153\`
\`3.220.83.179\`
\`35.168.169.27\`

*2.* Um *cliente de testes* no IXC com ONU configurada, contratos e mensalidades — pra validarmos consulta de fatura, status de conexão e geração de 2ª via direto no WhatsApp antes de subir em produção.

Assim que isso estiver pronto, me dá um retorno aqui que seguimos com a ativação. 🚀`;

const r = await fetch(`${BASE}/message/sendText/${encodeURIComponent(INSTANCE)}`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ number: TOLEDO_GROUP_JID, text, delay: 1000, linkPreview: false }),
});
console.log('HTTP', r.status, r.statusText);
console.log(await r.text());
