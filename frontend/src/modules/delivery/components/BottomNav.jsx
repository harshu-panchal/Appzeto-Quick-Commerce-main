import React from "react";
import { NavLink } from "react-router-dom";
import { Home, IndianRupee, History, User } from "lucide-react";
import { motion } from "framer-motion";

const BottomNav = () => {
  const navItems = [
    { path: "/delivery/dashboard", label: "Home", icon: Home },
    { path: "/delivery/earnings", label: "Earnings", icon: IndianRupee },
    { path: "/delivery/history", label: "History", icon: History },
    { path: "/delivery/profile", label: "Profile", icon: User },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-gray-200/50 py-2 px-6 flex justify-between items-center z-40 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)] max-w-md mx-auto">
      {navItems.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `relative flex flex-col items-center justify-center space-y-1 w-full h-14 transition-colors duration-300 ${
              isActive ? "text-primary" : "text-gray-400 hover:text-gray-600"
            }`
          }>
          {({ isActive }) => (
            <>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-2 w-8 h-1 bg-primary rounded-full"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <motion.div
                animate={{ scale: isActive ? 1.1 : 1, y: isActive ? -2 : 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}>
                <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
              </motion.div>
              <span
                className={`text-[10px] font-bold ${isActive ? "opacity-100" : "opacity-80"}`}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
};

export default BottomNav;
