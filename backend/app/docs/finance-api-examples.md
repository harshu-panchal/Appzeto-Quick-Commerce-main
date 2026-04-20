# Finance API Examples

## Checkout Preview
`POST /api/orders/checkout/preview`

```json
{
  "items": [
    { "product": "65f0a1...", "quantity": 2, "price": 120 }
  ],
  "address": {
    "type": "Home",
    "name": "Harsh",
    "address": "Pipliyahana Road",
    "city": "Indore",
    "phone": "9999999999",
    "location": { "lat": 22.7196, "lng": 75.8577 }
  },
  "discountTotal": 25,
  "taxTotal": 0,
  "paymentMode": "COD"
}
```

## Create Order With Frozen Snapshot
`POST /api/orders`

```json
{
  "items": [
    { "product": "65f0a1...", "quantity": 2, "price": 120 }
  ],
  "address": {
    "type": "Home",
    "name": "Harsh",
    "address": "Pipliyahana Road",
    "city": "Indore",
    "phone": "9999999999",
    "location": { "lat": 22.7196, "lng": 75.8577 }
  },
  "paymentMode": "ONLINE",
  "discountTotal": 25,
  "taxTotal": 0
}
```

## Verify Online Payment
`POST /api/orders/:id/payment/verify-online`

```json
{
  "razorpay_order_id": "order_...",
  "razorpay_payment_id": "pay_...",
  "razorpay_signature": "signature_hash"
}
```

## Mark COD Collected
`POST /api/orders/:id/cod/mark-collected`

```json
{
  "amount": 289,
  "deliveryPartnerId": "65f0b2..."
}
```

## Mark Delivered
`POST /api/orders/:id/delivered`

```json
{}
```

## Reconcile COD
`POST /api/orders/:id/cod/reconcile`

```json
{
  "amount": 289,
  "deliveryPartnerId": "65f0b2...",
  "metadata": { "mode": "cash_handover" }
}
```

## Admin Finance Summary
`GET /api/admin/finance/summary`

```json
{
  "totalPlatformEarning": 15309,
  "totalAdminEarning": 21,
  "availableBalance": 15309,
  "systemFloatCOD": 0,
  "sellerPendingPayouts": 166366,
  "deliveryPendingPayouts": 0
}
```

## Process Payouts
`POST /api/admin/finance/payouts/process`

```json
{
  "payoutIds": ["67ab..."],
  "remarks": "Weekly settlement"
}
```

## Update Delivery Settings
`PUT /api/admin/settings/delivery`

```json
{
  "deliveryPricingMode": "distance_based",
  "customerBaseDeliveryFee": 30,
  "riderBasePayout": 30,
  "baseDistanceCapacityKm": 0.5,
  "incrementalKmSurcharge": 10,
  "deliveryPartnerRatePerKm": 5,
  "handlingFeeStrategy": "highest_category_fee",
  "codEnabled": true,
  "onlineEnabled": true
}
```
