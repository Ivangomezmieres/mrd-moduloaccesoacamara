import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Función de retry con exponential backoff para manejar rate limiting (429)
async function fetchWithRetry(
  url: string, 
  options: RequestInit, 
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Si es 429 (rate limit), hacer retry con backoff exponencial
      if (response.status === 429 && attempt < maxRetries) {
        const waitTime = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.warn(`⚠️ Rate limit (429) detectado. Reintentando en ${waitTime}ms... (intento ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }
      const waitTime = Math.pow(2, attempt) * 1000;
      console.warn(`⚠️ Error en petición. Reintentando en ${waitTime}ms... (intento ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
  
  throw new Error('Max retries alcanzado');
}

const extractDocumentData = async (imageBase64: string, openaiKey: string): Promise<any> => {
  try {
    console.log('🚀 Iniciando extracción de datos del documento...');
    const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 1500,
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
- Horario (horario de trabajo, ej: "7:30 a 17:30")
- Fecha del parte (formato YYYY-MM-DD)
- Firmas detectadas:
  * Firma del jefe de equipo/montador (true si hay firma visible, false si no)
  * Firma del cliente/encargado (true si hay firma visible, false si no)

═══════════════════════════════════════════════════════════════════════════════
⚠️ REGLAS CRÍTICAS PARA EXTRACCIÓN DE FECHAS MANUSCRITAS ⚠️
═══════════════════════════════════════════════════════════════════════════════

ERROR COMÚN A EVITAR: Las barras "/" manuscritas frecuentemente se confunden con el dígito "1".
Ejemplo: La fecha "3/12/2025" se lee erróneamente como "31/12/2025".

INSTRUCCIONES OBLIGATORIAS:

1. UNA FECHA SIEMPRE TIENE EXACTAMENTE DOS SEPARADORES (barras "/")
   - Estructura: DÍA / MES / AÑO
   - Los separadores pueden parecer: "/", "|", "\\", líneas inclinadas, o incluso "1" si está mal interpretado

2. REGLA DE ORO - BUSCA PRIMERO LOS DOS SEPARADORES:
   - Localiza visualmente las DOS barras separadoras en la fecha
   - Una vez identificadas, lee los dígitos ENTRE los separadores
   - El dígito "1" solo pertenece al día/mes si está CLARAMENTE separado de la barra

3. VALIDACIÓN ANTI-ERROR "1":
   - Si detectas un día de dos dígitos terminando en "1" (ej: "31", "21", "11")
   - VERIFICA: ¿Ese "1" está justo antes de una barra "/"?
   - Si SÍ → probablemente ese "1" ES la barra, no un dígito
   - Aplica la misma lógica para el mes

4. EJEMPLOS DE CORRECCIÓN:
   ❌ OCR incorrecto → ✅ Fecha correcta
   - "31/12/2025" con barras visibles entre 3, 12, 2025 → "3/12/2025"
   - "21/11/2025" con barras visibles entre 2, 1, 2025 → "2/1/2025"
   - "311122025" (sin separadores claros) → busca el patrón lógico: "3/11/2025"

5. PRIORIDADES DE INTERPRETACIÓN:
   - PRIMERO: Identifica los DOS separadores visuales
   - SEGUNDO: Lee los números ENTRE los separadores
   - TERCERO: Valida que día (1-31), mes (1-12), año (2024-2025) sean coherentes

6. VALIDACIÓN FINAL:
   - ¿El día está entre 1-31?
   - ¿El mes está entre 1-12?
   - ¿Identificaste exactamente DOS separadores?
   - Si respondiste NO a alguna → revisa la fecha nuevamente

═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
⚠️ EXTRACCIÓN DEL CAMPO O.T. (ORDEN DE TRABAJO) ⚠️
═══════════════════════════════════════════════════════════════════════════════

DEFINICIÓN: El O.T. es un número de EXACTAMENTE 5 DÍGITOS que SIEMPRE empieza por "1".
Rango válido: 10000-19999

DÓNDE BUSCARLO:
- En el campo CLIENTE (ej: "ACCIONA (11511)", "CONVIAL OT (11942)")
- En el campo EMPLAZAMIENTO
- En el campo OBRA

FORMATOS DE APARICIÓN:
1. Con prefijo "OT" o "O.T.": "OT 11942", "OT11942", "OT (11942)", "OT(11942)", "O.T. 11942"
2. Entre paréntesis: "(11511)", "( 11511 )"
3. Solo el número: "11942" (menos común)

REGLAS DE EXTRACCIÓN:
1. Busca un patrón de 5 dígitos que empiece por "1" (regex: 1\d{4})
2. Puede estar precedido por "OT" o "O.T." (con o sin espacio)
3. Puede estar entre paréntesis
4. Extrae SOLO el número de 5 dígitos, sin letras, paréntesis ni espacios
5. Si no encuentras ningún O.T. válido, devuelve null

EJEMPLOS:
- "CONSTRUCCIA OT (11932)" → ordenTrabajo: "11932"
- "ACCIONA (11511)" → ordenTrabajo: "11511"
- "CONVIAL OT 11942" → ordenTrabajo: "11942"
- "CLIENTE XYZ" (sin O.T.) → ordenTrabajo: null

═══════════════════════════════════════════════════════════════════════════════

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
  "ordenTrabajo": "string de 5 dígitos (1XXXX) o null",
  "trabajoRealizado": "string o null",
  "horario": "string o null",
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
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI extraction error:', response.status, errorText);
      
      // Proporcionar mensaje de error más descriptivo
      if (response.status === 429) {
        throw new Error('OpenAI rate limit alcanzado. Por favor, espera unos minutos e intenta de nuevo.');
      } else if (response.status === 401) {
        throw new Error('API key de OpenAI inválida o expirada.');
      } else if (response.status === 500 || response.status === 503) {
        throw new Error('Servicio de OpenAI temporalmente no disponible. Intenta de nuevo en unos momentos.');
      }
      
      throw new Error(`Error de OpenAI API (${response.status}): ${errorText.substring(0, 200)}`);
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
      
      // Normalizar campos de cabecera: convertir strings vacíos a null
      const headerFields = ['parteNumero', 'cliente', 'emplazamiento', 'obra', 'trabajoRealizado', 'horario', 'fecha'];
      headerFields.forEach(field => {
        if (parsed[field] === '') {
          parsed[field] = null;
        }
      });

      // Verificar si faltan campos críticos de cabecera
      const missingCriticalFields = [
        !parsed.parteNumero,
        !parsed.cliente,
        !parsed.fecha
      ].filter(Boolean).length;

      const missingHeaderFields = headerFields.filter(field => !parsed[field]).length;

      // Si faltan campos críticos O más de 2 campos de cabecera, intentar segunda extracción
      if (missingCriticalFields > 0 || missingHeaderFields >= 2) {
        console.log(`\n⚠️ Faltan ${missingHeaderFields} campos de cabecera. Intentando extracción específica...`);
        
        const headerData = await extractHeaderOnly(imageBase64, openaiKey);
        if (headerData) {
          // Fusionar datos: completar solo los campos null con los del segundo intento
          headerFields.forEach(field => {
            if (!parsed[field] && headerData[field]) {
              parsed[field] = headerData[field];
            }
          });
          
          // Fusionar firmas si existen
          if (!parsed.firmas && headerData.firmas) {
            parsed.firmas = headerData.firmas;
          } else if (headerData.firmas) {
            parsed.firmas = {
              montador: parsed.firmas?.montador ?? headerData.firmas.montador,
              cliente: parsed.firmas?.cliente ?? headerData.firmas.cliente
            };
          }
        }
      }
      
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
      
      // Logging de cabecera final
      console.log('\n📋 Cabecera final:');
      console.log(`  Parte Nº: ${parsed.parteNumero || 'N/A'}`);
      console.log(`  Cliente: ${parsed.cliente || 'N/A'}`);
      console.log(`  Emplazamiento: ${parsed.emplazamiento || 'N/A'}`);
      console.log(`  Obra: ${parsed.obra || 'N/A'}`);
      console.log(`  Trabajo: ${parsed.trabajoRealizado || 'N/A'}`);
      console.log(`  Fecha: ${parsed.fecha || 'N/A'}`);
      console.log(`  Firmas: Montador=${parsed.firmas?.montador}, Cliente=${parsed.firmas?.cliente}`);
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

// Función para extraer solo datos de cabecera (segundo intento)
async function extractHeaderOnly(imageBase64: string, openaiKey: string) {
  try {
    console.log('🔄 Iniciando extracción de cabecera (segundo intento)...');
    const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        temperature: 0.1,
        max_tokens: 600,
        messages: [
          {
            role: 'system',
            content: 'Extrae únicamente los datos de cabecera del documento. Responde SOLO con JSON válido.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extrae únicamente estos campos:
- parteNumero: Número del parte
- cliente: Nombre del cliente
- emplazamiento: Ubicación/emplazamiento
- obra: Nombre de la obra
- trabajoRealizado: Descripción del trabajo
- horario: Horario de trabajo (ej: "7:30 a 17:30")
- fecha: Fecha en formato YYYY-MM-DD
- firmas: { montador: boolean, cliente: boolean }

⚠️ REGLA CRÍTICA PARA FECHAS:
Las barras "/" manuscritas se confunden con el dígito "1".
- Busca PRIMERO los DOS separadores "/" en la fecha
- Lee los dígitos ENTRE los separadores, no los confundas con las barras
- Ejemplo: si ves "31/12/2025" pero hay barra visible entre 3 y 12 → es "3/12/2025"
- El "1" antes de "/" generalmente ES la barra, no un dígito

Responde SOLO con JSON válido, sin explicaciones.`
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error en extracción de cabecera:', response.status, errorText);
      
      if (response.status === 429) {
        console.error('⚠️ Rate limit alcanzado en extracción de cabecera');
      }
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('No se recibió contenido en extracción de cabecera');
      return null;
    }

    // Limpiar markdown
    let jsonText = content.trim();
    if (jsonText.startsWith('```')) {
      const match = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      jsonText = match ? match[1] : jsonText;
    }
    const cleanMatch = jsonText.match(/\{[\s\S]*\}/);
    jsonText = cleanMatch ? cleanMatch[0] : jsonText;

    const parsed = JSON.parse(jsonText);
    console.log('✅ Cabecera extraída en segundo intento:', parsed);
    return parsed;
  } catch (error) {
    console.error('Error en extractHeaderOnly:', error);
    return null;
  }
}

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

  console.log('🔍 Iniciando validación de legibilidad...');
  const response = await fetchWithRetry('https://api.openai.com/v1/chat/completions', {
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
    console.error('❌ OpenAI legibility validation error:', response.status, errorText);
    
    if (response.status === 429) {
      throw new Error('OpenAI rate limit alcanzado durante validación de legibilidad.');
    }
    throw new Error(`Error de validación de legibilidad (${response.status}): ${errorText.substring(0, 200)}`);
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
    
    const legibilityPercentage = legibilityResult.legibilityPercentage || 0;
    console.log(`📊 Legibilidad detectada: ${legibilityPercentage}%`);
    console.log('Legibility result:', legibilityResult);

    // PASO 2: Extraer datos estructurados SOLO si legibilidad >= 80%
    let extractedData = null;
    
    if (legibilityPercentage >= 80) {
      console.log('✅ Legibilidad suficiente (≥80%), extrayendo datos del documento...');
      extractedData = await extractDocumentData(imageData, OPENAI_API_KEY);
      
      if (extractedData) {
        console.log('✅ Extracción de datos completada correctamente');
        console.log('📋 Datos extraídos:', JSON.stringify({
          parteNumero: extractedData.parteNumero,
          cliente: extractedData.cliente,
          montadores: extractedData.montadores?.length || 0,
          fecha: extractedData.fecha
        }));
      } else {
        console.warn('⚠️ Extracción de datos falló (OpenAI no devolvió datos válidos)');
      }
    } else {
      console.warn(`⚠️ Legibilidad insuficiente (${legibilityPercentage}% < 80%), NO se extraerán datos`);
      console.warn('   El documento debe ser capturado nuevamente con mejor calidad');
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
    console.error('❌ Error in validate-document function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Determinar si es un error de rate limit
    const isRateLimit = errorMessage.includes('rate limit') || errorMessage.includes('429');
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        legible: true,
        legibilityPercentage: 80,
        illegibleFields: [],
        confidence: 0,
        observations: isRateLimit 
          ? 'Límite de solicitudes alcanzado. Por favor, espera unos minutos e intenta de nuevo.'
          : 'Error en validación automática',
        extractedData: null
      }),
      {
        status: isRateLimit ? 429 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});