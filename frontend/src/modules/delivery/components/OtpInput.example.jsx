import React, { useState } from "react";
import OtpInput from "./OtpInput";

/**
 * Example usage of the OtpInput component
 * 
 * This demonstrates how to integrate the OTP input component
 * into a delivery flow after OTP generation.
 */
const OtpInputExample = () => {
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [orderId] = useState("ORD123456");

  const handleOtpSuccess = (data) => {
    console.log("OTP validated successfully:", data);
    // Navigate to success screen or update order status
    alert(`Order ${data.orderId} delivered successfully!`);
    setShowOtpInput(false);
  };

  const handleOtpError = (error) => {
    console.error("OTP validation error:", error);
  };

  const handleCancel = () => {
    setShowOtpInput(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
            Delivery OTP Input Example
          </h1>

          {!showOtpInput ? (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm text-blue-800 mb-2">
                  <strong>Order ID:</strong> {orderId}
                </p>
                <p className="text-sm text-blue-800">
                  After generating the OTP (via DeliverySlideButton), show the OTP input component.
                </p>
              </div>

              <button
                onClick={() => setShowOtpInput(true)}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
              >
                Show OTP Input
              </button>
            </div>
          ) : (
            <OtpInput
              orderId={orderId}
              onSuccess={handleOtpSuccess}
              onError={handleOtpError}
              onCancel={handleCancel}
            />
          )}
        </div>

        {/* Integration Notes */}
        <div className="mt-6 bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">
            Integration Notes
          </h2>
          <div className="space-y-3 text-sm text-gray-700">
            <div>
              <strong className="text-gray-900">1. After OTP Generation:</strong>
              <p className="mt-1">
                Show the OtpInput component after the DeliverySlideButton successfully generates an OTP.
              </p>
            </div>

            <div>
              <strong className="text-gray-900">2. Success Handling:</strong>
              <p className="mt-1">
                On successful validation, navigate to a success screen or update the order status in your UI.
              </p>
            </div>

            <div>
              <strong className="text-gray-900">3. Error Handling:</strong>
              <p className="mt-1">
                The component handles all error states internally (mismatch, expired, max attempts).
                Clear inputs automatically after failed validation.
              </p>
            </div>

            <div>
              <strong className="text-gray-900">4. Mobile Optimization:</strong>
              <p className="mt-1">
                Uses inputMode="numeric" for mobile numeric keyboard.
                Supports paste for quick entry.
              </p>
            </div>
          </div>
        </div>

        {/* API Response Examples */}
        <div className="mt-6 bg-white rounded-2xl shadow-lg p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">
            API Response Examples
          </h2>
          
          <div className="space-y-4 text-xs">
            <div>
              <strong className="text-green-700">Success (200):</strong>
              <pre className="mt-1 bg-green-50 border border-green-200 rounded p-2 overflow-x-auto">
{`{
  "success": true,
  "message": "Order delivered successfully",
  "data": {
    "orderId": "ORD123456",
    "deliveredAt": "2024-01-15T10:15:30Z"
  }
}`}
              </pre>
            </div>

            <div>
              <strong className="text-red-700">OTP Mismatch (403):</strong>
              <pre className="mt-1 bg-red-50 border border-red-200 rounded p-2 overflow-x-auto">
{`{
  "success": false,
  "error": {
    "code": "OTP_MISMATCH",
    "message": "Incorrect OTP",
    "attemptsRemaining": 2
  }
}`}
              </pre>
            </div>

            <div>
              <strong className="text-amber-700">OTP Expired (401):</strong>
              <pre className="mt-1 bg-amber-50 border border-amber-200 rounded p-2 overflow-x-auto">
{`{
  "success": false,
  "error": {
    "code": "OTP_EXPIRED",
    "message": "OTP has expired"
  }
}`}
              </pre>
            </div>

            <div>
              <strong className="text-purple-700">Max Attempts (423):</strong>
              <pre className="mt-1 bg-purple-50 border border-purple-200 rounded p-2 overflow-x-auto">
{`{
  "success": false,
  "error": {
    "code": "MAX_ATTEMPTS_EXCEEDED",
    "message": "Maximum attempts exceeded"
  }
}`}
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OtpInputExample;
