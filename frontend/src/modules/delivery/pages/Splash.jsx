import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Truck } from "lucide-react";
import { useSettings } from "@core/context/SettingsContext";

const Splash = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";

  useEffect(() => {
    const timer = setTimeout(() => {
      navigate("/delivery/login");
    }, 2500);
    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center text-white relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />

      {/* Content */}
      <div className="z-10 flex flex-col items-center animate-fade-in-up">
        <div className="bg-white p-6 rounded-3xl shadow-xl mb-6 animate-bounce-subtle">
          <Truck size={64} className="text-primary" strokeWidth={1.5} />
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">{appName}</h1>
        <p className="text-lg font-medium opacity-90">
          Quick Commerce Delivery
        </p>
      </div>

      <div className="absolute bottom-12 text-center w-full z-10 px-6">
        <p className="text-xl font-bold mb-1">Deliver Faster.</p>
        <p className="text-xl font-bold text-white/80">Earn Better.</p>

        {/* Minimal Loading Animation */}
        <div className="mt-8 flex justify-center space-x-2">
          <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
          <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-100" />
          <div className="w-2 h-2 bg-white rounded-full animate-pulse delay-200" />
        </div>
      </div>
    </div>
  );
};

export default Splash;
