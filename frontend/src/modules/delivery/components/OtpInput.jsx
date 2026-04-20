import React, { useState, useRef, useEffect } from "react";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { deliveryApi } from "../services/deliveryApi";

/**
 * OtpInput Component
 * 
 * A 4-digit OTP input component for delivery personnel to validate delivery completion.
 * Features auto-focus, numeric keyboard on mobile, validation error handling, and
 * attempts remaining counter.
 * 
 * Requirements: 5.1, 5.2, 6.5
 * 
 * @param {Object} props
 * @param {string} props.orderId - The order ID for OTP validation
 * @param {Function} props.onSuccess - Callback when OTP is successfully validated
 * @param {Function} props.onError - Callback when validation fails
 * @param {Function} props.onCancel - Optional callback for cancel action
 */
const OtpInput = ({ orderId, isReturn = false, isReturnDrop = false, onSuccess, onError, onCancel }) => {
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [lastErrorCode, setLastErrorCode] = useState(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const inputRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Auto-focus first input on mount
  useEffect(() => {
    if (inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, []);

  // Reset component when orderId changes
  useEffect(() => {
    setOtp(["", "", "", ""]);
    setError(null);
    setLastErrorCode(null);
    setAttemptsRemaining(3);
    setIsLoading(false);
    setIsGenerating(false);
    if (inputRefs[0].current) {
      inputRefs[0].current.focus();
    }
  }, [orderId]);

  /**
   * Handle input change for a specific digit
   * Implements auto-focus to next field on digit entry
   * Requirement 5.2: Accept exactly 4 numeric digits
   */
  const handleChange = (index, value) => {
    // Only allow numeric input
    if (value && !/^\d$/.test(value)) {
      return;
    }

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setError(null);

    // Auto-focus next field if digit entered
    if (value && index < 3) {
      inputRefs[index + 1].current?.focus();
    }
  };

  /**
   * Handle keydown events for backspace navigation
   * Auto-focus previous field on backspace when current field is empty
   */
  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      inputRefs[index - 1].current?.focus();
    }
  };

  /**
   * Handle paste event to fill all fields at once
   */
  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").trim();

    // Only accept 4-digit numeric paste
    if (/^\d{4}$/.test(pastedData)) {
      const newOtp = pastedData.split("");
      setOtp(newOtp);
      setError(null);
      // Focus last input
      inputRefs[3].current?.focus();
    }
  };

  /**
   * Clear all input fields
   * Requirement 6.5: Clear input fields after failed validation
   */
  const clearInputs = () => {
    setOtp(["", "", "", ""]);
    setError(null);
    inputRefs[0].current?.focus();
  };

  const handleGenerateOtp = async () => {
    if (!orderId) return;

    setIsGenerating(true);
    try {
      const response = isReturn
        ? await deliveryApi.requestReturnOtp(orderId, {})
        : await deliveryApi.generateDeliveryOtp(orderId);
      toast.success(response.data?.message || "OTP generated and sent to customer");
      setError(null);
      setLastErrorCode(null);
      clearInputs();
    } catch (err) {
      const errorMessage =
        err.response?.data?.error?.message ||
        err.message ||
        "Failed to generate OTP";
      toast.error(errorMessage);
      setError(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  /**
   * Submit OTP for validation
   * Requirement 5.1: Display OTP input field for delivery person
   * Requirement 6.5: Show attempts remaining counter
   */
  const handleSubmit = async () => {
    const otpString = otp.join("");

    // Validate OTP format before submission
    if (otpString.length !== 4) {
      setError("Please enter all 4 digits");
      return;
    }

    setIsLoading(true);
    setError(null);
    setLastErrorCode(null);

    try {
      // Call appropriate validation endpoint
      const response = isReturnDrop
        ? await deliveryApi.verifyReturnDropOtp(orderId, { code: otpString })
        : isReturn
          ? await deliveryApi.verifyReturnOtp(orderId, { otp: otpString })
          : await deliveryApi.validateDeliveryOtp(orderId, { otp: otpString });

      // Success
      toast.success(
        response.data?.message ||
        (isReturnDrop
          ? "Seller confirmed! Return complete."
          : isReturn
            ? "Return pickup verified!"
            : "Order delivered successfully!")
      );

      if (onSuccess) {
        onSuccess(response.data);
      }
    } catch (err) {
      // Handle validation errors
      const errorData = err.response?.data?.error;
      const errorCode = errorData?.code;
      const errorMessage = errorData?.message || "Failed to validate OTP";
      const remainingAttempts = errorData?.attemptsRemaining;

      setLastErrorCode(errorCode || null);

      // Update attempts remaining if provided
      if (typeof remainingAttempts === "number") {
        setAttemptsRemaining(remainingAttempts);
      }

      // Display appropriate error message
      if (errorCode === "OTP_MISMATCH") {
        setError(`Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`);
        toast.error(`Incorrect OTP. ${remainingAttempts} attempt${remainingAttempts !== 1 ? "s" : ""} remaining.`);
        clearInputs();
      } else if (errorCode === "OTP_EXPIRED") {
        setError("OTP has expired. Please generate a new one.");
        toast.error("OTP has expired. Please generate a new one.");
      } else if (errorCode === "OTP_CONSUMED") {
        setError("OTP was already used. Please generate a new one.");
        toast.error("OTP was already used. Please generate a new one.");
      } else if (errorCode === "MAX_ATTEMPTS_EXCEEDED") {
        setError("Maximum attempts exceeded. Please contact supervisor.");
        toast.error("Maximum attempts exceeded. Please contact supervisor.", {
          duration: 6000,
        });
      } else if (errorCode === "OTP_INVALID_FORMAT") {
        setError("Invalid OTP format. Please enter 4 digits.");
        toast.error("Invalid OTP format. Please enter 4 digits.");
        clearInputs();
      } else if (errorCode === "OTP_NOT_FOUND") {
        setError("No active OTP found. Please generate one first.");
        toast.error("No active OTP found. Please generate one first.");
      } else {
        setError(errorMessage);
        toast.error(errorMessage);
      }

      if (onError) {
        onError(err);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Check if all 4 digits are entered
  const isComplete = otp.every((digit) => digit !== "");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-lg font-bold text-gray-900 mb-1">
          {isReturnDrop ? "Enter Seller OTP" : isReturn ? "Enter Return OTP" : "Enter Delivery OTP"}
        </h3>
        <p className="text-sm text-gray-600">
          {isReturnDrop
            ? "Ask the seller for the 4-digit return confirmation code"
            : "Ask the customer for the 4-digit code"}
        </p>
      </div>

      {/* OTP Input Fields */}
      <div className="flex justify-center gap-3">
        {otp.map((digit, index) => (
          <input
            key={index}
            ref={inputRefs[index]}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            disabled={isLoading}
            className={`w-14 h-16 text-center text-2xl font-bold font-mono border-2 rounded-xl transition-all duration-200 outline-none focus:outline-none focus:ring-2 focus:ring-offset-0 ${error
                ? "border-red-300 bg-red-50 text-red-900 focus:border-red-500 focus:ring-red-500"
                : digit
                  ? "border-primary bg-primary/10 text-slate-900 focus:border-primary focus:ring-primary"
                  : "border-gray-300 bg-white text-gray-900 focus:border-brand-500 focus:ring-brand-500"
              } ${isLoading ? "opacity-50 cursor-not-allowed" : ""}`}
            aria-label={`Digit ${index + 1}`}
          />
        ))}
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 animate-in fade-in slide-in-from-top-2 duration-300">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-800 font-medium">{error}</p>
        </div>
      )}

      {/* Attempts Remaining Counter */}
      {/* Requirement 6.5: Show attempts remaining counter */}
      {attemptsRemaining < 3 && attemptsRemaining > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <p className="text-sm text-amber-800 font-medium">
            {attemptsRemaining} attempt{attemptsRemaining !== 1 ? "s" : ""} remaining
          </p>
        </div>
      )}

      {["OTP_NOT_FOUND", "OTP_EXPIRED", "OTP_CONSUMED"].includes(lastErrorCode) && (
        <button
          onClick={handleGenerateOtp}
          disabled={isLoading || isGenerating}
          className="w-full h-10 rounded-xl font-semibold text-primary-foreground bg-black  hover:bg-brand-700 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating OTP...</span>
            </>
          ) : (
            <span>Generate New OTP</span>
          )}
        </button>
      )}

      {/* Submit Button */}
      {/* Enable submit button only when 4 digits entered */}
      <button
        onClick={handleSubmit}
        disabled={!isComplete || isLoading || isGenerating}
        className={`w-full h-12 rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 outline-none focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 ${!isComplete || isLoading || isGenerating
            ? "bg-gray-200 text-gray-600 cursor-not-allowed"
            : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95 shadow-md hover:shadow-lg"
          }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Validating...</span>
          </>
        ) : (
          <>
            <CheckCircle className="w-5 h-5" />
            <span>{isReturnDrop ? "Confirm Return Delivery" : isReturn ? "Confirm Pickup" : "Confirm Delivery"}</span>
          </>
        )}
      </button>

      {/* Clear Button */}
      <button
        onClick={clearInputs}
        disabled={isLoading || otp.every((d) => !d)}
        className="w-full h-10 rounded-xl font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-95 transition-all duration-200 outline-none focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Clear
      </button>

      {/* Cancel Button (Optional) */}
      {onCancel && (
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="w-full h-10 rounded-xl font-medium text-gray-600 hover:text-gray-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Cancel
        </button>
      )}

      {/* Help Text */}
      <div className="bg-brand-50 border border-brand-200 rounded-xl p-3">
        <p className="text-xs text-brand-800 text-center">
          💡 The customer will see this OTP on their app when you're nearby
        </p>
      </div>
    </div>
  );
};

export default OtpInput;
