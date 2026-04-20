# OtpInput Component

A 4-digit OTP input component for delivery personnel to validate delivery completion in the proximity-based delivery OTP system.

## Features

- ✅ **4 Separate Input Fields**: One field per digit for clear visual feedback
- ✅ **Auto-Focus Navigation**: Automatically moves to next field on digit entry
- ✅ **Backspace Navigation**: Moves to previous field on backspace when empty
- ✅ **Mobile Optimized**: Uses `inputMode="numeric"` for numeric keyboard on mobile
- ✅ **Paste Support**: Paste 4-digit codes to fill all fields at once
- ✅ **Smart Validation**: Submit button only enabled when all 4 digits entered
- ✅ **Error Handling**: Displays clear error messages for all failure scenarios
- ✅ **Attempts Counter**: Shows remaining validation attempts (max 3)
- ✅ **Auto-Clear**: Clears input fields after failed validation for retry
- ✅ **Loading States**: Shows spinner during API validation
- ✅ **Accessibility**: Proper ARIA labels and keyboard navigation

## Requirements Satisfied

- **Requirement 5.1**: Display OTP input field for delivery person
- **Requirement 5.2**: Accept exactly 4 numeric digits as OTP input
- **Requirement 6.5**: Show attempts remaining counter and clear inputs after failed validation

## Usage

```jsx
import OtpInput from "@/modules/delivery/components/OtpInput";

function DeliveryScreen() {
  const [orderId, setOrderId] = useState("ORD123456");

  const handleSuccess = (data) => {
    console.log("Order delivered:", data);
    // Navigate to success screen
    navigate("/delivery/success");
  };

  const handleError = (error) => {
    console.error("Validation failed:", error);
  };

  const handleCancel = () => {
    // Go back to previous screen
    navigate(-1);
  };

  return (
    <OtpInput
      orderId={orderId}
      onSuccess={handleSuccess}
      onError={handleError}
      onCancel={handleCancel}
    />
  );
}
```

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `orderId` | `string` | Yes | The order ID for OTP validation |
| `onSuccess` | `function` | Yes | Callback when OTP is successfully validated. Receives response data. |
| `onError` | `function` | No | Callback when validation fails. Receives error object. |
| `onCancel` | `function` | No | Callback for cancel action. If provided, shows cancel button. |

## API Integration

The component calls the following API endpoint:

```
POST /api/delivery/orders/:orderId/validate-otp
```

**Request Body:**
```json
{
  "otp": "1234"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Order delivered successfully",
  "data": {
    "orderId": "ORD123456",
    "deliveredAt": "2024-01-15T10:15:30Z"
  }
}
```

## Error Handling

The component handles the following error scenarios:

### OTP Mismatch (403)
- **Code**: `OTP_MISMATCH`
- **Behavior**: Shows error message with attempts remaining, clears input fields
- **Example**: "Incorrect OTP. 2 attempts remaining."

### OTP Expired (401)
- **Code**: `OTP_EXPIRED`
- **Behavior**: Shows expiration message, prompts to generate new OTP
- **Example**: "OTP has expired. Please generate a new one."

### Max Attempts Exceeded (423)
- **Code**: `MAX_ATTEMPTS_EXCEEDED`
- **Behavior**: Shows error requiring supervisor intervention
- **Example**: "Maximum attempts exceeded. Please contact supervisor."

### Invalid Format (400)
- **Code**: `OTP_INVALID_FORMAT`
- **Behavior**: Shows format error, clears input fields
- **Example**: "Invalid OTP format. Please enter 4 digits."

### No Active OTP (404)
- **Code**: `OTP_NOT_FOUND`
- **Behavior**: Shows error prompting to generate OTP first
- **Example**: "No active OTP found. Please generate one first."

## Integration Flow

1. **Generate OTP**: User slides the `DeliverySlideButton` to generate OTP
2. **Show OTP Input**: Display the `OtpInput` component after successful generation
3. **Enter OTP**: Delivery person asks customer for the 4-digit code
4. **Validate**: Component automatically validates when all 4 digits entered
5. **Success**: On successful validation, navigate to success screen
6. **Error**: On failure, show error and allow retry (up to 3 attempts)

## Example Integration

```jsx
import { useState } from "react";
import DeliverySlideButton from "./DeliverySlideButton";
import OtpInput from "./OtpInput";

function DeliveryCompletionFlow({ orderId }) {
  const [otpGenerated, setOtpGenerated] = useState(false);

  const handleOtpGenerated = (data) => {
    console.log("OTP generated:", data);
    setOtpGenerated(true);
  };

  const handleOtpValidated = (data) => {
    console.log("Order delivered:", data);
    // Navigate to success screen
  };

  return (
    <div className="p-4">
      {!otpGenerated ? (
        <DeliverySlideButton
          orderId={orderId}
          onSuccess={handleOtpGenerated}
        />
      ) : (
        <OtpInput
          orderId={orderId}
          onSuccess={handleOtpValidated}
          onCancel={() => setOtpGenerated(false)}
        />
      )}
    </div>
  );
}
```

## Styling

The component uses Tailwind CSS classes and follows the design system:

- **Input Fields**: 
  - Default: Gray border, white background
  - Filled: Green border, green background tint
  - Error: Red border, red background tint
  - Size: 56px × 64px (w-14 h-16)
  - Font: 24px, bold, monospace

- **Submit Button**:
  - Enabled: Green background, white text, shadow
  - Disabled: Gray background, no interaction
  - Loading: Shows spinner with "Validating..." text

- **Error Messages**: Red background tint with alert icon
- **Attempts Counter**: Amber background when < 3 attempts

## Accessibility

- Each input has an `aria-label` for screen readers
- Proper keyboard navigation (Tab, Shift+Tab, Arrow keys)
- Focus indicators on all interactive elements
- Clear error messages announced to screen readers
- Disabled state properly communicated

## Mobile Optimization

- `inputMode="numeric"` triggers numeric keyboard on mobile devices
- `pattern="[0-9]*"` ensures numeric input on iOS
- Touch-friendly input sizes (56px × 64px)
- Paste support for quick entry from SMS or clipboard

## Testing

See `OtpInput.example.jsx` for a complete example with all features demonstrated.

## Related Components

- **DeliverySlideButton**: Generates the OTP (use before OtpInput)
- **DeliveryOtpDisplay**: Shows OTP to customer (customer app)

## Notes

- The component automatically clears inputs after failed validation
- Maximum 3 validation attempts before supervisor intervention required
- OTP must be exactly 4 numeric digits
- Component handles all loading and error states internally
- Toast notifications are shown for all success/error scenarios
