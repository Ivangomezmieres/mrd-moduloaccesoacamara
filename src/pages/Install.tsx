import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Share, Download, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const Install = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="container mx-auto max-w-2xl">
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Instalar MRD Scanner</CardTitle>
            <CardDescription>
              Instala la aplicación en tu dispositivo para un acceso más rápido
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">En iOS (iPhone/iPad)</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Abre esta página en Safari</li>
                <li>Toca el botón de compartir <Share className="inline h-4 w-4" /></li>
                <li>Desplázate y selecciona "Añadir a pantalla de inicio"</li>
                <li>Toca "Añadir" en la esquina superior derecha</li>
              </ol>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg">En Android</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Abre el menú del navegador (⋮)</li>
                <li>Selecciona "Instalar aplicación" o "Añadir a pantalla de inicio" <Download className="inline h-4 w-4" /></li>
                <li>Confirma la instalación</li>
              </ol>
            </div>

            <div className="pt-4 border-t">
              <Button onClick={() => navigate('/')} className="w-full">
                <Home className="mr-2 h-4 w-4" />
                Volver al inicio
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Install;
