import { useState, useEffect, useCallback } from 'react';

export const useCamera = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const constraints = {
        video: {
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setIsLoading(false);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('No se pudo acceder a la cámara. Por favor, verifica los permisos.');
      setIsLoading(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  return {
    stream,
    error,
    isLoading,
    startCamera,
    stopCamera
  };
};
