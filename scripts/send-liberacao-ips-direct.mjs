// Mensagem de liberação de IPs pós-onboarding — Direct Internet (modo=completo,
// ERP=HUBSOFT, gateway=7AZ, OLT=Manager Huawei, mapas=Geogrid, rede=Aprecomm).
// Credenciais vieram completas no formulário — pedido foca em IPs + cliente de testes.

const BASE = 'https://pipeelo-evolution-api.zhh0vo.easypanel.host';
const INSTANCE = 'Avisos';
const KEY = '4F8E4FE7EFB8-49ED-8096-F859C93A0007';
const DIRECT_GROUP_JID = '120363407875649421@g.us'; // Pipeelo & Direct Internet

const text = `Próximo passo da implantação 👇

Já recebemos as credenciais do HUBSOFT, do 7AZ e dos demais sistemas pelo formulário — tudo OK do nosso lado. ✅

Antes do nosso time iniciar a integração, precisamos de duas coisas do lado de vocês:

*1.* Liberação dos seguintes IPs no *HUBSOFT* e no *7AZ* (whitelist da API):
\`154.53.42.153\`
\`3.220.83.179\`
\`35.168.169.27\`

*2.* Um *cliente de testes* no HUBSOFT com ONU configurada, contratos e mensalidades — pra validarmos consulta de fatura, confirmação de pagamento, status de conexão e geração de 2ª via direto no WhatsApp antes de subir em produção.

Assim que isso estiver pronto, me dá um retorno aqui que seguimos com a ativação. 🚀`;

const r = await fetch(`${BASE}/message/sendText/${encodeURIComponent(INSTANCE)}`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ number: DIRECT_GROUP_JID, text, delay: 1000, linkPreview: false }),
});
console.log('HTTP', r.status, r.statusText);
console.log(await r.text());
