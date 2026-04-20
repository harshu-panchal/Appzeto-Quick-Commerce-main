import axios from 'axios';
import { resolveApiBaseUrl } from './resolveApiBaseUrl';
import { getStoredAuthToken } from '@core/utils/authStorage';

const ROLE_STORAGE_KEYS = ['auth_seller', 'auth_admin', 'auth_delivery', 'auth_customer'];

const axiosInstance = axios.create({
    baseURL: resolveApiBaseUrl(),
});

// Request interceptor for API calls
axiosInstance.interceptors.request.use(
    (config) => {
        let token = null;
        const url = config.url;
        const pagePath = window.location.pathname;
        const isMultipartRequest =
            typeof FormData !== 'undefined' && config.data instanceof FormData;

        if (isMultipartRequest) {
            // Let the browser set the multipart boundary for FormData uploads.
            if (typeof config.headers?.delete === 'function') {
                config.headers.delete('Content-Type');
            } else if (config.headers) {
                delete config.headers['Content-Type'];
            }
        }

        // Determination strategy: 
        // 1. If we are on a module-specific page (e.g. /seller/dashboard), prioritize that module's token
        // This is crucial for shared APIs like /products or /admin/categories
        if (pagePath.startsWith('/seller')) {
            token = getStoredAuthToken('auth_seller');
        } else if (pagePath.startsWith('/admin')) {
            token = getStoredAuthToken('auth_admin');
        } else if (pagePath.startsWith('/delivery')) {
            token = getStoredAuthToken('auth_delivery');
        } else if (pagePath.startsWith('/customer')) {
            token = getStoredAuthToken('auth_customer');
        }

        // 2. Fallback to URL-based detection
        if (!token) {
            if (url.startsWith('/seller')) token = getStoredAuthToken('auth_seller');
            else if (url.startsWith('/admin')) token = getStoredAuthToken('auth_admin');
            else if (url.startsWith('/delivery')) token = getStoredAuthToken('auth_delivery');
            else if (url.startsWith('/customer') || url.startsWith('/cart') || url.startsWith('/wishlist') || url.startsWith('/categories') || url.startsWith('/products') || url.startsWith('/payments')) {
                token = getStoredAuthToken('auth_customer');
            }
        }

        // 3. Final default: if we are on a general page and STILL no token, try customer token
        if (!token && !pagePath.startsWith('/admin') && !pagePath.startsWith('/seller') && !pagePath.startsWith('/delivery')) {
            token = getStoredAuthToken('auth_customer');
        }

        // 3. Last fallback: Check common 'token' key if implemented
        if (!token) {
            token = getStoredAuthToken('token');
        }

        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor for API calls
axiosInstance.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            const hasStoredRoleToken = ROLE_STORAGE_KEYS.some((key) => localStorage.getItem(key));
            if (hasStoredRoleToken) {
                console.warn(
                    '[axios] Received 401 response. Preserving stored auth tokens; session data is only cleared by explicit logout.',
                    {
                        url: originalRequest?.url,
                        method: originalRequest?.method,
                    }
                );
            }
        }
        return Promise.reject(error);
    }
);

export default axiosInstance;
