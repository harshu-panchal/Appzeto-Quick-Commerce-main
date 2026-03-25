import React from 'react';
import Header from './Header';
import Footer from './Footer';
import BottomNav from './BottomNav';
import MiniCart from '../shared/MiniCart';
import ProductDetailSheet from '../shared/ProductDetailSheet';
import MobileFooterMessage from './MobileFooterMessage';
import { useProductDetail } from '../../context/ProductDetailContext';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';

const CustomerLayout = ({ children, showHeader: showHeaderProp, fullHeight = false, showCart: showCartProp, showBottomNav: showBottomNavProp }) => {
    const location = useLocation();
    const { isOpen: isProductDetailOpen } = useProductDetail();

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
