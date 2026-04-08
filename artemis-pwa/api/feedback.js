// api/feedback.js — Vercel Serverless Function
// Proxy para a Anthropic API (mantém a API key segura no servidor)
// Configurar: ANTHROPIC_API_KEY nas Environment Variables do Vercel

export default async function handler(req, res) {
    // Apenas POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verificar API key
    if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada nas variáveis de ambiente do Vercel.' });
    }

    const { registro } = req.body;
    if (!registro) {
        return res.status(400).json({ error: 'Dados do registro ausentes.' });
    }

    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 900,
                system: `Você é o sistema Artemis — um sistema cognitivo multi-agente para análise de vendas de rua no Brasil (brigadeiros, brownies, bolos, sacolés, bebidas). A vendedora sai às ruas com um isopor e vende por 1-2h por dia.

Gere feedback preciso e personalizado de 3 agentes distintos em português brasileiro informal, baseado nos dados reais do registro de vendas fornecido. Seja específico com os números.

Retorne APENAS um JSON válido com esta estrutura:
{
  "imperius": "análise estratégica com dados específicos em 2-3 frases",
  "markus": "feedback tático operacional para amanhã em 2-3 frases",
  "phil": "suporte empático e motivacional em 2-3 frases"
}

Personalidades dos agentes:
- IMPERIUS: analista estratégico, usa os números reais do registro, identifica padrões, tom direto e analítico.
- MARKUS: executor tático, propõe ações específicas e concretas para o próximo dia, tom assertivo e prático.
- PHIL: empático e caloroso, foca na energia, celebra vitórias reais (mesmo pequenas), reconhece dificuldades sem dramatizar.

Não inclua markdown, backticks, nem nenhum texto fora do JSON.`,
                messages: [
                    {
                        role: 'user',
                        content: `Dados do registro de hoje:\n${JSON.stringify(registro, null, 2)}`
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.text();
            console.error('Anthropic API error:', errorData);
            return res.status(502).json({ error: 'Erro na API Anthropic', detail: errorData });
        }

        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';

        let feedback;
        try {
            feedback = JSON.parse(text.trim());
        } catch {
            console.error('JSON parse error from model:', text);
            return res.status(500).json({ error: 'Resposta inválida do modelo' });
        }

        return res.status(200).json(feedback);

    } catch (error) {
        console.error('Handler error:', error);
        return res.status(500).json({ error: 'Erro interno no servidor' });
    }
}