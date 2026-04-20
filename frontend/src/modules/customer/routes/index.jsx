import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import CategoriesPage from '../pages/CategoriesPage';
import CategoryProductsPage from '../pages/CategoryProductsPage';
import WishlistPage from '../pages/WishlistPage';
import CartPage from '../pages/CartPage';
import OffersPage from '../pages/OffersPage';
import ProfilePage from '../pages/ProfilePage';
import OrdersPage from '../pages/OrdersPage';
import OrderTransactionsPage from '../pages/OrderTransactionsPage';
import AddressesPage from '../pages/AddressesPage';
import SettingsPage from '../pages/SettingsPage';
import SupportPage from '../pages/SupportPage';
import ChatPage from '../pages/ChatPage';
import TermsPage from '../pages/TermsPage';
import PrivacyPage from '../pages/PrivacyPage';
import AboutPage from '../pages/AboutPage';
import EditProfilePage from '../pages/EditProfilePage';
import OrderDetailPage from '../pages/OrderDetailPage';
import ProductDetailPage from '../pages/ProductDetailPage';
import CheckoutPage from '../pages/CheckoutPage';
import PaymentStatusPage from '../pages/PaymentStatusPage';
import ScrollToTop from '../components/shared/ScrollToTop';
import { WishlistProvider } from '../context/WishlistContext';
import { CartProvider } from '../context/CartContext';
import { CartAnimationProvider } from '../context/CartAnimationContext';
import { LocationProvider } from '../context/LocationContext';

import ProtectedRoute from '../../../core/guards/ProtectedRoute';

const CustomerRoutes = () => {
    return (
        <LocationProvider>
            <WishlistProvider>
                <CartProvider>
                    <CartAnimationProvider>
                        <ScrollToTop />
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="categories" element={<CategoriesPage />} />
                            <Route path="category/:categoryName" element={<CategoryProductsPage />} />
                            <Route path="product/:id" element={<ProductDetailPage />} />
                            <Route path="terms" element={<TermsPage />} />
                            <Route path="privacy" element={<PrivacyPage />} />
                            <Route path="about" element={<AboutPage />} />
                            <Route path="offers" element={<OffersPage />} />

                            {/* Protected Customer Routes */}
                            <Route path="wishlist" element={<ProtectedRoute><WishlistPage /></ProtectedRoute>} />
                            <Route path="orders" element={<ProtectedRoute><OrdersPage /></ProtectedRoute>} />
                            <Route path="orders/:orderId" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
                            <Route path="transactions" element={<ProtectedRoute><OrderTransactionsPage /></ProtectedRoute>} />
                            <Route path="addresses" element={<ProtectedRoute><AddressesPage /></ProtectedRoute>} />
                            <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                            <Route path="support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
                            <Route path="chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
                            <Route path="checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
                            <Route path="payment-status" element={<ProtectedRoute><PaymentStatusPage /></ProtectedRoute>} />
                            <Route path="profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                            <Route path="profile/edit" element={<ProtectedRoute><EditProfilePage /></ProtectedRoute>} />
                        </Routes>
                    </CartAnimationProvider>
                </CartProvider>
            </WishlistProvider>
        </LocationProvider>
    );
};

export default CustomerRoutes;
