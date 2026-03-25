import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, FileCheck, UploadCloud, XCircle, Clock } from "lucide-react";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { toast } from "sonner";

const Documents = () => {
  const navigate = useNavigate();

  const [docs, setDocs] = useState([
    {
      id: 1,
      title: "Aadhar Card",
      status: "Verified",
      uploadedOn: "12 Jan 2024",
      fileName: "aadhar_front_back.pdf",
    },
    {
      id: 2,
      title: "PAN Card",
      status: "Verified",
      uploadedOn: "12 Jan 2024",
      fileName: "pan_card.jpg",
    },
    {
      id: 3,
      title: "Driving License",
      status: "Verified",
      uploadedOn: "15 Jan 2024",
      fileName: "dl_front.jpg",
    },
    {
      id: 4,
      title: "Police Clearance",
      status: "Pending",
      uploadedOn: "20 Feb 2024",
      fileName: "pcc_receipt.pdf",
    },
    {
      id: 5,
      title: "Bank Passbook",
      status: "Rejected",
      reason: "Image blurry, please re-upload",
      fileName: null,
    },
  ]);

  const handleUpload = (id) => {
    toast.info("Upload functionality would open file picker here");
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "Verified":
        return (
          <span className="flex items-center text-green-600 bg-green-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <FileCheck size={12} className="mr-1" /> Verified
          </span>
        );
      case "Pending":
        return (
          <span className="flex items-center text-yellow-600 bg-yellow-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <Clock size={12} className="mr-1" /> Pending
          </span>
        );
      case "Rejected":
        return (
          <span className="flex items-center text-red-600 bg-red-50 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider">
            <XCircle size={12} className="mr-1" /> Rejected
          </span>
        );
      default:
        return null;
    }
  };

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
          <h1 className="ds-h3 text-gray-900">My Documents</h1>
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto space-y-4">
        {docs.map((doc) => (
          <Card key={doc.id} className="p-4 border border-gray-100">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-bold text-gray-800">{doc.title}</h4>
              {getStatusBadge(doc.status)}
            </div>

            {doc.fileName && (
              <p className="text-xs text-gray-500 mb-3 flex items-center">
                <span className="truncate max-w-[200px]">{doc.fileName}</span>
                <span className="mx-2">•</span>
                <span>{doc.uploadedOn}</span>
              </p>
            )}

            {doc.status === "Rejected" && (
              <div className="bg-red-50 text-red-700 text-xs p-2 rounded mb-3">
                Reason: {doc.reason}
              </div>
            )}

            <div className="flex space-x-2">
              {doc.status !== "Verified" && (
                <Button 
                  size="sm" 
                  className="w-full text-xs h-8" 
                  onClick={() => handleUpload(doc.id)}
                >
                  <UploadCloud size={14} className="mr-1" /> 
                  {doc.status === "Rejected" ? "Re-upload" : "Update"}
                </Button>
              )}
              {doc.fileName && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full text-xs h-8"
                  onClick={() => toast.success("Downloading document...")}
                >
                  View File
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Documents;
