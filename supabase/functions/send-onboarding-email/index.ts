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

    // Format responses for email
    const respostasFormatadas = Object.entries(respostas)
      .map(([perguntaId, valor]) => {
        let valorFormatado = '';
        if (typeof valor === 'object' && valor !== null) {
          valorFormatado = JSON.stringify(valor, null, 2);
        } else {
          valorFormatado = String(valor);
        }
        return `<tr>
          <td style="padding: 8px; border: 1px solid #ddd; font-weight: 500;">${perguntaId}</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${valorFormatado}</td>
        </tr>`;
      })
      .join('');

    // Send email notification
    const emailResponse = await resend.emails.send({
      from: "Pipeelo Onboarding <onboarding@resend.dev>",
      to: ["onboarding@pipeelo.com"],
      subject: `✅ Onboarding ${empresaNome} - ${departamentoNome} concluído`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #1ECAA3 0%, #17a085 100%); color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 30px; }
            .info-box { background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
            .info-item { margin-bottom: 10px; }
            .info-label { font-weight: 600; color: #666; }
            .badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 600; }
            .badge-success { background: #d4edda; color: #155724; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #1ECAA3; color: white; padding: 12px 8px; text-align: left; }
            .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Departamento Concluído!</h1>
            </div>
            <div class="content">
              <div class="info-box">
                <div class="info-item">
                  <span class="info-label">Empresa:</span> ${empresaNome}
                </div>
                <div class="info-item">
                  <span class="info-label">Departamento:</span> 
                  <span class="badge badge-success">${departamentoNome}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Responsável:</span> ${responsavelNome}
                </div>
                <div class="info-item">
                  <span class="info-label">Session ID:</span> <code>${sessionId}</code>
                </div>
                <div class="info-item">
                  <span class="info-label">Data/Hora:</span> ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                </div>
              </div>
              
              <h3>📋 Respostas do Questionário:</h3>
              <table>
                <thead>
                  <tr>
                    <th>Pergunta ID</th>
                    <th>Resposta</th>
                  </tr>
                </thead>
                <tbody>
                  ${respostasFormatadas}
                </tbody>
              </table>
            </div>
            <div class="footer">
              <p>Este e-mail foi enviado automaticamente pelo sistema de onboarding Pipeelo.</p>
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
