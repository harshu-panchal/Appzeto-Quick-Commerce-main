import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import DeliveryLayout from "../layout/DeliveryLayout";
import Splash from "../pages/Splash";
import DeliveryAuth from "../pages/DeliveryAuth";
import Dashboard from "../pages/Dashboard";
import OrderDetails from "../pages/OrderDetails";
import Navigation from "../pages/Navigation";
import DeliveryConfirmation from "../pages/DeliveryConfirmation";
import EarningsPage from "../pages/EarningsPage";
import CodCash from "../pages/CodCash";
import OrderHistory from "../pages/OrderHistory";
import Profile from "../pages/Profile";
import PersonalDetails from "../pages/profile/PersonalDetails";
import VehicleInfo from "../pages/profile/VehicleInfo";
import BankAccount from "../pages/profile/BankAccount";
import Documents from "../pages/profile/Documents";
import SafetyPrivacy from "../pages/profile/SafetyPrivacy";
import Settings from "../pages/profile/Settings";
import HelpSupport from "../pages/profile/HelpSupport";
import Withdrawals from "../pages/profile/Withdrawals";
import Notifications from "../pages/Notifications";

const DeliveryRoutes = () => {
  return (
    <Routes>
      <Route element={<DeliveryLayout />}>
        <Route path="splash" element={<Splash />} />

        <Route path="auth" element={<DeliveryAuth />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="order-details/:orderId" element={<OrderDetails />} />
        <Route path="navigation" element={<Navigation />} />
        <Route path="confirm-delivery/:orderId" element={<DeliveryConfirmation />} />
        <Route path="earnings" element={<EarningsPage />} />
        <Route path="cod-cash" element={<CodCash />} />
        <Route path="history" element={<OrderHistory />} />
        <Route path="profile" element={<Profile />} />
        <Route path="profile/personal-details" element={<PersonalDetails />} />
        <Route path="profile/vehicle-info" element={<VehicleInfo />} />
        <Route path="profile/bank-account" element={<BankAccount />} />
        <Route path="profile/documents" element={<Documents />} />
        <Route path="profile/safety-privacy" element={<SafetyPrivacy />} />
        <Route path="profile/settings" element={<Settings />} />
        <Route path="profile/help-support" element={<HelpSupport />} />
        <Route path="profile/withdrawals" element={<Withdrawals />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="/" element={<Navigate to="dashboard" replace />} />
      </Route>
    </Routes>
  );
};

export default DeliveryRoutes;
