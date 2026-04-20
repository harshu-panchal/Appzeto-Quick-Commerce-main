import axiosInstance from '@core/api/axios';

export const sellerApi = {
    login: (data) => axiosInstance.post('/seller/login', data),
    signup: (data) => axiosInstance.post('/seller/signup', data),
    sendVerificationOtp: (data) => axiosInstance.post('/seller/verification/send-otp', data),
    verifyVerificationOtp: (data) => axiosInstance.post('/seller/verification/verify-otp', data),
    // Products
    getProducts: (params) => axiosInstance.get('/products/seller/me', { params }),
    getProductById: (id) => axiosInstance.get(`/products/${id}`),
    createProduct: (data) => axiosInstance.post('/products', data),
    updateProduct: (id, data) => axiosInstance.put(`/products/${id}`, data),
    deleteProduct: (id) => axiosInstance.delete(`/products/${id}`),

    // Categories (Public)
    getCategories: () => axiosInstance.get('/admin/categories'),
    getCategoryTree: () => axiosInstance.get('/admin/categories?tree=true'),

    // Others
    getStats: (range) => axiosInstance.get('/seller/stats', { params: { range } }),
    getOrders: (params) => axiosInstance.get('/orders/seller-orders', { params }),
    updateOrderStatus: (orderId, data) => axiosInstance.put(`/orders/status/${orderId}`, data),
    getEarnings: () => axiosInstance.get('/seller/earnings'),
    getWalletSummary: () => axiosInstance.get('/seller/wallet/summary'),
    getProfile: () => axiosInstance.get('/seller/profile'),
    updateProfile: (data) => axiosInstance.put('/seller/profile', data),

    // Stock
    adjustStock: (data) => axiosInstance.post('/products/adjust-stock', data),
    getStockHistory: () => axiosInstance.get('/products/stock-history'),

    // Notifications
    getNotifications: () => axiosInstance.get('/notifications'),
    markNotificationRead: (id) => axiosInstance.put(`/notifications/${id}/read`),
    markAllNotificationsRead: () => axiosInstance.put('/notifications/mark-all-read'),

    // Money Requests
    requestWithdrawal: (data) => axiosInstance.post('/seller/request-withdrawal', data),

    // Returns
    getReturns: (params) => axiosInstance.get('/orders/seller-returns', { params }),
    getReturnDetails: (orderId) => axiosInstance.get(`/orders/${orderId}/returns`),
    approveReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/approve`, data),
    rejectReturn: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/reject`, data),
    assignReturnDelivery: (orderId, data) => axiosInstance.put(`/orders/returns/${orderId}/assign-delivery`, data),
};
