import jscanify from 'jscanify';

export interface DocumentCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
}

/**
 * Inicializar jscanify (espera a que OpenCV esté listo)
 * OpenCV ya se carga en index.html, jscanify lo detectará automáticamente
 */
export const initJscanify = async (): Promise<any> => {
  // Esperar a que OpenCV esté disponible
  return new Promise((resolve, reject) => {
    const checkInterval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).cv && (window as any).cv.Mat) {
        clearInterval(checkInterval);
        try {
          const scanner = new jscanify();
          resolve(scanner);
        } catch (error) {
          reject(error);
        }
      }
    }, 100);

    // Timeout después de 10 segundos
    setTimeout(() => {
      clearInterval(checkInterval);
      reject(new Error('Timeout esperando OpenCV para jscanify'));
    }, 10000);
  });
};

/**
 * Detectar bordes del documento en una imagen
 */
export const detectDocumentCorners = (
  scanner: any,
  image: HTMLImageElement | HTMLCanvasElement
): DocumentCorners | null => {
  try {
    const corners = scanner.findPaperContour(image);
    if (!corners || corners.length !== 4) return null;
    
    // Convertir formato de jscanify a nuestro formato
    return {
      topLeft: { x: corners[0].x, y: corners[0].y },
      topRight: { x: corners[1].x, y: corners[1].y },
      bottomRight: { x: corners[2].x, y: corners[2].y },
      bottomLeft: { x: corners[3].x, y: corners[3].y }
    };
  } catch (error) {
    console.error('Error detectando bordes con jscanify:', error);
    return null;
  }
};

/**
 * Extraer y enderezar documento
 */
export const extractAndStraightenDocument = (
  scanner: any,
  image: HTMLImageElement,
  outputWidth: number = 1800,
  outputHeight?: number
): string => {
  try {
    // Si no se especifica altura, calcular proporcionalmente (A4 ratio)
    const finalHeight = outputHeight || Math.round(outputWidth * 1.414);
    
    const resultCanvas = scanner.extractPaper(image, outputWidth, finalHeight);
    return resultCanvas.toDataURL('image/jpeg', 0.95);
  } catch (error) {
    console.error('Error extrayendo documento con jscanify:', error);
    throw error;
  }
};

/**
 * Highlight del documento en tiempo real para feedback visual
 */
export const highlightDocument = (
  scanner: any,
  sourceCanvas: HTMLCanvasElement,
  destinationCanvas: HTMLCanvasElement
): void => {
  try {
    scanner.highlightPaper(sourceCanvas, destinationCanvas);
  } catch (error) {
    // Silenciar errores de highlighting en tiempo real
    // (puede fallar si no se detecta documento en algunos frames)
  }
};
