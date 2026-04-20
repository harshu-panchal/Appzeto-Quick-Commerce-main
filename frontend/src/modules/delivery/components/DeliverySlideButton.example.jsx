/**
 * Example integration of DeliverySlideButton component
 * 
 * This file demonstrates how to integrate the DeliverySlideButton
 * into a delivery page for OTP generation with proximity validation.
 */

import React from "react";
import { useNavigate } from "react-router-dom";
import DeliverySlideButton from "./DeliverySlideButton";

/**
 * Example 1: Basic integration in a delivery confirmation page
 */
function DeliveryConfirmationPage({ orderId }) {
  const navigate = useNavigate();

  const handleOtpGenerated = (data) => {
    console.log("OTP generated successfully:", data);
    // Navigate to OTP input screen
    navigate(`/delivery/otp-input/${orderId}`);
  };

  const handleError = (error) => {
    console.error("Failed to generate OTP:", error);
    // Error is already displayed via toast, no additional action needed
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page content */}
      <div className="p-4">
        <h1>Ready to Complete Delivery?</h1>
        <p>Slide the button below to generate OTP for the customer</p>
      </div>

      {/* Sticky slide button at bottom */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg">
        <DeliverySlideButton
          orderId={orderId}
          onSuccess={handleOtpGenerated}
          onError={handleError}
        />
      </div>
    </div>
  );
}

/**
 * Example 2: Integration with custom styling
 */
function CustomStyledDeliveryPage({ orderId }) {
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 bg-white">
      <DeliverySlideButton
        orderId={orderId}
        label="SLIDE TO CONFIRM DELIVERY"
        bgColor="bg-black "
        bgColorLight="bg-brand-50"
        onSuccess={(data) => {
          console.log("Success:", data);
          navigate(`/delivery/otp-input/${orderId}`);
        }}
        onError={(error) => {
          console.error("Error:", error);
        }}
      />
    </div>
  );
}

/**
 * Example 3: Integration with state management
 */
function DeliveryPageWithState({ orderId }) {
  const navigate = useNavigate();
  const [otpData, setOtpData] = React.useState(null);
  const [showOtpInput, setShowOtpInput] = React.useState(false);

  const handleOtpGenerated = (data) => {
    setOtpData(data);
    setShowOtpInput(true);
    // Optionally navigate or show OTP input inline
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {!showOtpInput ? (
        <>
          <div className="p-4">
            <h1>Complete Delivery</h1>
            <p>You are near the customer location</p>
          </div>

          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white">
            <DeliverySlideButton
              orderId={orderId}
              onSuccess={handleOtpGenerated}
            />
          </div>
        </>
      ) : (
        <div className="p-4">
          <h2>Enter OTP</h2>
          <p>OTP has been sent to the customer</p>
          <p>Expires at: {otpData?.data?.expiresAt}</p>
          {/* OTP input component here */}
        </div>
      )}
    </div>
  );
}

/**
 * Example 4: Replacing existing slide logic in OrderDetails.jsx
 * 
 * To integrate into the existing OrderDetails.jsx page, replace the
 * phase 2 slide logic with the DeliverySlideButton component:
 */
function OrderDetailsIntegrationExample({ order, phase }) {
  const navigate = useNavigate();

  // For phase 2 (out for delivery → complete delivery)
  if (phase === 2 && !isOrderDelivered(order)) {
    return (
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-lg z-40 max-w-md mx-auto">
        <DeliverySlideButton
          orderId={order.orderId}
          label="SLIDE TO GENERATE OTP"
          bgColor="bg-brand-700"
          bgColorLight="bg-brand-50"
          onSuccess={() => {
            // Navigate to OTP input screen
            navigate(`/delivery/confirm-delivery/${order.orderId}`);
          }}
        />
      </div>
    );
  }

  return null;
}

export {
  DeliveryConfirmationPage,
  CustomStyledDeliveryPage,
  DeliveryPageWithState,
  OrderDetailsIntegrationExample,
};
