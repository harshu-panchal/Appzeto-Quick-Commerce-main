import React, { useState, useRef } from "react";
import { Camera, CheckCircle, Loader2, Package, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";

const CONDITIONS = [
  { value: "good", label: "Good Condition", color: "bg-green-100 text-green-800 border-green-300", icon: "✅" },
  { value: "damaged", label: "Damaged", color: "bg-orange-100 text-orange-800 border-orange-300", icon: "⚠️" },
  { value: "suspicious", label: "Suspicious", color: "bg-red-100 text-red-800 border-red-300", icon: "🚨" },
];

/**
 * ReturnPickupProofUpload — Upload product images and condition at customer pickup.
 * Rider must upload at least 1 image and select condition before requesting OTP.
 */
const ReturnPickupProofUpload = ({ orderId, onSubmitted }) => {
  const [images, setImages] = useState([]); // array of { url, preview }
  const [condition, setCondition] = useState("");
  const [conditionNote, setConditionNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageSelect = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = 5 - images.length;
    const toProcess = files.slice(0, remaining);

    setIsUploading(true);
    const newImages = [];

    for (const file of toProcess) {
      try {
        // Convert to base64 for preview + create FormData for Cloudinary upload
        const preview = await fileToDataUrl(file);

        const formData = new FormData();
        formData.append("file", file);
        formData.append("upload_preset", "return_proof"); // Cloudinary preset

        // Try Cloudinary upload via existing media endpoint or directly
        let url = preview; // fallback: use base64 (works for demo)
        try {
          const { default: axiosInstance } = await import("@core/api/axios");
          // Use existing media upload route
          const uploadForm = new FormData();
          uploadForm.append("file", file);
          const uploadRes = await axiosInstance.post("/media/upload", uploadForm, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          url =
            uploadRes.data?.result?.url ||
            uploadRes.data?.data?.url ||
            uploadRes.data?.url ||
            preview;
        } catch {
          // Fallback to base64 data URL for dev/offline
          url = preview;
        }

        newImages.push({ url, preview });
      } catch (err) {
        toast.error("Failed to process image: " + (err.message || "Unknown error"));
      }
    }

    setImages((prev) => [...prev, ...newImages].slice(0, 5));
    setIsUploading(false);
    // Reset file input so same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (images.length === 0) {
      toast.error("Please upload at least 1 photo of the product.");
      return;
    }
    if (!condition) {
      toast.error("Please select the product condition.");
      return;
    }

    setIsSubmitting(true);
    try {
      await deliveryApi.uploadReturnPickupProof(orderId, {
        images: images.map((img) => img.url),
        condition,
        conditionNote: conditionNote.trim() || undefined,
      });

      toast.success("Pickup proof uploaded! You can now request OTP.");
      setSubmitted(true);
      if (onSubmitted) onSubmitted({ images, condition, conditionNote });
    } catch (err) {
      const msg = err.response?.data?.message || err.message || "Upload failed";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
        <CheckCircle className="w-12 h-12 text-green-600" />
        <p className="font-bold text-green-800 text-lg">Proof Uploaded!</p>
        <p className="text-sm text-green-700">
          You can now slide to request the pickup OTP from the customer.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
          <Package className="w-5 h-5 text-purple-700" />
        </div>
        <div>
          <p className="font-bold text-gray-900 text-sm">Upload Pickup Proof</p>
          <p className="text-xs text-gray-500">Take photos of product & packaging before pickup</p>
        </div>
      </div>

      {/* Image Upload Grid */}
      <div>
        <p className="text-xs text-gray-500 font-bold mb-2 uppercase tracking-wide">
          Photos ({images.length}/5) — <span className="text-purple-600">Min 1 required</span>
        </p>
        <div className="grid grid-cols-4 gap-2">
          {images.map((img, index) => (
            <div key={index} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200">
              <img src={img.preview || img.url} alt={`proof-${index}`} className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(index)}
                className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
          {images.length < 5 && (
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              {isUploading ? (
                <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
              ) : (
                <>
                  <Camera className="w-5 h-5 text-gray-400" />
                  <span className="text-xs text-gray-400 mt-1">Add</span>
                </>
              )}
            </button>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          capture="environment"
          onChange={handleImageSelect}
          className="hidden"
        />
      </div>

      {/* Condition */}
      <div>
        <p className="text-xs text-gray-500 font-bold mb-2 uppercase tracking-wide">
          Product Condition
        </p>
        <div className="flex gap-2 flex-wrap">
          {CONDITIONS.map((c) => (
            <button
              key={c.value}
              onClick={() => setCondition(c.value)}
              className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${c.color} ${
                condition === c.value ? "ring-2 ring-offset-1 ring-purple-500 scale-105" : "opacity-70"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Condition Note */}
      {condition === "damaged" || condition === "suspicious" ? (
        <div>
          <p className="text-xs text-gray-500 font-medium mb-1">
            {condition === "suspicious" ? "🚨 Describe Suspicious Activity" : "⚠️ Describe Damage"}
          </p>
          <textarea
            value={conditionNote}
            onChange={(e) => setConditionNote(e.target.value)}
            placeholder={
              condition === "suspicious"
                ? "Describe what looks suspicious..."
                : "Describe the damage..."
            }
            rows={2}
            maxLength={500}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
          {(condition === "suspicious") && (
            <div className="flex items-start gap-2 mt-2 bg-red-50 border border-red-200 rounded-lg p-2">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">
                Suspicious pickups are flagged for admin review. Proceed if you believe it is safe.
              </p>
            </div>
          )}
        </div>
      ) : null}

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting || images.length === 0 || !condition}
        className={`w-full h-12 rounded-xl font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2 ${
          isSubmitting || images.length === 0 || !condition
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-purple-600 text-white shadow-md hover:bg-purple-700"
        }`}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <CheckCircle className="w-4 h-4" />
            Submit Proof ({images.length} photo{images.length !== 1 ? "s" : ""})
          </>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center">
        These photos will be reviewed during admin quality check
      </p>
    </div>
  );
};

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default ReturnPickupProofUpload;
