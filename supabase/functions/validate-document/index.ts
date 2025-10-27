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
    const { imageData, metadata } = await req.json();
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');

    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    // Prepare prompt for document validation
    const prompt = `Analiza esta imagen de un parte de trabajo y verifica que contenga los siguientes elementos obligatorios:

1. Nº de parte
2. Cliente
3. Emplazamiento
4. Obra
5. Trabajo realizado
6. Datos del montador (Nombre y Apellidos, horas)
7. Firma del Jefe de Equipo de Montaje
8. Firma Vº Bº del Cliente / Encargado de control
9. Fecha

Metadatos proporcionados por el usuario:
- Nº de parte: ${metadata.parteNumero}
- Cliente: ${metadata.cliente}
- Emplazamiento: ${metadata.emplazamiento}
- Obra: ${metadata.obra}
- Trabajo realizado: ${metadata.trabajoRealizado}
- Montador: ${metadata.montadorNombre}
- Fecha: ${metadata.fecha}

Verifica que:
1. El documento sea legible
2. Contenga todas las firmas necesarias
3. Los datos del formulario coincidan con lo visible en la imagen
4. No falte ningún campo obligatorio

Responde en formato JSON con:
{
  "complete": boolean,
  "missingFields": string[],
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
            content: 'Eres un asistente especializado en validar documentos de partes de trabajo. Analiza con precisión y responde siempre en formato JSON.'
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
      // Fallback: assume document is complete if AI couldn't parse
      validation = {
        complete: true,
        missingFields: [],
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
        complete: true, // Allow submission on error
        missingFields: [],
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
