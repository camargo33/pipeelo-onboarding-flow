import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookRequest {
  sessionId: string;
  testWebhookUrl?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { sessionId, testWebhookUrl }: WebhookRequest = await req.json();
    
    if (!sessionId) {
      console.error("Missing sessionId");
      return new Response(
        JSON.stringify({ error: "sessionId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing webhook for session: ${sessionId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch session data
    const { data: session, error: sessionError } = await supabase
      .from("onboarding_sessions")
      .select("*")
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.error("Session not found:", sessionError);
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify all departments are complete
    if (
      session.status_sac_geral !== "concluido" ||
      session.status_financeiro !== "concluido" ||
      session.status_suporte !== "concluido" ||
      session.status_vendas !== "concluido"
    ) {
      console.log("Not all departments are complete yet");
      return new Response(
        JSON.stringify({ message: "Not all departments are complete" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch all responses for this session
    const { data: respostas, error: respostasError } = await supabase
      .from("onboarding_respostas")
      .select("*")
      .eq("session_id", sessionId);

    if (respostasError) {
      console.error("Error fetching respostas:", respostasError);
      return new Response(
        JSON.stringify({ error: "Error fetching responses" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Helper function to expand horario_semanal into individual days
    const expandHorarioSemanal = (horario: any) => {
      if (!horario || typeof horario !== 'object') return horario;
      
      const result: Record<string, any> = {};
      
      // Expand segunda_sexta into individual weekdays
      if (horario.segunda_sexta) {
        const diasSemana = ['segunda_feira', 'terca_feira', 'quarta_feira', 'quinta_feira', 'sexta_feira'];
        for (const dia of diasSemana) {
          result[dia] = {
            inicio: horario.segunda_sexta.inicio || null,
            fim: horario.segunda_sexta.fim || null,
            nao_atende: horario.segunda_sexta.nao_atende || false,
          };
        }
      }
      
      // Add sabado
      if (horario.sabado) {
        result.sabado = {
          inicio: horario.sabado.inicio || null,
          fim: horario.sabado.fim || null,
          nao_atende: horario.sabado.nao_atende || false,
        };
      }
      
      // Add domingo (from domingo_feriado)
      if (horario.domingo_feriado) {
        result.domingo = {
          inicio: horario.domingo_feriado.inicio || null,
          fim: horario.domingo_feriado.fim || null,
          nao_atende: horario.domingo_feriado.nao_atende || false,
        };
        result.feriado = {
          inicio: horario.domingo_feriado.inicio || null,
          fim: horario.domingo_feriado.fim || null,
          nao_atende: horario.domingo_feriado.nao_atende || false,
        };
      }
      
      return result;
    };

    // Organize responses by department
    const respostasPorDepartamento: Record<string, Record<string, any>> = {
      sac_geral: {},
      financeiro: {},
      suporte: {},
      vendas: {},
    };

    for (const resposta of respostas || []) {
      if (respostasPorDepartamento[resposta.departamento]) {
        let valor = resposta.resposta;
        
        // Check if this is a horario_semanal type and expand it
        if (valor && typeof valor === 'object' && (valor.segunda_sexta || valor.sabado || valor.domingo_feriado)) {
          valor = expandHorarioSemanal(valor);
        }
        
        respostasPorDepartamento[resposta.departamento][resposta.pergunta_id] = valor;
      }
    }

    // Build the payload
    const payload = {
      session: {
        id: session.id,
        empresa_nome: session.empresa_nome,
        ceo_email: session.ceo_email,
        access_token: session.access_token,
        created_at: session.created_at,
        responsaveis: {
          sac_geral: session.responsavel_sac_geral,
          financeiro: session.responsavel_financeiro,
          suporte: session.responsavel_suporte,
          vendas: session.responsavel_vendas,
        },
        datas_conclusao: {
          sac_geral: session.concluido_sac_geral_at,
          financeiro: session.concluido_financeiro_at,
          suporte: session.concluido_suporte_at,
          vendas: session.concluido_vendas_at,
        },
      },
      respostas: respostasPorDepartamento,
    };

    console.log("Sending webhook payload:", JSON.stringify(payload, null, 2));

    // Send to external API (use testWebhookUrl for testing, otherwise use production URL)
    const targetUrl = testWebhookUrl || "http://admin.pipeelo.com/api/clients/onboarding/create";
    const apiToken = Deno.env.get("PIPEELO_ADMIN_API_TOKEN");
    
    // Only require token for production URL
    if (!testWebhookUrl && !apiToken) {
      console.error("PIPEELO_ADMIN_API_TOKEN not configured");
      return new Response(
        JSON.stringify({ error: "API token not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    
    // Add auth header only for production
    if (!testWebhookUrl && apiToken) {
      headers["Authorization"] = `Bearer ${apiToken}`;
    }

    console.log(`Sending to: ${targetUrl}`);

    const webhookResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const webhookResult = await webhookResponse.text();
    console.log(`Webhook response status: ${webhookResponse.status}`);
    console.log(`Webhook response body: ${webhookResult}`);

    if (!webhookResponse.ok) {
      console.error("Webhook failed:", webhookResult);
      return new Response(
        JSON.stringify({ 
          error: "Webhook failed", 
          status: webhookResponse.status,
          details: webhookResult 
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: "Webhook sent successfully" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-webhook-complete:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
