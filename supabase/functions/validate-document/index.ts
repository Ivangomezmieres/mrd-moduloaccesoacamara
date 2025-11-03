import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const extractDocumentData = async (imageBase64: string, openaiKey: string): Promise<any> => {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Eres un experto en extracción de datos de partes de trabajo de montadores.

Extrae TODOS los siguientes campos del documento de manera PRECISA:

CAMPOS OBLIGATORIOS:
- Nº de parte (número identificador del parte)
- Cliente (nombre de la empresa cliente)
- Emplazamiento (ubicación física del trabajo)
- Obra (nombre del proyecto/obra)
- Trabajo realizado (descripción detallada de las tareas)
- Montadores: Array con TODOS los montadores listados en la tabla "DATOS MONTADOR"
  * nombreCompleto: nombre y apellidos completos del montador
  * horasActivas: { normales: número, extras: número }
  * horasViaje: { normales: número, extras: número }
- Horas totales del parte:
  * Ordinarias: suma de TODAS las horas NORMALES (activas normales + viaje normales)
  * Extras: suma de TODAS las horas EXTRAS (activas extras + viaje extras)
  * Festivas: horas en festivos totales
- Fecha del parte (formato YYYY-MM-DD)
- Firmas detectadas:
  * Firma del jefe de equipo/montador (true/false)
  * Firma del cliente/encargado (true/false)

IMPORTANTE SOBRE TIPOS DE HORAS:
En la tabla "DATOS MONTADOR" busca estas columnas con ATENCIÓN:
- "H. ACTIVAS" o "H. ACT.": horas de trabajo activo
- "H. VIAJE" o "H. V.": horas de viaje/desplazamiento
- Columnas con encabezados "N" (Normal) o "EX" (Extra): indican el tipo de hora

REGLAS DE INTERPRETACIÓN DE HORAS:
1. Si hay columnas separadas "N" y "EX" bajo "H. ACTIVAS":
   - Valor en columna "N" = horasActivas.normales
   - Valor en columna "EX" = horasActivas.extras

2. Si hay columnas separadas "N" y "EX" bajo "H. VIAJE":
   - Valor en columna "N" = horasViaje.normales
   - Valor en columna "EX" = horasViaje.extras

3. Si SOLO hay una columna de horas SIN indicación de tipo:
   - Asume que son horas activas normales

4. Si la tabla tiene estructura diferente, interpreta inteligentemente:
   - Busca palabras clave: "normal", "ordinaria", "extra", "viaje", "desplazamiento"
   - Si dice "extras" claramente, clasifícalas como extras
   - Si no hay indicación, asume normales

IMPORTANTE SOBRE MONTADORES:
- Extrae TODOS los montadores que aparezcan en la tabla "DATOS MONTADOR"
- Si hay 5 montadores, debes listar los 5
- Si un montador no tiene horas en alguna categoría, usa 0
- Asegúrate de que la suma de todos los montadores coincida con el total del parte

IMPORTANTE SOBRE TOTALES:
- horasTotales.ordinarias = suma de (horasActivas.normales + horasViaje.normales) de TODOS los montadores
- horasTotales.extras = suma de (horasActivas.extras + horasViaje.extras) de TODOS los montadores
- Verifica que los totales coincidan con los indicados en el documento

IMPORTANTE GENERAL:
- Si un campo está vacío, ilegible o no existe, usar null (excepto números: usar 0)
- Las horas deben ser números, no texto
- La fecha debe estar en formato ISO (YYYY-MM-DD)
- Las firmas son booleanos: true si hay firma visible, false si no

Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:

{
  "parteNumero": "string o null",
  "cliente": "string o null",
  "emplazamiento": "string o null",
  "obra": "string o null",
  "trabajoRealizado": "string o null",
  "montadores": [
    {
      "nombreCompleto": "string",
      "horasActivas": {
        "normales": 0,
        "extras": 0
      },
      "horasViaje": {
        "normales": 0,
        "extras": 0
      }
    }
  ],
  "horasTotales": {
    "ordinarias": 0,
    "extras": 0,
    "festivas": 0
  },
  "desgloseDetallado": {
    "activasNormales": 0,
    "activasExtras": 0,
    "viajeNormales": 0,
    "viajeExtras": 0
  },
  "fecha": "YYYY-MM-DD o null",
  "firmas": {
    "montador": false,
    "cliente": false
  }
}

NO incluyas texto adicional, SOLO el JSON.`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extrae todos los datos estructurados de este parte de trabajo:'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageBase64
                }
              }
            ]
          }
        ],
        max_tokens: 1500,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI extraction error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const extractedText = data.choices[0]?.message?.content;
    
    if (!extractedText) {
      console.error('No content in OpenAI response');
      return null;
    }

    // Limpiar posibles markdown o texto adicional
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : extractedText;
    
    try {
      const parsed = JSON.parse(jsonText);
      console.log('Successfully extracted data:', parsed);
      return parsed;
    } catch (parseError) {
      console.error('Error parsing extracted data:', parseError);
      console.error('Raw extracted text:', extractedText);
      return null;
    }
  } catch (error) {
    console.error('Error in extractDocumentData:', error);
    return null;
  }
};

const validateLegibility = async (imageData: string, openaiKey: string) => {
  const prompt = `Analiza esta imagen de un parte de trabajo y verifica su LEGIBILIDAD.

Verifica que al menos el 80% de estos elementos sean LEGIBLES (que se puedan leer):

1. Nº de parte
2. Cliente
3. Emplazamiento
4. Obra
5. Trabajo realizado
6. Datos de los montadores (Nombres y horas)
7. Horas trabajadas totales
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
      'Authorization': `Bearer ${openaiKey}`,
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
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Failed to parse AI response:', content);
    // Fallback: assume document is legible if AI couldn't parse
    return {
      legible: true,
      legibilityPercentage: 80,
      illegibleFields: [],
      confidence: 0.5,
      observations: 'No se pudo validar automáticamente'
    };
  }
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData } = await req.json();

    if (!imageData) {
      throw new Error('No image data provided');
    }

    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    console.log('Starting document validation and extraction...');

    // PASO 1: Validar legibilidad
    const legibilityResult = await validateLegibility(imageData, OPENAI_API_KEY);
    
    console.log('Legibility result:', legibilityResult);

    // PASO 2: Si es legible (>= 80%), extraer datos estructurados
    let extractedData = null;
    
    if (legibilityResult.legible && legibilityResult.legibilityPercentage >= 80) {
      console.log('Document is legible, proceeding with data extraction...');
      extractedData = await extractDocumentData(imageData, OPENAI_API_KEY);
      
      if (extractedData) {
        console.log('Data extraction successful');
      } else {
        console.warn('Data extraction failed, but document is still legible');
      }
    } else {
      console.log('Document not legible enough for data extraction');
    }

    // Respuesta con ambos resultados
    return new Response(
      JSON.stringify({
        legible: legibilityResult.legible,
        legibilityPercentage: legibilityResult.legibilityPercentage,
        illegibleFields: legibilityResult.illegibleFields || [],
        confidence: legibilityResult.confidence || 'medium',
        observations: legibilityResult.observations || '',
        extractedData: extractedData
      }),
      { 
        headers: { 
          ...corsHeaders,
          'Content-Type': 'application/json' 
        } 
      }
    );

  } catch (error) {
    console.error('Error in validate-document function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        legible: true,
        legibilityPercentage: 80,
        illegibleFields: [],
        confidence: 0,
        observations: 'Error en validación automática',
        extractedData: null
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});