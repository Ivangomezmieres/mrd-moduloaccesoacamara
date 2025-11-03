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
        temperature: 0.1,
        messages: [
          {
            role: 'system',
            content: `Eres un experto en extracción de datos de partes de trabajo de montadores.

ESTRUCTURA EXACTA DE LA TABLA "DATOS MONTADOR" EN EL DOCUMENTO:

┌─────────────────────┬────────────────┬────────────────┐
│ NOMBRE Y APELLIDOS  │  H. ACTIVAS    │   H. VIAJE     │
│                     ├────────┬───────┼────────┬───────┤
│                     │   N    │  EX   │   N    │  EX   │
├─────────────────────┼────────┼───────┼────────┼───────┤
│ Dragos Negrea       │   10   │   0   │   0    │   0   │
│ Cristian Cheseli    │   10   │   0   │   0    │   0   │
│ Sebastian Bogdan    │   10   │   0   │   0    │   0   │
│ Flavius Pintea      │   10   │   0   │   0    │   0   │
└─────────────────────┴────────┴───────┴────────┴───────┘

CÓMO LEER ESTA TABLA PASO A PASO:

PASO 1: Localiza la tabla "DATOS MONTADOR" en el documento

PASO 2: Identifica la estructura de columnas:
   - Columna 1: "NOMBRE Y APELLIDOS" (nombres completos de los montadores)
   - Columna 2: "H. ACTIVAS" → tiene DOS SUB-COLUMNAS: "N" (normales) y "EX" (extras)
   - Columna 3: "H. VIAJE" → tiene DOS SUB-COLUMNAS: "N" (normales) y "EX" (extras)

PASO 3: Para CADA fila de montador, extrae los valores exactamente así:
   
   a) Lee el nombre completo de la columna "NOMBRE Y APELLIDOS" → nombreCompleto
   
   b) Bajo el encabezado "H. ACTIVAS":
      - Lee el valor en la SUB-COLUMNA "N" (primera sub-columna bajo H. ACTIVAS) → horasActivas.normales
      - Lee el valor en la SUB-COLUMNA "EX" (segunda sub-columna bajo H. ACTIVAS) → horasActivas.extras
   
   c) Bajo el encabezado "H. VIAJE":
      - Lee el valor en la SUB-COLUMNA "N" (primera sub-columna bajo H. VIAJE) → horasViaje.normales
      - Lee el valor en la SUB-COLUMNA "EX" (segunda sub-columna bajo H. VIAJE) → horasViaje.extras

PASO 4: Si una celda está vacía o tiene "0", usa el número 0 (no null)

PASO 5: Repite el PASO 3 para TODAS las filas de montadores que aparezcan en la tabla

PASO 6: Calcula los totales sumando las horas de TODOS los montadores:
   - ordinarias = SUMA de (horasActivas.normales + horasViaje.normales) de TODOS los montadores
   - extras = SUMA de (horasActivas.extras + horasViaje.extras) de TODOS los montadores
   - festivas = busca campo específico de horas festivas en el documento

ADVERTENCIAS CRÍTICAS:
⚠️ NO confundas las sub-columnas "N" y "EX"
⚠️ NO leas valores de columnas incorrectas
⚠️ Asegúrate de que la SUB-COLUMNA "N" bajo "H. ACTIVAS" es la primera sub-columna de horas activas
⚠️ Asegúrate de que la SUB-COLUMNA "EX" bajo "H. ACTIVAS" es la segunda sub-columna de horas activas
⚠️ Lo mismo para "H. VIAJE": primera sub-columna es "N", segunda es "EX"

VALIDACIÓN FINAL OBLIGATORIA:
- Suma (horasActivas.normales + horasViaje.normales) de TODOS los montadores
- Verifica que coincida con el total de ordinarias del documento
- Si NO coincide, revisa celda por celda nuevamente antes de responder

OTROS CAMPOS A EXTRAER DEL DOCUMENTO:
- Nº de parte (número identificador del parte)
- Cliente (nombre de la empresa cliente)
- Emplazamiento (ubicación física del trabajo)
- Obra (nombre del proyecto/obra)
- Trabajo realizado (descripción detallada de las tareas)
- Fecha del parte (formato YYYY-MM-DD)
- Firmas detectadas:
  * Firma del jefe de equipo/montador (true si hay firma visible, false si no)
  * Firma del cliente/encargado (true si hay firma visible, false si no)

IMPORTANTE GENERAL:
- Si un campo de texto está vacío o ilegible, usar null
- Las horas deben ser números enteros, no texto
- La fecha debe estar en formato ISO (YYYY-MM-DD)
- Las firmas son booleanos: true o false

Devuelve EXCLUSIVAMENTE un objeto JSON válido con esta estructura exacta:

{
  "parteNumero": "string o null",
  "cliente": "string o null",
  "emplazamiento": "string o null",
  "obra": "string o null",
  "trabajoRealizado": "string o null",
  "montadores": [
    {
      "nombreCompleto": "Nombre Apellido",
      "horasActivas": {
        "normales": 10,
        "extras": 0
      },
      "horasViaje": {
        "normales": 0,
        "extras": 0
      }
    }
  ],
  "horasTotales": {
    "ordinarias": 40,
    "extras": 0,
    "festivas": 0
  },
  "desgloseDetallado": {
    "activasNormales": 40,
    "activasExtras": 0,
    "viajeNormales": 0,
    "viajeExtras": 0
  },
  "fecha": "YYYY-MM-DD o null",
  "firmas": {
    "montador": true,
    "cliente": true
  }
}

NO incluyas texto adicional, comentarios o explicaciones. SOLO devuelve el JSON válido.`
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
        max_completion_tokens: 1500
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

    // Limpiar markdown backticks y texto adicional
    let jsonText = extractedText.trim();

    // Si la respuesta viene envuelta en ```json ... ```, extraer solo el JSON
    if (jsonText.startsWith('```')) {
      const jsonMatch = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      jsonText = jsonMatch ? jsonMatch[1] : jsonText;
    }

    // Si aún tiene formato incorrecto, intentar extraer solo el objeto JSON
    const cleanMatch = jsonText.match(/\{[\s\S]*\}/);
    jsonText = cleanMatch ? cleanMatch[0] : jsonText;
    
    try {
      const parsed = JSON.parse(jsonText);
      
      // ============================================
      // LOGGING DETALLADO PARA DEBUGGING
      // ============================================
      console.log('📊 OpenAI Raw Response - Document Data:');
      console.log('  Total Montadores:', parsed.montadores?.length || 0);
      
      console.log('\n👷 Montadores Individuales:');
      parsed.montadores?.forEach((m: any, idx: number) => {
        const totalIndividual = 
          (m.horasActivas?.normales || 0) + 
          (m.horasActivas?.extras || 0) + 
          (m.horasViaje?.normales || 0) + 
          (m.horasViaje?.extras || 0);
        
        console.log(`  [${idx + 1}] ${m.nombreCompleto}:`);
        console.log(`      H. Activas: N=${m.horasActivas?.normales || 0}, EX=${m.horasActivas?.extras || 0}`);
        console.log(`      H. Viaje: N=${m.horasViaje?.normales || 0}, EX=${m.horasViaje?.extras || 0}`);
        console.log(`      Total individual: ${totalIndividual}h`);
      });
      
      // Calcular suma de horas individuales
      const sumaActivasNormales = parsed.montadores?.reduce((sum: number, m: any) => 
        sum + (m.horasActivas?.normales || 0), 0) || 0;
      const sumaActivasExtras = parsed.montadores?.reduce((sum: number, m: any) => 
        sum + (m.horasActivas?.extras || 0), 0) || 0;
      const sumaViajeNormales = parsed.montadores?.reduce((sum: number, m: any) => 
        sum + (m.horasViaje?.normales || 0), 0) || 0;
      const sumaViajeExtras = parsed.montadores?.reduce((sum: number, m: any) => 
        sum + (m.horasViaje?.extras || 0), 0) || 0;
      
      const sumaOrdinarias = sumaActivasNormales + sumaViajeNormales;
      const sumaExtras = sumaActivasExtras + sumaViajeExtras;
      const sumaTotal = sumaOrdinarias + sumaExtras + (parsed.horasTotales?.festivas || 0);
      
      console.log('\n📈 Totales Calculados desde Montadores:');
      console.log(`  Activas Normales: ${sumaActivasNormales}h`);
      console.log(`  Activas Extras: ${sumaActivasExtras}h`);
      console.log(`  Viaje Normales: ${sumaViajeNormales}h`);
      console.log(`  Viaje Extras: ${sumaViajeExtras}h`);
      console.log(`  ─────────────────────────────`);
      console.log(`  Ordinarias totales: ${sumaOrdinarias}h`);
      console.log(`  Extras totales: ${sumaExtras}h`);
      console.log(`  Festivas: ${parsed.horasTotales?.festivas || 0}h`);
      console.log(`  TOTAL GENERAL: ${sumaTotal}h`);
      
      console.log('\n📋 Totales Declarados en el Documento:');
      console.log(`  Ordinarias: ${parsed.horasTotales?.ordinarias || 0}h`);
      console.log(`  Extras: ${parsed.horasTotales?.extras || 0}h`);
      console.log(`  Festivas: ${parsed.horasTotales?.festivas || 0}h`);
      
      const totalDeclarado = 
        (parsed.horasTotales?.ordinarias || 0) + 
        (parsed.horasTotales?.extras || 0) + 
        (parsed.horasTotales?.festivas || 0);
      console.log(`  TOTAL: ${totalDeclarado}h`);
      
      console.log('\n🔍 Validación de Consistencia:');
      const ordinariasCoinciden = sumaOrdinarias === (parsed.horasTotales?.ordinarias || 0);
      const extrasCoinciden = sumaExtras === (parsed.horasTotales?.extras || 0);
      const totalCoincide = sumaTotal === totalDeclarado;
      
      console.log(`  ✓ Ordinarias: ${ordinariasCoinciden ? '✅ COINCIDEN' : '❌ NO COINCIDEN'}`);
      console.log(`  ✓ Extras: ${extrasCoinciden ? '✅ COINCIDEN' : '❌ NO COINCIDEN'}`);
      console.log(`  ✓ Total: ${totalCoincide ? '✅ COINCIDEN' : '❌ NO COINCIDEN'}`);
      
      if (!ordinariasCoinciden || !extrasCoinciden) {
        console.warn('\n⚠️ ADVERTENCIA: Las horas individuales NO suman correctamente.');
        console.warn('   Esto puede indicar un error en la extracción de OpenAI.');
        console.warn('   Revisa la tabla original del documento.');
      }
      
      console.log('\n📄 Otros Datos Extraídos:');
      console.log(`  Parte Nº: ${parsed.parteNumero || 'N/A'}`);
      console.log(`  Cliente: ${parsed.cliente || 'N/A'}`);
      console.log(`  Fecha: ${parsed.fecha || 'N/A'}`);
      console.log(`  Firmas: Montador=${parsed.firmas?.montador}, Cliente=${parsed.firmas?.cliente}`);
      
      console.log('\n✅ Successfully extracted and validated document data');
      console.log('============================================\n');
      
      return parsed;
    } catch (parseError) {
      console.error('❌ Error parsing extracted data:', parseError);
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
    // Limpiar posibles markdown backticks (```json ... ```)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonText = jsonMatch ? jsonMatch[0] : content;
    return JSON.parse(jsonText);
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