import React, { useEffect } from 'react';
import Header from './Header';
import Footer from './Footer';
import BottomNav from './BottomNav';
import MiniCart from '../shared/MiniCart';
import ProductDetailSheet from '../shared/ProductDetailSheet';
import MobileFooterMessage from './MobileFooterMessage';
import { useProductDetail } from '../../context/ProductDetailContext';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@core/context/AuthContext';
import { onReturnPickupOtp, onReturnDropOtp } from '@core/services/orderSocket';
import { toast } from 'sonner';
import { ShieldCheck, Package } from 'lucide-react';

const CustomerLayout = ({ children, showHeader: showHeaderProp, fullHeight = false, showCart: showCartProp, showBottomNav: showBottomNavProp }) => {
    const location = useLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();
    const { user, token } = useAuth();

    // Listen for Return OTPs (Real-time Alert for Customer)
    useEffect(() => {
        if (!token || !user) return;

        const cleanupPickup = onReturnPickupOtp(() => token, (payload) => {
            console.log('[CustomerLayout] Return Pickup OTP Received:', payload);
            toast.custom((t) => (
                <div className="bg-white border-2 border-brand-600 rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-full duration-500 max-w-md w-full">
                    <div className="flex items-start gap-4">
                        <div className="h-12 w-12 bg-brand-100 rounded-2xl flex items-center justify-center text-brand-600 shrink-0">
                            <ShieldCheck size={28} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">Return Pickup OTP</h3>
                            <p className="text-sm text-slate-500 font-medium mb-3">
                                Share this code with the delivery partner to confirm your return pickup.
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="text-3xl font-black tracking-[0.2em] text-brand-600 bg-brand-50 px-4 py-2 rounded-xl border border-brand-100">
                                    {payload.otp}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ), { duration: 15000, position: 'top-center' });
        });

        const cleanupDrop = onReturnDropOtp(() => token, (payload) => {
            console.log('[CustomerLayout] Return Drop OTP Received:', payload);
            toast.custom((t) => (
                <div className="bg-white border-2 border-green-600 rounded-3xl p-5 shadow-2xl animate-in slide-in-from-bottom-full duration-500 max-w-md w-full">
                    <div className="flex items-start gap-4">
                        <div className="h-12 w-12 bg-green-100 rounded-2xl flex items-center justify-center text-green-600 shrink-0">
                            <Package size={28} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">Return Received Alert</h3>
                            <p className="text-sm text-slate-500 font-medium mb-3">
                                Use this code to confirm that your return has reached the seller.
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="text-3xl font-black tracking-[0.2em] text-green-600 bg-green-50 px-4 py-2 rounded-xl border border-green-100">
                                    {payload.otp}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ), { duration: 15000, position: 'top-center' });
        });

        return () => {
            cleanupPickup();
            cleanupDrop();
        };
    }, [token, user]);

    // Route-based visibility logic
    const path = location.pathname.replace(/\/$/, '') || '/';

    const hideHeaderRoutes = ['/', '/categories', '/orders', '/transactions', '/profile', '/profile/edit', '/wishlist', '/addresses', '/wallet', '/support', '/privacy', '/about', '/terms', '/checkout', '/search', '/chat'];
    const hideBottomNavRoutes = ['/checkout', '/search', '/chat'];
    const hideCartRoutes = ['/checkout', '/search', '/chat'];

    // If props are passed, use them. Otherwise, use route-based logic.
    const showHeader = showHeaderProp !== undefined ? showHeaderProp : (!hideHeaderRoutes.includes(path) && !path.startsWith('/category') && !path.startsWith('/orders'));
    const showBottomNav = showBottomNavProp !== undefined ? showBottomNavProp : !hideBottomNavRoutes.includes(path);
    const showCart = showCartProp !== undefined ? showCartProp : (!hideCartRoutes.includes(path) && !path.startsWith('/orders'));

    // Condition to hide the MobileFooterMessage ("India's last minute app") on specific pages
    const hideFooterMessageRoutes = ['/profile', '/profile/edit'];
    const showFooterMessage = showBottomNav && !hideFooterMessageRoutes.includes(path) && !path.startsWith('/category');

    // Hide elements on mobile only when product detail is open
    // On desktop, we want to keep the header visible even if the modal is open
    const finalShowHeaderMobile = showHeader && !isProductDetailOpen;
    const finalShowBottomNavMobile = showBottomNav && !isProductDetailOpen;
    const finalShowFooterMessageMobile = showFooterMessage && !isProductDetailOpen;

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
            {/* Header logic: Always show on desktop if showHeader is true. On mobile, hide if product detail is open. */}
            {showHeader && (
                <>
                    <div className="hidden md:block">
                        <Header />
                    </div>
                    {finalShowHeaderMobile && (
                        <div className="block md:hidden">
                            <Header />
                        </div>
                    )}
                </>
            )}

            <main className={cn("flex-1 md:pb-0", !showHeader && "pt-0", !fullHeight && "pb-16")}>
                {children}
            </main>

            {showCart && <MiniCart />}
            <ProductDetailSheet />

            <div className="hidden md:block">
                <Footer />
            </div>

            {/* Mobile Footer Message logic */}
            <div className="md:hidden">
                {finalShowFooterMessageMobile && <MobileFooterMessage />}
            </div>

            {/* Bottom Nav logic */}
            <div className="md:hidden">
                {finalShowBottomNavMobile && <BottomNav />}
            </div>
            {/* Desktop Bottom Nav doesn't exist usually, but just in case of future changes */}
            <div className="hidden md:block">
                {showBottomNav && <BottomNav />}
            </div>
        </div>
    );
};

export default CustomerLayout;
