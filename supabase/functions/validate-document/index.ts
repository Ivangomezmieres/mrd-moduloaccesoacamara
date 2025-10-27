import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Prepare prompt for legibility validation (80% threshold)
    const prompt = `Analiza esta imagen de un parte de trabajo y verifica su LEGIBILIDAD.

Verifica que al menos el 80% de estos elementos sean LEGIBLES (que se puedan leer):

1. Nº de parte
2. Cliente
3. Emplazamiento
4. Obra
5. Trabajo realizado
6. Datos del montador (Nombre y Apellidos)
7. Horas trabajadas
8. Firma del Jefe de Equipo
9. Firma del Cliente/Encargado
10. Fecha

NO necesitas verificar que los datos estén completos, solo que sean LEGIBLES.

Responde en formato JSON con:
{
  "legible": boolean (true si >= 80% de campos son legibles),
  "legibilityPercentage": number (0-100),
  "illegibleFields": string[] (campos que NO se pueden leer),
  "confidence": number (0-1),
  "observations": string
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Eres un asistente especializado en verificar la LEGIBILIDAD de documentos de partes de trabajo. Solo debes verificar si los campos se pueden leer, no si están completos. Analiza con precisión y responde siempre en formato JSON.'
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.3
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse JSON response
    let validation;
    try {
      validation = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse AI response:', content);
      // Fallback: assume document is legible if AI couldn't parse
      validation = {
        legible: true,
        legibilityPercentage: 80,
        illegibleFields: [],
        confidence: 0.5,
        observations: 'No se pudo validar automáticamente'
      };
    }

    return new Response(JSON.stringify(validation), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in validate-document function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        legible: true, // Allow submission on error
        legibilityPercentage: 80,
        illegibleFields: [],
        confidence: 0,
        observations: 'Error en validación automática'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
