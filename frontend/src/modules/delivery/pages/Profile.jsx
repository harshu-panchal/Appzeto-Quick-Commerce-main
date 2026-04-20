import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Phone,
  Truck,
  CreditCard,
  FileText,
  HelpCircle,
  LogOut,
  ChevronRight,
  Shield,
  Bell,
  Settings,
  IndianRupee,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { motion } from "framer-motion";
import Button from "@/shared/components/ui/Button";
import Card from "@/shared/components/ui/Card";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import axiosInstance from '@core/api/axios';
import { useEffect } from 'react';

const Profile = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { settings } = useSettings();
  const appName = settings?.appName || "App";
  const [faqs, setFaqs] = useState([]);

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const response = await axiosInstance.get('/public/faqs', { params: { category: 'Delivery', status: 'published' } });
        setFaqs(response.data.results || []);
      } catch (error) {
        console.error("Error fetching FAQs:", error);
      }
    };
    fetchFaqs();
  }, []);

  const menuItems = [
    {
      icon: User,
      label: "Personal Details",
      sub: "Name, Address, Email",
      color: "text-brand-600 bg-brand-50",
      path: "/delivery/profile/personal-details",
    },
    {
      icon: Truck,
      label: "Vehicle Information",
      sub: "Bike, License, Insurance",
      color: "text-orange-600 bg-orange-50",
      path: "/delivery/profile/vehicle-info",
    },
    {
      icon: CreditCard,
      label: "Bank Account",
      sub: "HDFC Bank **** 8921",
      color: "text-brand-600 bg-brand-50",
      path: "/delivery/profile/bank-account",
    },
    {
      icon: IndianRupee,
      label: "Money Request",
      sub: "Withdraw your earnings",
      color: "text-brand-600 bg-brand-50",
      path: "/delivery/profile/withdrawals",
    },
    {
      icon: FileText,
      label: "Documents",
      sub: "Aadhar, PAN, DL (Verified)",
      color: "text-purple-600 bg-purple-50",
      path: "/delivery/profile/documents",
    },
    {
      icon: Shield,
      label: "Safety & Privacy",
      sub: "Emergency contacts, App permissions",
      color: "text-red-600 bg-red-50",
      path: "/delivery/profile/safety-privacy",
    },
    {
      icon: Settings,
      label: "Settings",
      sub: "Notifications, Language, Theme",
      color: "text-gray-600 bg-gray-50",
      path: "/delivery/profile/settings",
    },
    {
      icon: HelpCircle,
      label: "Help & Support",
      sub: "FAQs, Chat support",
      color: "text-teal-600 bg-teal-50",
      path: "/delivery/profile/help-support",
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.05 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 },
  };

  return (
    <div className="bg-gray-50/50 min-h-screen pb-24">
      {/* Header */}
      <div className="bg-primary pt-12 pb-24 px-6 rounded-b-[2.5rem] relative shadow-lg">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-white text-2xl font-bold">My Profile</h1>
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => toast.info("No new notifications")}>
            <Bell size={24} />
          </Button>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative">
            <div className="w-20 h-20 bg-white rounded-full p-1 shadow-lg">
              <img
                src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix"
                alt="Profile"
                className="w-full h-full rounded-full object-cover bg-gray-100"
              />
            </div>
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-brand-500 border-2 border-white rounded-full"></div>
          </div>
          <div className="text-white">
            <h2 className="font-bold text-xl">Rahul Kumar</h2>
            <p className="text-white/80 text-sm flex items-center mb-1">
              <Phone size={14} className="mr-1" /> +91 98765 43210
            </p>
            <div className="flex items-center space-x-2">
              <span className="bg-white/20 px-2 py-0.5 rounded text-xs font-medium backdrop-blur-sm">
                ID: 882190
              </span>
              <span className="bg-brand-500 text-primary-foreground px-2 py-0.5 rounded text-xs font-bold shadow-sm">
                VERIFIED
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Card */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="mx-6 -mt-12 bg-white rounded-2xl p-4 shadow-xl mb-6 flex justify-between text-center relative z-10">
        <div className="flex-1">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
            Joined
          </p>
          <p className="font-bold text-gray-900 text-lg">Jan '24</p>
        </div>
        <div className="w-px bg-gray-100"></div>
        <div className="flex-1">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
            Trips
          </p>
          <p className="font-bold text-gray-900 text-lg">1,240</p>
        </div>
        <div className="w-px bg-gray-100"></div>
        <div className="flex-1">
          <p className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">
            Rating
          </p>
          <p className="font-bold text-gray-900 text-lg flex justify-center items-center">
            4.8 <span className="text-yellow-400 text-sm ml-1">★</span>
          </p>
        </div>
      </motion.div>

      {/* Menu Options */}
      <motion.div
        className="px-6 space-y-3 max-w-lg mx-auto"
        variants={containerVariants}
        initial="hidden"
        animate="visible">
        {menuItems.map((item, index) => (
          <motion.button
            key={index}
            variants={itemVariants}
            className="w-full bg-white p-4 rounded-xl shadow-sm flex items-center justify-between hover:bg-gray-50 hover:shadow-md transition-all group"
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate(item.path)}>
            <div className="flex items-center">
              <div
                className={`p-3 rounded-full mr-4 transition-colors ${item.color}`}>
                <item.icon size={20} />
              </div>
              <div className="text-left">
                <p className="font-bold text-gray-900 group-hover:text-primary transition-colors">
                  {item.label}
                </p>
                <p className="text-xs text-gray-400">{item.sub}</p>
              </div>
            </div>
            <ChevronRight
              size={20}
              className="text-gray-300 group-hover:text-primary transition-colors"
            />
          </motion.button>
        ))}

        {/* FAQ Section */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 overflow-hidden">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 px-2">Delivery Partner FAQs</p>
          <div className="divide-y divide-gray-50">
            {faqs.length > 0 ? (
              faqs.map((faq) => (
                <DeliveryFAQItem
                  key={faq._id}
                  question={faq.question}
                  answer={faq.answer}
                />
              ))
            ) : (
              <div className="py-4 text-center text-xs text-gray-400">No FAQs available</div>
            )}
          </div>
        </div>

        <motion.div variants={itemVariants} className="pt-4">
          <Button
            onClick={logout}
            variant="outline"
            className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 py-6">
            <LogOut size={20} className="mr-2" /> Logout
          </Button>
        </motion.div>
      </motion.div>

      <div className="text-center text-gray-400 text-xs mt-8 pb-4">
        {appName} Delivery Partner App
        <br />
        Version 1.2.0 (Build 450)
      </div>
    </div>
  );
};

const DeliveryFAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="py-4 px-2 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-700">{question}</h3>
        {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </div>
      {isOpen && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 text-xs text-gray-500 font-medium leading-relaxed"
        >
          {answer}
        </motion.p>
      )}
    </div>
  );
};

export default Profile;
