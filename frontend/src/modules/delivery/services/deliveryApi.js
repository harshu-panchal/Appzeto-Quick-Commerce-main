import axiosInstance from "@core/api/axios";

export const deliveryApi = {
  sendLoginOtp: (data) => axiosInstance.post("/delivery/send-login-otp", data),
  sendSignupOtp: (data) =>
    axiosInstance.post("/delivery/send-signup-otp", data),
  verifyOtp: (data) => axiosInstance.post("/delivery/verify-otp", data),
  getProfile: () => axiosInstance.get("/delivery/profile"),
  updateProfile: (data) => axiosInstance.put("/delivery/profile", data),
  getStats: () => axiosInstance.get("/delivery/stats"),
  getEarnings: () => axiosInstance.get("/delivery/earnings"),
  getWalletSummary: () => axiosInstance.get("/delivery/wallet/summary"),
  getOrderHistory: (params, config = {}) =>
    axiosInstance.get("/delivery/order-history", { params, ...config }),
  getAvailableOrders: () => axiosInstance.get("/orders/available"),
  acceptOrder: (orderId, idempotencyKey) =>
    axiosInstance.put(
      `/orders/accept/${encodeURIComponent(String(orderId))}`,
      {},
      {
        headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
      },
    ),
  skipOrder: (orderId) =>
    axiosInstance.put(`/orders/skip/${encodeURIComponent(String(orderId))}`),
  postLocation: (body) => axiosInstance.post("/delivery/location", body),
  confirmPickup: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/pickup/confirm`, body),
  markArrivedAtStore: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/pickup/ready`, body),
  advanceDeliveryRiderUi: (orderId) =>
    axiosInstance.post(`/orders/workflow/${orderId}/rider/advance-ui`, {}),
  requestDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/otp/request`, body),
  verifyDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/orders/workflow/${orderId}/otp/verify`, body),
  generateDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/delivery/orders/${orderId}/generate-otp`, body),
  validateDeliveryOtp: (orderId, body) =>
    axiosInstance.post(`/delivery/orders/${orderId}/validate-otp`, body),
  getOrderRoute: (orderId, params) =>
    axiosInstance.get(`/orders/workflow/${orderId}/route`, { params }),
  getOrderDetails: (orderId) =>
    axiosInstance.get(
      `/orders/details/${encodeURIComponent(String(orderId))}`,
    ),
  getNotifications: () => axiosInstance.get("/notifications"),
  markNotificationRead: (id) => axiosInstance.put(`/notifications/${id}/read`),
  markAllNotificationsRead: () =>
    axiosInstance.put("/notifications/mark-all-read"),
  requestWithdrawal: (data) =>
    axiosInstance.post("/delivery/request-withdrawal", data),
  updateOrderStatus: (orderId, data) =>
    axiosInstance.put(`/orders/status/${orderId}`, data),
  updateReturnStatus: (orderId, data) =>
    axiosInstance.put(`/orders/return-status/${orderId}`, data),
};
