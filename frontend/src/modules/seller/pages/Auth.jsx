import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@core/context/AuthContext";
import { useSettings } from "@core/context/SettingsContext";
import { UserRole } from "@core/constants/roles";
import {
  Mail,
  Lock,
  User,
  Phone,
  ArrowRight,
  Store,
  ShoppingBag,
  TrendingUp,
  Rocket,
  Globe,
  MapPin,
  LayoutList,
  FileText,
  Upload,
  CheckCircle,
  Navigation,
} from "lucide-react";
import { toast } from "sonner";
import Lottie from "lottie-react";
import sellerAnimation from "../../../assets/INSTANT_6.json";
import { sellerApi } from "../services/sellerApi";
import MapPicker from "../../../shared/components/MapPicker";

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [signupStep, setSignupStep] = useState(1);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const { login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const appName = settings?.appName || "App";
  const logoUrl = settings?.logoUrl || "";

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    name: "",
    shopName: "",
    phone: "",
    city: "",
    state: "",
    category: "",
    description: "",
    lat: null,
    lng: null,
    radius: 5,
    address: "",
  });

  const handleLocationSelect = (location) => {
    setFormData((prev) => ({
      ...prev,
      lat: location.lat,
      lng: location.lng,
      radius: location.radius,
      address: location.address,
    }));
  };

  const [documents, setDocuments] = useState({
    tradeLicense: null,
    gstCertificate: null,
    idProof: null,
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === "name") {
      // Owner name: only alphabets and spaces
      const cleaned = value.replace(/[^a-zA-Z\s]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "email") {
      // Business email: trim leading spaces, disallow spaces inside
      const cleaned = value.replace(/\s+/g, "").toLowerCase();
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "phone") {
      // Contact number: only digits, max 10 characters
      const digitsOnly = value.replace(/[^0-9]/g, "").slice(0, 10);
      setFormData({ ...formData, [name]: digitsOnly });
    } else if (name === "city" || name === "state") {
      // City & State: only alphabets and spaces
      const cleaned = value.replace(/[^a-zA-Z\s]/g, "");
      setFormData({ ...formData, [name]: cleaned });
    } else if (name === "password") {
      // Password: only digits and alphabets, max 6 characters
      const cleaned = value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6);
      setFormData({ ...formData, [name]: cleaned });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleDocumentChange = (e, docName) => {
    setDocuments({ ...documents, [docName]: e.target.files[0] });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // For signup, simulate multi-step before actual submit
    if (!isLogin && signupStep === 1) {
      setSignupStep(2);
      return;
    }

    setIsLoading(true);

    try {
      // Basic client-side validation for signup
      if (!isLogin) {
        const email = formData.email || "";
        const phone = formData.phone || "";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          toast.error("Please enter a valid business email address.");
          setIsLoading(false);
          return;
        }
        if (!/^[0-9]{10}$/.test(phone)) {
          toast.error("Please enter a valid 10-digit contact number.");
          setIsLoading(false);
          return;
        }
      }
      // Password: exactly 6 characters, digits/alphabets only
      const pwd = (formData.password || "").trim();
      if (!/^[a-zA-Z0-9]{6}$/.test(pwd)) {
        toast.error(
          "Password must be exactly 6 characters (digits or letters only).",
        );
        setIsLoading(false);
        return;
      }
      // Note: backend expects a single address string, derive from city + state
      const address =
        formData.address ||
        (formData.city && formData.state
          ? `${formData.city}, ${formData.state}`
          : formData.city || formData.state || "");

      const signupPayload = {
        ...formData,
        address,
        lat: formData.lat,
        lng: formData.lng,
        radius: formData.radius,
      };

      const response = isLogin
        ? await sellerApi.login({
            email: formData.email,
            password: formData.password,
          })
        : await sellerApi.signup(signupPayload);

      const { token, seller } = response.data.result;

      login({
        ...seller,
        token,
        role: "seller",
      });

      toast.success(
        isLogin ? "Welcome back, Partner!" : "Account created successfully!",
      );
      navigate("/seller");
    } catch (error) {
      toast.error(error.response?.data?.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fcfaff] p-6 font-['Outfit'] overflow-hidden relative">
      {/* Elegant Ambient Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[60%] bg-slate-100/50 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-slate-50/50 rounded-full blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 w-full max-w-[1000px] min-h-[600px] bg-white rounded-lg shadow-[0_50px_120px_rgba(0,0,0,0.04)] border border-white flex flex-col md:flex-row overflow-hidden">
        {/* Visual Side Panel */}
        <div className="hidden md:flex w-[45%] bg-linear-to-br from-slate-900 via-slate-950 to-black relative flex-col items-center justify-center p-10 overflow-hidden">
          {/* Abstract Decorative Circles */}
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
            <div className="absolute bottom-0 right-0 w-96 h-96 bg-slate-500/10 rounded-full blur-3xl translate-x-1/2 translate-y-1/2" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="relative z-10 w-full flex flex-col items-center">
            {/* Lottie Animation for Seller */}
            <div className="w-full max-w-[350px] drop-shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
              <Lottie
                animationData={sellerAnimation}
                loop={true}
                className="w-full h-auto"
              />
            </div>

            <div className="mt-8 text-center space-y-4">
              <h2 className="text-2xl font-black text-white tracking-tight leading-tight uppercase underline decoration-white/20 underline-offset-8">
                Seller <span className="text-slate-600">Expansion.</span>
              </h2>
            </div>
          </motion.div>

          {/* Partner Badges */}
          <div className="absolute bottom-12 left-0 right-0 px-12 flex justify-between items-center opacity-60">
            <div className="flex items-center gap-2 text-white/80">
              <Rocket size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Growth First
              </span>
            </div>
            <div className="flex items-center gap-2 text-white/80">
              <Globe size={16} />
              <span className="text-[10px] font-black uppercase tracking-widest">
                Pan India
              </span>
            </div>
          </div>
        </div>

        {/* Form Content Side */}
        <div className="w-full md:w-[55%] p-8 md:p-12 flex flex-col justify-center bg-white overflow-y-auto max-h-[90vh] custom-scrollbar relative">
          <div className="hidden md:flex absolute top-8 right-8 z-20">
            <div className="w-20 h-20 rounded-2xl bg-slate-50 border border-slate-200 shadow-sm flex items-center justify-center overflow-hidden">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${appName} logo`}
                  className="w-14 h-14 object-contain"
                />
              ) : (
                <Store size={30} className="text-slate-700" />
              )}
            </div>
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={isLogin ? "login" : `signup-step-${signupStep}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
              className="space-y-8 my-auto">
              <div className="space-y-4">
                <span className="inline-block px-4 py-1 bg-slate-100 text-slate-800 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-200">
                  {isLogin
                    ? "Welcome Back"
                    : `New Partnership - Step ${signupStep} of 2`}
                </span>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter">
                  Seller{" "}
                  <span className="text-slate-900">
                    {isLogin ? "Login" : "Signup"}
                  </span>
                </h1>
                <p className="text-slate-600 font-medium text-base leading-relaxed">
                  {isLogin
                    ? "Access your unified seller dashboard and manage orders."
                    : signupStep === 1
                      ? "Register your store and start selling instantly."
                      : "Provide additional details and verification documents."}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* LOGIN OR SIGNUP STEP 1 */}
                {(isLogin || signupStep === 1) && (
                  <>
                    {!isLogin && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="relative group">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                            <User size={18} />
                          </div>
                          <input
                            type="text"
                            name="name"
                            required
                            placeholder="Owner Name"
                            className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                            value={formData.name}
                            onChange={handleChange}
                          />
                        </div>
                        <div className="relative group">
                          <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                            <Store size={18} />
                          </div>
                          <input
                            type="text"
                            name="shopName"
                            required
                            placeholder="Shop / Business Name"
                            className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                            value={formData.shopName}
                            onChange={handleChange}
                          />
                        </div>
                      </div>
                    )}

                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        name="email"
                        required
                        inputMode="email"
                        autoComplete="email"
                        placeholder="Business Email"
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                        value={formData.email}
                        onChange={handleChange}
                      />
                    </div>

                    {!isLogin && (
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <Phone size={18} />
                        </div>
                        <input
                          type="tel"
                          name="phone"
                          required
                          placeholder="Contact Number"
                          className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                          value={formData.phone}
                          onChange={handleChange}
                        />
                      </div>
                    )}

                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                        <Lock size={18} />
                      </div>
                      <input
                        type="password"
                        name="password"
                        required
                        minLength={6}
                        maxLength={6}
                        autoComplete="current-password"
                        placeholder="6 digit / letter PIN"
                        className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                        value={formData.password}
                        onChange={handleChange}
                      />
                    </div>
                  </>
                )}

                {/* SIGNUP STEP 2 (Extra verification & details fields) */}
                {!isLogin && signupStep === 2 && (
                  <div className="space-y-4">
                    <div className="pt-2">
                      <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">
                        Shop Location & Service Area
                      </p>
                      <button
                        type="button"
                        onClick={() => setIsMapOpen(true)}
                        className={`w-full flex items-center justify-between p-4 rounded-lg border-2 border-dashed transition-all cursor-pointer ${
                          formData.lat
                            ? "border-green-200 bg-green-50/50"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300"
                        }`}>
                        <div className="flex items-center gap-3">
                          <div
                            className={`p-2 rounded-md ${formData.lat ? "bg-green-100 text-green-600" : "bg-white text-slate-600 shadow-sm"}`}>
                            {formData.lat ? (
                              <CheckCircle className="w-4 h-4" />
                            ) : (
                              <MapPin className="w-4 h-4" />
                            )}
                          </div>
                          <div className="text-left">
                            <p
                              className={`text-xs font-bold ${formData.lat ? "text-green-700" : "text-slate-600"}`}>
                              {formData.lat
                                ? "Location Selected"
                                : "Pin Shop on Map"}
                            </p>
                            <p className="text-xs text-slate-600 font-medium truncate max-w-[250px]">
                              {formData.lat
                                ? `${formData.address} (${formData.radius}km)`
                                : "Precisely mark your shop location"}
                            </p>
                          </div>
                        </div>
                        {formData.lat && (
                          <span className="text-[10px] font-black text-green-600 bg-green-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            Verified
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <MapPin size={18} />
                        </div>
                        <input
                          type="text"
                          name="city"
                          required
                          placeholder="City"
                          className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                          value={formData.city}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="relative group">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-violet-600 transition-colors">
                          <MapPin size={18} />
                        </div>
                        <input
                          type="text"
                          name="state"
                          required
                          placeholder="State"
                          className="w-full pl-12 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-lg text-sm font-bold text-slate-700 outline-none focus:bg-white focus:border-slate-200 transition-all placeholder:text-slate-300"
                          value={formData.state}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <p className="text-sm font-black text-slate-600 uppercase tracking-widest mb-3">
                        Verification Documents
                      </p>
                      <div className="space-y-3">
                        {[
                          { label: "Trade License", id: "tradeLicense" },
                          { label: "GST Certificate", id: "gstCertificate" },
                          { label: "ID Proof", id: "idProof" },
                        ].map((doc) => (
                          <div key={doc.id} className="relative">
                            <input
                              type="file"
                              id={doc.id}
                              className="hidden"
                              accept="image/*,.pdf"
                              onChange={(e) => handleDocumentChange(e, doc.id)}
                            />
                            <label
                              htmlFor={doc.id}
                              className={`flex items-center justify-between p-3.5 rounded-lg border-2 border-dashed transition-all cursor-pointer ${
                                documents[doc.id]
                                  ? "border-green-200 bg-green-50/50"
                                  : "border-slate-200 bg-slate-50 hover:border-slate-300"
                              }`}>
                              <div className="flex items-center gap-3">
                                <div
                                  className={`p-2 rounded-md ${documents[doc.id] ? "bg-green-100 text-green-600" : "bg-white text-slate-600 shadow-sm"}`}>
                                  {documents[doc.id] ? (
                                    <CheckCircle className="w-4 h-4" />
                                  ) : (
                                    <Upload className="w-4 h-4" />
                                  )}
                                </div>
                                <div className="text-left">
                                  <p
                                    className={`text-xs font-bold ${documents[doc.id] ? "text-green-700" : "text-slate-600"}`}>
                                    {doc.label}
                                  </p>
                                  <p className="text-xs text-slate-600 font-medium truncate max-w-[150px]">
                                    {documents[doc.id]
                                      ? documents[doc.id].name
                                      : "Upload secure PDF or image"}
                                  </p>
                                </div>
                              </div>
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  {!isLogin && signupStep === 2 && (
                    <button
                      type="button"
                      onClick={() => setSignupStep(1)}
                      className="w-1/3 bg-slate-100 text-slate-600 rounded-lg py-4 text-sm font-black tracking-[2px] transition-all hover:bg-slate-200">
                      BACK
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className={`${!isLogin && signupStep === 2 ? "w-2/3" : "w-full"} bg-slate-900 text-white rounded-lg py-4 text-sm font-black tracking-[2px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.3)] hover:bg-black transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 group`}>
                    {isLoading
                      ? "WORKING..."
                      : isLogin
                        ? "ENTER DASHBOARD"
                        : signupStep === 1
                          ? "NEXT STEP"
                          : "SUBMIT APPLICATION"}
                    <ArrowRight
                      className="group-hover:translate-x-2 transition-transform"
                      size={20}
                    />
                  </button>
                </div>
              </form>

              <div className="pt-6 border-t border-slate-50 flex flex-col items-center gap-4">
                <p className="text-slate-600 font-bold text-sm">
                  {isLogin ? "New to the platform?" : "Already part of us?"}{" "}
                  <button
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setSignupStep(1);
                    }}
                    className="text-slate-900 hover:text-black transition-colors px-2">
                    {isLogin ? "Register Store" : "Sign In"}
                  </button>
                </p>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Bottom Tagline */}
      <div className="absolute bottom-6 flex items-center gap-4 text-slate-300 text-[10px] font-black uppercase tracking-[6px]">
        Empowering Business Digitalization
      </div>

      {isMapOpen && (
        <MapPicker
          isOpen={isMapOpen}
          onClose={() => setIsMapOpen(false)}
          onConfirm={handleLocationSelect}
          initialLocation={
            formData.lat ? { lat: formData.lat, lng: formData.lng } : null
          }
          initialRadius={formData.radius}
        />
      )}
    </div>
  );
};

export default Auth;
