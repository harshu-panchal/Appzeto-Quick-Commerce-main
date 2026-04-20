import React from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Navigation as NavIcon,
  Phone,
  AlertTriangle,
  User,
  MapPin,
  LocateFixed,
} from "lucide-react";

const Navigation = () => {
  const navigate = useNavigate();

  return (
    <div className="relative h-screen w-full bg-gray-200 overflow-hidden">
      {/* Map Placeholder */}
      <div className="absolute inset-0 bg-gray-300 flex items-center justify-center">
        {/* Simulated Map Background - In a real app, this would be Google Maps / Mapbox */}
        <div className="w-full h-full bg-gray-200 bg-[url('https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/77.5946,12.9716,13,0/600x800?access_token=pk.eyJ1IjoiZGVtb25zdHJhdGlvbiIsImEiOiJjazVwZ21rZ3MwYnZzM210ZnJ0bmR3djJqIn0.MbT-XXXXXX')] bg-cover bg-center opacity-50 grayscale-[0.2]"></div>

        {/* Route Line Simulation */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 10 }}>
          <path
            d="M180 600 Q 250 450 200 300 T 180 150"
            stroke="#3b82f6"
            strokeWidth="6"
            fill="none"
            strokeDasharray="10,5"
            className="animate-pulse"
          />
          <circle
            cx="180"
            cy="600"
            r="12"
            fill="#3b82f6"
            stroke="white"
            strokeWidth="3"
            className="animate-ping"
          />
          <circle
            cx="180"
            cy="150"
            r="12"
            fill="#ef4444"
            stroke="white"
            strokeWidth="3"
          />
        </svg>
      </div>

      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-12 flex justify-between items-start bg-gradient-to-b from-black/50 to-transparent z-20 pointer-events-none">
        <button
          onClick={() => navigate(-1)}
          className="bg-white text-gray-800 p-3 rounded-full shadow-lg pointer-events-auto hover:bg-gray-100 active:scale-95 transition-transform">
          <ArrowLeft size={24} />
        </button>

        <div className="bg-black/70 text-white px-4 py-2 rounded-full backdrop-blur-md shadow-lg flex items-center space-x-3 pointer-events-auto">
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium text-gray-300">Distance</span>
            <span className="font-bold text-lg">1.2 km</span>
          </div>
          <div className="w-px h-8 bg-gray-500"></div>
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium text-gray-300">ETA</span>
            <span className="font-bold text-lg text-brand-400">4 min</span>
          </div>
        </div>

        <button className="bg-red-600 text-white p-3 rounded-full shadow-lg pointer-events-auto hover:bg-red-700 active:scale-95 transition-transform animate-pulse">
          <AlertTriangle size={24} />
        </button>
      </div>

      {/* Floating Controls */}
      <div className="absolute right-4 bottom-48 flex flex-col space-y-3 z-20">
        <button className="bg-white text-gray-700 p-3 rounded-full shadow-lg hover:bg-gray-50 active:bg-gray-100 transition-colors">
          <LocateFixed size={24} />
        </button>
        <button className="bg-black  text-primary-foreground p-3 rounded-full shadow-lg hover:bg-brand-700 active:bg-brand-800 transition-colors">
          <NavIcon size={24} className="rotate-45" />
        </button>
      </div>

      {/* Bottom Sheet Summary */}
      <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] z-30 p-6 animate-slide-up">
        <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-4"></div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-500">
              <User size={24} />
            </div>
            <div>
              <h3 className="font-bold text-lg text-gray-900">Priya Sharma</h3>
              <p className="text-gray-500 text-sm">
                Drop: Flat 302, Green Apts
              </p>
            </div>
          </div>
          <button className="bg-brand-100 text-brand-700 p-3 rounded-full hover:bg-brand-200 transition-colors">
            <Phone size={24} />
          </button>
        </div>

        <div className="flex space-x-3">
          <button
            onClick={() => navigate("/delivery/order-details/123")}
            className="flex-1 bg-gray-100 text-gray-800 font-bold py-3.5 rounded-xl hover:bg-gray-200 transition-colors">
            Order Details
          </button>
          <button
            onClick={() => navigate("/delivery/confirm-delivery/TEST12345")}
            className="flex-1 bg-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors">
            Arrived
          </button>
        </div>
      </div>
    </div>
  );
};

export default Navigation;
