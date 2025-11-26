import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  waitForOpenCV,
  detectDocumentEdgesFromImage,
  cropAndStraighten,
  downscaleImage,
} from '@/lib/opencv-utils';

export type ProcessingStatus = 'pending' | 'processing' | 'success' | 'error';

export interface ProcessingResult {
  fileName: string;
  status: ProcessingStatus;
  documentId?: string;
  error?: string;
  legibilityScore?: number;
}

export const useDocumentProcessor = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const processFile = async (
    file: File,
    userId: string
  ): Promise<ProcessingResult> => {
    const result: ProcessingResult = {
      fileName: file.name,
      status: 'processing',
    };

    try {
      // Convertir archivo a base64
      const base64Image = await fileToBase64(file);

      // Inicializar OpenCV
      await waitForOpenCV();

      // Cargar imagen
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
        img.src = base64Image;
      });

      // Downscale defensivo
      let workingImage = base64Image;
      if (img.width > 1920 || img.height > 1920) {
        workingImage = downscaleImage(img, 1920);
        img.src = workingImage;
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
        });
      }

      // Detectar bordes
      const detectedCorners = await detectDocumentEdgesFromImage(img);

      let finalImage = workingImage;
      let hadAutoCrop = false;

      // Recortar y enderezar si se detectaron bordes
      if (detectedCorners) {
        hadAutoCrop = true;
        try {
          finalImage = cropAndStraighten(img, detectedCorners, {
            autoEnhance: true,
            outputQuality: 0.95,
          });
        } catch (error) {
          console.warn('Error extrayendo documento, usando imagen original:', error);
          finalImage = workingImage;
          hadAutoCrop = false;
        }
      } else {
        // Downscale final
        if (img.width > 2200 || img.height > 2200) {
          finalImage = downscaleImage(img, 2200);
        }
      }

      // Validar con edge function
      const { data: validation, error: validationError } = await supabase.functions.invoke(
        'validate-document',
        {
          body: { imageData: finalImage },
        }
      );

      if (validationError) throw validationError;

      const score = validation.legibilityPercentage || 0;

      // Convertir a blob
      const response = await fetch(finalImage);
      const blob = await response.blob();

      // Upload a storage
      const fileName = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('scans')
        .upload(fileName, blob, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Guardar en BD
      const { data: document, error: dbError } = await supabase
        .from('documents')
        .insert({
          storage_path: fileName,
          uploader: userId,
          status: 'pending',
          meta: {
            validationResult: validation,
            extractedData: validation.extractedData || null,
            legibilityScore: score,
            processedAt: new Date().toISOString(),
            hadAutoCrop,
          },
        })
        .select()
        .single();

      if (dbError) throw dbError;

      result.status = 'success';
      result.documentId = document.id;
      result.legibilityScore = score;

      return result;
    } catch (error: any) {
      console.error('Error procesando archivo:', error);
      result.status = 'error';
      result.error = error.message || 'Error desconocido';
      return result;
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  return {
    processFile,
    isProcessing,
    setIsProcessing,
  };
};
