import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";

function App() {
  return (
    <div className="App dark min-h-screen bg-background text-foreground">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Onboarding />} />
          <Route path="/app" element={<Dashboard />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-center" theme="dark" />
    </div>
  );
}

export default App;
