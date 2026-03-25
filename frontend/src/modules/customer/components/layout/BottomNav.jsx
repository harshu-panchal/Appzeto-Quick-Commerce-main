import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, LayoutGrid, ShoppingBag, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

const navItems = [
    { label: 'Home', icon: Home, path: '/' },
    { label: 'Category', icon: LayoutGrid, path: '/categories' },
    { label: 'Orders', icon: ShoppingBag, path: '/orders' },
    { label: 'Profile', icon: User, path: '/profile' },
];

const BottomNav = () => {
    const location = useLocation();

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[500] bg-white border-t border-gray-100 flex items-center justify-around h-[70px] md:hidden shadow-[0_-8px_30px_rgba(0,0,0,0.06)] px-4 pb-[env(safe-area-inset-bottom)]">
            {navItems.map((item) => {
                const isActive = location.pathname === item.path ||
                    (item.path !== '/' && location.pathname.startsWith(item.path));

                return (
                    <Link
                        key={item.path}
                        to={item.path}
                        className="flex-1 flex flex-col items-center justify-center h-full relative group transition-all"
                    >
                        <div className="flex flex-col items-center justify-center relative">
                            {/* Active Indicator Background (Subtle Glow) */}
                            <AnimatePresence>
                                {isActive && (
                                    <motion.div
                                        layoutId="activeTab"
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.8 }}
                                        className="absolute -inset-y-2 -inset-x-4 bg-[#0c831f]/5 rounded-[20px] -z-10"
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                    />
                                )}
                            </AnimatePresence>

                            <motion.div
                                animate={{
                                    y: isActive ? -2 : 0,
                                    scale: isActive ? 1.1 : 1
                                }}
                                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                            >
                                <item.icon
                                    size={24}
                                    strokeWidth={isActive ? 2.5 : 2}
                                    className={cn(
                                        "transition-colors duration-300",
                                        isActive ? "text-[#0c831f]" : "text-gray-400"
                                    )}
                                />
                            </motion.div>

                            <motion.span
                                animate={{
                                    y: isActive ? 1 : 0
                                }}
                                className={cn(
                                    "text-[10px] font-bold tracking-tight mt-1 transition-colors duration-300",
                                    isActive ? "text-[#0c831f]" : "text-gray-400"
                                )}
                            >
                                {item.label}
                            </motion.span>
                        </div>

                        {/* Top Accent Line for Active State */}
                        {isActive && (
                            <motion.div
                                layoutId="topLine"
                                className="absolute -top-[1px] w-8 h-[3px] bg-[#0c831f] rounded-full"
                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            />
                        )}
                    </Link>
                );
            })}
        </div>
    );
};

export default BottomNav;
