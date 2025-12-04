import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Scan from "./pages/Scan";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import SuperAdminDashboard from "./pages/SuperAdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import DocumentDetails from "./pages/DocumentDetails";
import PartsProcessor from "./pages/PartsProcessor";
import ObraManagement from "./pages/ObraManagement";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/scan" element={<Scan />} />
          <Route path="/admin/dashboard" element={<SuperAdminDashboard />} />
          <Route path="/admin/processor" element={<PartsProcessor />} />
          <Route path="/admin/document/:id" element={<DocumentDetails />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/obras" element={<ObraManagement />} />
          <Route path="/install" element={<Install />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
