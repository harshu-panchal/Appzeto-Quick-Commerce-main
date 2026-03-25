import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Truck, ShieldCheck, FileText, AlertCircle } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { useAuth } from "@/core/context/AuthContext";
import { useSettings } from "@/core/context/SettingsContext";

const VehicleInfo = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";

  const vehicleDetails = {
    type: user?.vehicleType || "Not Specified",
    model: "N/A", // We don't have vehicle model in backend yet
    plateNumber: user?.vehicleNumber || "Not Assigned",
    color: "N/A",
    fuelType: "N/A",
  };

  const documents = [
    {
      title: "Driving License",
      number: user?.drivingLicenseNumber || "Not Available",
      expiry: "N/A",
      status: "Verified",
    },
    {
      title: "RC Book",
      number: user?.vehicleNumber || "Not Assigned",
      expiry: "Valid Forever",
      status: "Verified",
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center p-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-gray-100 transition-colors mr-2"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="ds-h3 text-gray-900">Vehicle Information</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-6">
        {/* Vehicle Card */}
        <Card className="p-5 bg-gradient-to-br from-gray-900 to-gray-800 text-white border-none shadow-xl">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-1">Vehicle Details</p>
              <h3 className="text-2xl font-bold">{vehicleDetails.plateNumber}</h3>
              <p className="text-gray-300">{vehicleDetails.model}</p>
            </div>
            <div className="bg-white/10 p-2 rounded-full backdrop-blur-sm">
              <Truck size={24} className="text-white" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/10">
            <div>
              <p className="text-gray-400 text-xs">Color</p>
              <p className="font-medium">{vehicleDetails.color}</p>
            </div>
            <div>
              <p className="text-gray-400 text-xs">Fuel Type</p>
              <p className="font-medium">{vehicleDetails.fuelType}</p>
            </div>
          </div>
        </Card>

        {/* Documents List */}
        <div>
          <h3 className="ds-h4 text-gray-900 mb-3 px-1">Vehicle Documents</h3>
          <div className="space-y-3">
            {documents.map((doc, index) => (
              <Card key={index} className="p-4 border border-gray-100">
                <div className="flex justify-between items-start">
                  <div className="flex items-start">
                    <div className={`p-2 rounded-lg mr-3 ${doc.alert ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>
                      <FileText size={20} />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800 text-sm">{doc.title}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{doc.number}</p>
                      <p className={`text-xs mt-1 ${doc.alert ? 'text-orange-600 font-medium' : 'text-gray-400'}`}>
                        Expires: {doc.expiry}
                      </p>
                    </div>
                  </div>
                  {doc.alert ? (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-orange-200 text-orange-600 bg-orange-50 hover:bg-orange-100">
                      Renew
                    </Button>
                  ) : (
                    <div className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
                      <ShieldCheck size={12} className="mr-1" /> Verified
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-xl flex items-start">
          <AlertCircle size={20} className="text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-800">
            To change your vehicle details, please visit the nearest {appName} Partner Center with your original documents.
          </p>
        </div>
      </div>
    </div>
  );
};

export default VehicleInfo;
