import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import Lottie from "lottie-react";
import { useCart } from "../context/CartContext";
import { useAuth } from "../../../core/context/AuthContext";
import { useWishlist } from "../context/WishlistContext";
import { customerApi } from "../services/customerApi";
import { useLocation as useAppLocation } from "../context/LocationContext";
import {
  MapPin,
  Clock,
  CreditCard,
  Banknote,
  ChevronRight,
  ChevronLeft,
  Share2,
  Gift,
  ShoppingBag,
  ChevronDown,
  ChevronUp,
  Heart,
  Truck,
  Tag,
  Sparkles,
  Plus,
  Minus,
  Search,
  X,
  Clipboard,
  Check,
  Contact2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@shared/components/ui/Toast";
import { useSettings } from "@core/context/SettingsContext";
import SlideToPay from "../components/shared/SlideToPay";
import { getCachedGeocode, setCachedGeocode } from "@/core/utils/geocodeCache";
import {
  getOrderSocket,
  joinOrderRoom,
  leaveOrderRoom,
  onOrderStatusUpdate,
} from "@/core/services/orderSocket";
import ProductCard from "../components/shared/ProductCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import emptyBoxAnimation from "../../../assets/lottie/Empty box.json";

const CheckoutPage = () => {
  const {
    cart,
    addToCart,
    cartTotal,
    cartCount,
    updateQuantity,
    removeFromCart,
    clearCart,
  } = useCart();
  const { wishlist, addToWishlist, fetchFullWishlist, isFullDataFetched } =
    useWishlist();
  const { showToast } = useToast();
  const { user, isAuthenticated } = useAuth();
  const { settings } = useSettings();

  // Fetch full wishlist data if not already fetched
  useEffect(() => {
    if (isAuthenticated && !isFullDataFetched) {
      fetchFullWishlist();
    }
  }, [isAuthenticated, isFullDataFetched, fetchFullWishlist]);

  const appName = settings?.appName || "App";
  const {
    savedAddresses: locationSavedAddresses,
    currentLocation,
    refreshLocation,
    isFetchingLocation,
    updateLocation,
  } = useAppLocation();
  const navigate = useNavigate();

  // State management
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("now");
  const [selectedPayment, setSelectedPayment] = useState("cash");
  const [selectedTip, setSelectedTip] = useState(0);
  const [showAllCartItems, setShowAllCartItems] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState(null);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [isResolvingAddressCoords, setIsResolvingAddressCoords] = useState(false);
  const [isCouponModalOpen, setIsCouponModalOpen] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [orderId, setOrderId] = useState(null);
  const [pricingPreview, setPricingPreview] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const postOrderNavigateRef = useRef(null);
  const [currentAddress, setCurrentAddress] = useState({
    type: "Home",
    name: "Harshvardhan Panchal",
    address: "81 Pipliyahana Road, Near 214",
    landmark: "",
    city: "Indore - 452018",
    phone: "6268423925",
  });
  const [isEditAddressOpen, setIsEditAddressOpen] = useState(false);
  const [editAddressForm, setEditAddressForm] = useState({
    type: "Home",
    name: "Harshvardhan Panchal",
    address: "81 Pipliyahana Road, Near 214",
    landmark: "",
    city: "Indore - 452018",
    phone: "6268423925",
  });
  const [showRecipientForm, setShowRecipientForm] = useState(false);
  const [recipientData, setRecipientData] = useState({
    // city: 'Select city',
    completeAddress: "",
    landmark: "",
    pincode: "",
    name: "",
    phone: "",
  });
  const [savedRecipient, setSavedRecipient] = useState(null);

  // Mock data for recommendations
  const recommendedProducts = [
    {
      id: 101,
      name: "Uncle Chips",
      price: 20,
      image:
        "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=200",
    },
    {
      id: 102,
      name: "Lay's Chips",
      price: 20,
      image:
        "https://images.unsplash.com/photo-1566478989037-eec170784d0b?w=200",
    },
    {
      id: 103,
      name: "Bread",
      price: 35,
      image:
        "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=200",
    },
  ];

  const [coupons, setCoupons] = useState([]);
  const [manualCode, setManualCode] = useState("");

  const deliveryAddress = {
    type: "Home",
    name: "John Doe",
    address: "Flat 402, Sunshine Apartments, Sector 12, Dwarka",
    city: "New Delhi - 110075",
  };

  const timeSlots = [
    { id: "now", label: "Now", sublabel: "10-15 min" },
    { id: "30min", label: "30 min", sublabel: "Standard" },
    { id: "1hour", label: "1 hour", sublabel: "Scheduled" },
    { id: "2hours", label: "2 hours", sublabel: "Scheduled" },
  ];

  const paymentMethods = [
    ...(settings?.onlineEnabled === false
      ? []
      : [
          {
            id: "online",
            label: "Pay Online",
            icon: CreditCard,
            sublabel: "UPI / Cards / NetBanking",
          },
        ]),
    ...(settings?.codEnabled === false
      ? []
      : [
          {
            id: "cash",
            label: "Cash on Delivery",
            icon: Banknote,
            sublabel: "Pay after delivery",
          },
        ]),
  ];

  const tipAmounts = [
    { value: 0, label: "No Tip" },
    { value: 10, label: "₹10" },
    { value: 20, label: "₹20" },
    { value: 30, label: "₹30" },
  ];

  const deliveryFee = pricingPreview?.deliveryFeeCharged || 0;
  const handlingFee = pricingPreview?.handlingFeeCharged || 0;
  const taxAmount = pricingPreview?.taxTotal || 0;
  const discountAmount = selectedCoupon
    ? selectedCoupon.discountAmount || selectedCoupon.discount || 0
    : 0;
  const totalAmount = pricingPreview?.grandTotal || 0;

  const displayCartItems = showAllCartItems ? cart : cart;

  const RECIPIENT_STORAGE_KEY = "appzeto_checkout_recipient_v1";

  // Derived display values for primary delivery card
  const displayName = savedRecipient?.name || currentAddress.name;
  const displayPhone =
    savedRecipient?.phone || currentAddress.phone || "6268423925";
  const displayAddress = savedRecipient
    ? `${savedRecipient.completeAddress}${savedRecipient.landmark ? `, ${savedRecipient.landmark}` : ""}${savedRecipient.pincode ? ` - ${savedRecipient.pincode}` : ""}`
    : `${currentAddress.address}${currentAddress.landmark ? `, ${currentAddress.landmark}` : ""}, ${currentAddress.city}`;

  useEffect(() => {
    if (!paymentMethods.length) return;
    const exists = paymentMethods.some((method) => method.id === selectedPayment);
    if (!exists) {
      setSelectedPayment(paymentMethods[0].id);
    }
  }, [paymentMethods, selectedPayment]);

  const buildAddressForOrder = () => {
    if (savedRecipient) {
      return {
        type: "Other",
        name: savedRecipient.name,
        address: savedRecipient.completeAddress,
        landmark: savedRecipient.landmark || "",
        city: savedRecipient.pincode ? `${savedRecipient.pincode}` : "",
        phone: savedRecipient.phone,
        location:
          currentLocation?.latitude && currentLocation?.longitude
            ? { lat: currentLocation.latitude, lng: currentLocation.longitude }
            : undefined,
      };
    }

    const addrLoc = currentAddress?.location;
    const hasAddrLoc =
      addrLoc &&
      typeof addrLoc.lat === "number" &&
      typeof addrLoc.lng === "number" &&
      Number.isFinite(addrLoc.lat) &&
      Number.isFinite(addrLoc.lng);

    return {
      ...currentAddress,
      location:
        // Important: delivery fee must be based on the selected delivery address,
        // not the device's last detected location (which can be stale).
        hasAddrLoc ? { lat: addrLoc.lat, lng: addrLoc.lng } : undefined,
    };
  };

  const handleSaveRecipient = () => {
    if (
      !recipientData.completeAddress ||
      !recipientData.name ||
      recipientData.phone.length !== 10
    ) {
      showToast("Please fill all required fields", "error");
      return;
    }
    setSavedRecipient(recipientData);
    setShowRecipientForm(false);
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          RECIPIENT_STORAGE_KEY,
          JSON.stringify(recipientData),
        );
      }
    } catch {
      // ignore storage errors
    }
    showToast("Recipient details saved!", "success");
  };

  const handleMoveToWishlist = (item) => {
    addToWishlist(item);
    removeFromCart(item.id);
    showToast(`${item.name} moved to wishlist`, "success");
  };

  const handleOpenEditAddress = () => {
    setEditAddressForm(currentAddress);
    setIsEditAddressOpen(true);
  };

  const isValidLatLng = (loc) =>
    loc &&
    typeof loc.lat === "number" &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng);

  const resolveAddressCoords = async (addressText) => {
    const q = String(addressText || "").trim();
    if (!q) return null;

    // Prefer placeId resolution if the current address has one (more reliable than text geocode).
    // Note: This helper is called with raw address text; placeId resolution happens in caller when available.
    const cacheKey = `addr:${q}`;
    const cached = getCachedGeocode(cacheKey);
    if (cached?.location?.lat && cached?.location?.lng) {
      return cached.location;
    }

    // Prefer backend geocoding (server key) so billing is controlled centrally.
    try {
      const resp = await customerApi.geocodeAddress(q);
      const loc = resp.data?.result?.location;
      if (isValidLatLng(loc)) {
        setCachedGeocode(cacheKey, { location: { lat: loc.lat, lng: loc.lng } });
        return { lat: loc.lat, lng: loc.lng };
      }
    } catch (e) {
      const serverMsg =
        e?.response?.data?.message ||
        e?.response?.data?.error?.message ||
        e?.message ||
        null;
      // Bubble up a helpful message for UI.
      const err = new Error(serverMsg || "Could not geocode address");
      err.__serverMsg = serverMsg;
      throw err;
    }

    return null;
  };

  const handleSelectSavedAddress = async (addr) => {
    const rawText = addr?.address || "";
    const addrLoc = addr?.location;
    const hasLoc = isValidLatLng(addrLoc);
    const pid = typeof addr?.placeId === "string" ? addr.placeId.trim() : "";

    setIsResolvingAddressCoords(true);
    try {
      let resolvedLoc = null;
      try {
        if (hasLoc) {
          resolvedLoc = addrLoc;
        } else if (pid) {
          const cacheKey = `pid:${pid}`;
          const cached = getCachedGeocode(cacheKey);
          if (cached?.location?.lat && cached?.location?.lng) {
            resolvedLoc = cached.location;
          } else {
            const resp = await customerApi.geocodePlaceId(pid);
            const loc = resp.data?.result?.location;
            if (isValidLatLng(loc)) {
              resolvedLoc = { lat: loc.lat, lng: loc.lng };
              setCachedGeocode(cacheKey, { location: resolvedLoc });
            }
          }
        } else {
          resolvedLoc = await resolveAddressCoords(rawText);
        }
      } catch (e) {
        showToast(
          e?.__serverMsg ||
            e?.message ||
            "Could not fetch coordinates for this address. Delivery charges may not update.",
          "error",
        );
      }

      // Don't proceed with a stale location; keep the modal open so the user can pick/edit again.
      if (!resolvedLoc) {
        showToast(
          "Could not fetch coordinates for this address. Please edit the address or choose a different one.",
          "error",
        );
        return;
      }

      setCurrentAddress({
        type: addr.label,
        name: user?.name || currentAddress.name,
        address: rawText,
        city: "", // already part of addr.address string
        phone: addr.phone || currentAddress.phone,
        landmark: "", // already baked into addr.address if present
        ...(pid ? { placeId: pid } : {}),
        ...(resolvedLoc ? { location: resolvedLoc } : {}),
      });

      if (resolvedLoc) {
        updateLocation(
          {
            name: rawText,
            time: currentLocation?.time || "12-15 mins",
            city: currentLocation?.city,
            state: currentLocation?.state,
            pincode: currentLocation?.pincode,
            latitude: resolvedLoc.lat,
            longitude: resolvedLoc.lng,
          },
          { persist: true, updateSavedHome: false },
        );
      }

      setIsAddressModalOpen(false);
    } finally {
      setIsResolvingAddressCoords(false);
    }
  };

  const handleSaveEditedAddress = async () => {
    if (
      !editAddressForm.name.trim() ||
      !editAddressForm.address.trim() ||
      !editAddressForm.city.trim()
    ) {
      showToast("Please fill name, address and city", "error");
      return;
    }

    // Best-effort forward geocode so delivery pricing uses the edited address (not stale device coords).
    let location = null;
    let placeId = null;
    let formattedAddress = null;
    try {
      const query = [
        editAddressForm.address,
        editAddressForm.landmark,
        editAddressForm.city,
      ]
        .filter(Boolean)
        .join(", ");
      const resp = await customerApi.geocodeAddress(query);
      const loc = resp.data?.result?.location;
      if (
        loc &&
        typeof loc.lat === "number" &&
        typeof loc.lng === "number" &&
        Number.isFinite(loc.lat) &&
        Number.isFinite(loc.lng)
      ) {
        location = { lat: loc.lat, lng: loc.lng };
        placeId = resp.data?.result?.placeId || null;
        formattedAddress = resp.data?.result?.formattedAddress || null;
        updateLocation(
          {
            name: resp.data?.result?.formattedAddress || query,
            time: currentLocation?.time || "12-15 mins",
            city: currentLocation?.city,
            state: currentLocation?.state,
            pincode: currentLocation?.pincode,
            latitude: loc.lat,
            longitude: loc.lng,
          },
          { persist: true, updateSavedHome: false },
        );
      }
    } catch (e) {
      // If geocoding fails, keep the edited address but warn: distance-based pricing may be inaccurate.
      showToast(
        e.response?.data?.message ||
          "Could not fetch coordinates for this address. Delivery charges may be inaccurate.",
        "error",
      );
    }

    setCurrentAddress({
      ...editAddressForm,
      ...(location ? { location } : {}),
      ...(placeId ? { placeId } : {}),
      ...(formattedAddress ? { formattedAddress } : {}),
    });
    setIsEditAddressOpen(false);
    showToast("Delivery address updated", "success");
  };

  const handleUseCurrentLiveLocation = async () => {
    const result = await refreshLocation();

    if (result?.ok && result.location) {
      const liveLocation = result.location;
      setCurrentAddress((prev) => ({
        ...prev,
        address: liveLocation.name,
        landmark: "",
        city: [liveLocation.city, liveLocation.state, liveLocation.pincode]
          .filter(Boolean)
          .join(", "),
        ...(typeof liveLocation.latitude === "number" &&
        typeof liveLocation.longitude === "number"
          ? { location: { lat: liveLocation.latitude, lng: liveLocation.longitude } }
          : {}),
      }));
      showToast("Using your current live location", "success");
      return;
    }

    if (currentLocation?.name) {
      setCurrentAddress((prev) => ({
        ...prev,
        address: currentLocation.name,
        landmark: "",
        city: [currentLocation.city, currentLocation.state, currentLocation.pincode]
          .filter(Boolean)
          .join(", "),
        ...(typeof currentLocation.latitude === "number" &&
        typeof currentLocation.longitude === "number"
          ? { location: { lat: currentLocation.latitude, lng: currentLocation.longitude } }
          : {}),
      }));
      showToast("Using your last detected location", "success");
      return;
    }

    showToast(result?.error || "Unable to detect current location", "error");
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${appName} Checkout`,
          text: `Hey! I'm ordering some goodies from ${appName}. Total: ₹${totalAmount}`,
          url: window.location.href,
        });
      } catch (err) {
        console.log("Error sharing:", err);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      showToast("Link copied to clipboard!", "success");
    }
  };

  const handleApplyCoupon = async (coupon) => {
    try {
      const payload = {
        code: coupon.code,
        cartTotal,
        items: cart,
        customerId: user?._id,
      };
      const res = await customerApi.validateCoupon(payload);
      if (res.data.success) {
        const data = res.data.result;
        setSelectedCoupon({
          ...coupon,
          ...data,
        });
        setIsCouponModalOpen(false);
        showToast(`Coupon ${coupon.code} applied!`, "success");
      } else {
        showToast(res.data.message || "Unable to apply coupon", "error");
      }
    } catch (error) {
      showToast(
        error.response?.data?.message || "Unable to apply coupon",
        "error",
      );
    }
  };

  const handleAddToCart = (product) => {
    addToCart(product);
    showToast(`${product.name} added to cart!`, "success");
  };

  const getCartItem = (productId) => cart.find((item) => item.id === productId);

  useEffect(() => {
    // Hydrate "order for someone else" address from localStorage, if present
    try {
      if (typeof window !== "undefined") {
        const raw = window.localStorage.getItem(RECIPIENT_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && parsed.completeAddress && parsed.name && parsed.phone) {
            setRecipientData(parsed);
            setSavedRecipient(parsed);
          }
        }
      }
    } catch {
      // ignore parse errors
    }

    const fetchCoupons = async () => {
      try {
        const res = await customerApi.getActiveCoupons();
        if (res.data.success) {
          const list = res.data.result || res.data.results || [];
          setCoupons(list);
        }
      } catch {
        // silently ignore
      }
    };
    fetchCoupons();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || cart.length === 0) {
      setPricingPreview(null);
      return;
    }

    const fetchPreview = async () => {
      try {
        setIsPreviewLoading(true);
        const payload = {
          items: cart.map((item) => ({
            product: item.id || item._id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            image: item.image,
          })),
          address: buildAddressForOrder(),
          discountTotal: discountAmount,
          taxTotal: 0,
          paymentMode: selectedPayment === "online" ? "ONLINE" : "COD",
          timeSlot: selectedTimeSlot,
        };
        const res = await customerApi.checkoutPreview(payload);
        if (res.data?.success) {
          setPricingPreview(res.data.result?.breakdown || null);
        }
      } catch (error) {
        console.error("Checkout preview failed", error);
      } finally {
        setIsPreviewLoading(false);
      }
    };

    fetchPreview();
  }, [
    isAuthenticated,
    cart,
    selectedPayment,
    selectedTimeSlot,
    discountAmount,
    savedRecipient,
    currentAddress,
    currentLocation,
  ]);

  const handlePlaceOrder = async () => {
    setIsPlacingOrder(true);
    try {
      const orderData = {
        address: buildAddressForOrder(),
        paymentMode: selectedPayment === "online" ? "ONLINE" : "COD",
        discountTotal: discountAmount,
        taxTotal: taxAmount,
        timeSlot: selectedTimeSlot,
        items: cart.map((item) => ({
          product: item.id || item._id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          image: item.image,
        })),
      };

      const response = await customerApi.createOrder(orderData);

      if (response.data.success) {
        const order = response.data.result;
        clearCart();

        showToast(`Order placed — waiting for seller to accept.`, "success");
        setOrderId(order.orderId);
        setShowSuccess(true);

        if (postOrderNavigateRef.current) {
          clearTimeout(postOrderNavigateRef.current);
        }
        postOrderNavigateRef.current = setTimeout(() => {
          postOrderNavigateRef.current = null;
          navigate(`/orders/${order.orderId}`);
        }, 3000);
      }
    } catch (error) {
      console.error("Failed to place order:", error);
      showToast(
        error.response?.data?.message ||
          "Failed to place order. Please try again.",
        "error",
      );
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // After place order: listen for seller timeout / rejection (customer room + order room) and poll as fallback
  useEffect(() => {
    if (!orderId || !showSuccess) return undefined;

    const getToken = () => localStorage.getItem("auth_customer");
    getOrderSocket(getToken);
    joinOrderRoom(orderId, getToken);

    let pollId = null;

    const applyCancelled = (o) => {
      if (o.workflowStatus === "CANCELLED" || o.status === "cancelled") {
        if (postOrderNavigateRef.current) {
          clearTimeout(postOrderNavigateRef.current);
          postOrderNavigateRef.current = null;
        }
        if (pollId != null) clearInterval(pollId);
        setShowSuccess(false);
        showToast(
          "Order cancelled — seller did not accept in time.",
          "error",
        );
        navigate(`/orders/${orderId}`, { replace: true });
        return true;
      }
      return false;
    };

    const tick = () => {
      customerApi
        .getOrderDetails(orderId)
        .then((r) => {
          if (r.data?.result) applyCancelled(r.data.result);
        })
        .catch(() => {});
    };

    const off = onOrderStatusUpdate(getToken, tick);

    tick();
    pollId = setInterval(tick, 4000);

    return () => {
      off();
      if (pollId != null) clearInterval(pollId);
      leaveOrderRoom(orderId, getToken);
    };
  }, [orderId, showSuccess, navigate, showToast]);

  // Map-based precise location has been removed; manual addresses are used instead.

  if (cart.length === 0 && !showSuccess) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Artistic Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-green-50/50 via-transparent to-transparent pointer-events-none" />
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
          className="absolute -top-20 -right-20 w-80 h-80 bg-green-100/30 rounded-full blur-3xl pointer-events-none"
        />
        <motion.div
          animate={{
            scale: [1, 1.5, 1],
            rotate: [0, -45, 0],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="absolute top-40 -left-20 w-60 h-60 bg-yellow-100/40 rounded-full blur-3xl pointer-events-none"
        />

        <motion.div className="relative z-10 flex flex-col items-center text-center max-w-sm mx-auto">
          {/* Empty Cart Illustration */}
          <div className="relative w-56 h-56 md:w-64 md:h-64 mb-8 flex items-center justify-center">
            <motion.div
              animate={{ y: [-8, 8, -8] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-10 rounded-[2rem] bg-white/90 p-6 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border border-emerald-100">
              <Lottie
                animationData={emptyBoxAnimation}
                loop
                className="h-36 w-36 md:h-44 md:w-44"
              />
            </motion.div>

            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 border-2 border-dashed border-slate-200 rounded-full"
            />
          </div>

          <h2 className="text-3xl font-black text-slate-800 mb-3 tracking-tight">
            Your Cart is Empty
          </h2>
          <p className="text-slate-500 mb-8 leading-relaxed font-medium">
            It feels lighter than air! <br />
            Explore our aisles and fill it with goodies.
          </p>

          <Link
            to="/"
            className="group relative inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-[#0c831f] to-[#10b981] text-white font-bold rounded-2xl overflow-hidden shadow-xl shadow-green-600/20 transition-all hover:scale-[1.02] active:scale-95 w-full sm:w-auto">
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
            <span className="relative flex items-center gap-2 text-lg">
              Start Shopping <ChevronRight size={20} />
            </span>
          </Link>

          <div className="mt-8 flex gap-6 text-slate-400">
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-slate-50 rounded-2xl">
                <Clock size={20} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Fast Delivery
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-slate-50 rounded-2xl">
                <Tag size={20} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Daily Deals
              </span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="p-3 bg-slate-50 rounded-2xl">
                <Sparkles size={20} />
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider">
                Fresh Items
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f1e8] pb-32 font-sans">
      {/* Premium Header - Curved on mobile, integrated on desktop */}
      <div className="bg-gradient-to-br from-[#0a5f17] via-[#0b721b] to-[#084a12] pt-6 pb-12 md:pb-24 relative z-10 shadow-lg md:rounded-b-[4rem] rounded-b-[2rem] overflow-hidden">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 rounded-full blur-[100px] -mr-32 -mt-64 pointer-events-none" />
        <div className="absolute bottom-0 left-1/4 w-64 h-64 bg-green-400/10 rounded-full blur-[80px] pointer-events-none" />

        {/* Header Content */}
        <div className="max-w-7xl mx-auto px-4 md:px-8 relative z-10">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate(-1)}
              className="w-12 h-12 flex items-center justify-center bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl transition-all active:scale-95">
              <ChevronLeft size={28} className="text-white" />
            </button>

            <div className="flex flex-col items-center">
              <h1 className="text-xl md:text-3xl font-[1000] text-white tracking-tight uppercase">
                Checkout
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="h-1.5 w-1.5 bg-green-400 rounded-full animate-pulse" />
                <p className="text-green-100/90 text-[10px] md:text-xs font-black tracking-[0.2em] uppercase">
                  {cartCount} {cartCount === 1 ? "Item" : "Items"} in cart
                </p>
              </div>
            </div>

            <button
              onClick={handleShare}
              className="h-12 px-4 flex items-center gap-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl transition-all active:scale-95">
              <Share2 size={20} className="text-white" />
              <span className="text-xs font-black text-white uppercase tracking-widest hidden sm:block">
                Share
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 -mt-12 md:-mt-16 lg:-mt-20 relative z-20">
        <div className="lg:grid lg:grid-cols-12 lg:gap-8 items-start">
          {/* Left Column: Delivery & Items */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6 pb-8">
            {/* Delivery Time Banner */}
            <motion.div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 mt-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                  <Clock size={24} className="text-[#0c831f]" />
                </div>
                <div>
                  <h3 className="font-black text-slate-800 text-lg">
                    Delivery in 12-15 mins
                  </h3>
                  <p className="text-sm text-slate-500">
                    Shipment of {cartCount} items
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Delivery Address Section - New UI */}
            <motion.div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs text-slate-500 font-medium">
                  Ordering for someone else?
                </span>
                <button
                  onClick={() => setShowRecipientForm(!showRecipientForm)}
                  className="text-[#0c831f] text-xs font-bold hover:underline">
                  {showRecipientForm
                    ? "Close"
                    : savedRecipient
                      ? "Change details"
                      : "Add details"}
                </button>
              </div>

              {savedRecipient && !showRecipientForm && (
                <div className="mb-4 p-4 bg-green-50 border border-green-100 rounded-2xl flex items-start justify-between">
                  <div className="flex gap-3">
                    <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center text-[#0c831f] flex-shrink-0">
                      <Contact2 size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-800">
                        {savedRecipient.name}
                      </p>
                      <p className="text-xs text-[#0c831f] font-bold mb-1">
                        {savedRecipient.phone}
                      </p>
                      <p className="text-xs text-slate-500 leading-tight">
                        {savedRecipient.completeAddress}
                        {savedRecipient.landmark &&
                          `, ${savedRecipient.landmark}`}
                        {savedRecipient.pincode &&
                          ` - ${savedRecipient.pincode}`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSavedRecipient(null)}
                    className="text-red-500 text-xs font-bold hover:underline">
                    Remove
                  </button>
                </div>
              )}

              <AnimatePresence>
                {showRecipientForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeInOut" }}
                    className="overflow-hidden mb-4">
                    <div className="bg-[#f8f9fb] rounded-2xl p-4 border border-slate-100 space-y-4">
                      <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-3">
                          Enter delivery address details
                        </h4>
                        <div className="space-y-3">
                          <Input
                            placeholder="Enter complete address*"
                            value={recipientData.completeAddress}
                            onChange={(e) =>
                              setRecipientData({
                                ...recipientData,
                                completeAddress: e.target.value,
                              })
                            }
                            className="h-12 rounded-xl border-slate-200 focus:ring-[#0c831f] focus:border-[#0c831f] text-sm"
                          />
                          <Input
                            placeholder="Find landmark (optional)"
                            value={recipientData.landmark}
                            onChange={(e) =>
                              setRecipientData({
                                ...recipientData,
                                landmark: e.target.value,
                              })
                            }
                            className="h-12 rounded-xl border-slate-200 focus:ring-[#0c831f] focus:border-[#0c831f] text-sm"
                          />
                          <Input
                            placeholder="Enter pin code (optional)"
                            value={recipientData.pincode}
                            onChange={(e) =>
                              setRecipientData({
                                ...recipientData,
                                pincode: e.target.value,
                              })
                            }
                            className="h-12 rounded-xl border-slate-200 focus:ring-[#0c831f] focus:border-[#0c831f] text-sm"
                          />
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-bold text-slate-800 mb-1">
                          Enter receiver details
                        </h4>
                        <p className="text-[10px] text-slate-400 mb-3 font-medium">
                          We'll contact receiver to get the exact delivery
                          address
                        </p>
                        <div className="space-y-3">
                          <Input
                            placeholder="Receiver's name*"
                            value={recipientData.name}
                            onChange={(e) =>
                              setRecipientData({
                                ...recipientData,
                                name: e.target.value,
                              })
                            }
                            className="h-12 rounded-xl border-slate-200 focus:ring-[#0c831f] focus:border-[#0c831f] text-sm"
                          />
                          <div className="relative">
                            <Input
                              placeholder="Receiver's phone number*"
                              value={recipientData.phone}
                              onChange={(e) =>
                                setRecipientData({
                                  ...recipientData,
                                  phone: e.target.value,
                                })
                              }
                              className="h-12 rounded-xl border-slate-200 focus:ring-[#0c831f] focus:border-[#0c831f] text-sm pr-10"
                            />
                            <Contact2
                              size={18}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                          </div>
                        </div>
                      </div>

                      <Button
                        onClick={handleSaveRecipient}
                        className="w-full h-12 bg-[#2d8618] hover:bg-[#236b11] text-white font-bold rounded-xl">
                        Save address
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="mb-3">
                <h3 className="font-black text-slate-800 text-base">
                  Delivery Address
                </h3>
                <p className="text-xs text-slate-500">
                  Select or edit your saved address
                </p>
              </div>

              {/* Address Card */}
              <div className="border rounded-xl p-3 mb-3 relative cursor-pointer transition-all border-[#0c831f] bg-green-50/50">
                <div className="flex items-start gap-3">
                  {/* Radio/Check Button */}
                  <div className="mt-1">
                    <div className="h-5 w-5 rounded-full bg-[#0c831f] flex items-center justify-center">
                      <Check size={12} className="text-white stroke-[4]" />
                    </div>
                  </div>

                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <h4 className="font-bold text-slate-800 text-sm">
                        {displayName}
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditAddress();
                          }}
                          className="text-slate-500 text-xs font-bold hover:underline">
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsAddressModalOpen(true);
                          }}
                          className="text-[#0c831f] text-xs font-bold hover:underline">
                          Change
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      {displayPhone}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      {displayAddress}
                    </p>
                  </div>
                </div>
              </div>

              {/* Use current location button */}
              <button
                type="button"
                onClick={handleUseCurrentLiveLocation}
                disabled={isFetchingLocation}
                className="mt-3 w-full py-2.5 rounded-2xl border border-dashed border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                {isFetchingLocation
                  ? "Detecting live location..."
                  : "Use current live location"}
              </button>
              {/* Manual address info banner */}
              <motion.div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 flex items-center gap-3 shadow-sm">
                <div className="h-8 w-8 rounded-full bg-emerald-600 flex items-center justify-center shadow-emerald-500/40 shadow-md">
                  <Check size={16} className="text-white stroke-[3]" />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-semibold text-emerald-900">
                    Delivery address confirmed
                  </p>
                  <p className="text-[11px] font-medium text-emerald-800/80">
                    We&apos;ll deliver to the address you&apos;ve entered above.
                  </p>
                </div>
              </motion.div>
            </motion.div>

            {/* Cart Items */}
            <motion.div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-4">
              {displayCartItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                  <div className="h-20 w-20 rounded-xl overflow-hidden bg-slate-50 flex-shrink-0">
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-slate-800 mb-1">
                      {item.name}
                    </h4>
                    <p className="text-xs text-slate-500 mb-2">75 g</p>
                    <button
                      onClick={() => handleMoveToWishlist(item)}
                      className="text-xs text-slate-500 underline hover:text-[#0c831f] transition-colors">
                      Move to wishlist
                    </button>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2 bg-[#0c831f] rounded-lg px-2 py-1">
                      <button
                        onClick={() =>
                          item.quantity > 1
                            ? updateQuantity(item.id, -1)
                            : removeFromCart(item.id)
                        }
                        className="text-white p-1 hover:bg-white/20 rounded transition-colors">
                        <Minus size={14} strokeWidth={3} />
                      </button>
                      <span className="text-white font-bold min-w-[20px] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="text-white p-1 hover:bg-white/20 rounded transition-colors">
                        <Plus size={14} strokeWidth={3} />
                      </button>
                    </div>
                    <p className="text-base font-black text-slate-800">
                      ₹{item.price * item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Your Wishlist */}
            {wishlist.filter((item) => item.name).length > 0 && (
              <motion.div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                <h3 className="font-black text-slate-800 text-lg mb-4">
                  Your wishlist
                </h3>
                <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 snap-x">
                  {wishlist
                    .filter((item) => item.name)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="flex-shrink-0 w-[140px] snap-start">
                        <ProductCard product={item} compact={true} />
                      </div>
                    ))}
                </div>
              </motion.div>
            )}

            {/* You might also like */}
            <motion.div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <h3 className="font-black text-slate-800 text-lg mb-4">
                You might also like
              </h3>
              <div className="flex gap-4 overflow-x-auto pb-4 no-scrollbar -mx-4 px-4 snap-x">
                {recommendedProducts.map((product) => (
                  <div
                    key={product.id}
                    className="flex-shrink-0 w-[140px] snap-start">
                    <ProductCard product={product} compact={true} />
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Right Column: Order Summary & Payment - Sticky on Desktop */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6 lg:sticky lg:top-8 pb-32 lg:pb-8">
            {/* Summary Backdrop for desktop */}
            <div className="hidden lg:block absolute inset-0 -m-4 bg-[#fcf9f2] rounded-[2.5rem] -z-10 shadow-inner group-hover:shadow-2xl transition-all duration-500" />
            <motion.div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Tag size={20} className="text-orange-500" />
                  <h3 className="font-black text-slate-800">
                    Available Coupons
                  </h3>
                </div>
                <button
                  onClick={() => setIsCouponModalOpen(true)}
                  className="text-[#0c831f] text-sm font-bold hover:underline">
                  See All
                </button>
              </div>
              <div className="space-y-3">
                {coupons.map((coupon) => (
                  <div
                    key={coupon.code}
                    className="flex items-center gap-3 p-3 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border border-orange-100">
                    <div className="flex-1">
                      <p className="font-black text-slate-800 text-sm">
                        {coupon.code}
                      </p>
                      <p className="text-xs text-slate-600">
                        {coupon.description}
                      </p>
                    </div>
                    <button
                      onClick={() => handleApplyCoupon(coupon)}
                      className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${
                        selectedCoupon?.code === coupon.code
                          ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                          : "bg-[#0c831f] text-white hover:bg-[#0b721b]"
                      }`}
                      disabled={selectedCoupon?.code === coupon.code}>
                      {selectedCoupon?.code === coupon.code
                        ? "Applied"
                        : "Apply"}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Tip for Partner */}
            <motion.div className="bg-gradient-to-r from-pink-50 to-purple-50 rounded-2xl p-4 border border-pink-100">
              <div className="flex items-center gap-2 mb-3">
                <Heart size={18} className="text-pink-500 fill-pink-500" />
                <h3 className="font-black text-slate-800">
                  Tip your delivery partner
                </h3>
              </div>
              <p className="text-xs text-slate-600 mb-3">
                100% of the tip goes to them
              </p>
              <div className="grid grid-cols-4 gap-2">
                {tipAmounts.map((tip) => (
                  <button
                    key={tip.value}
                    onClick={() => setSelectedTip(tip.value)}
                    className={`py-2 rounded-xl border-2 transition-all font-bold text-sm ${
                      selectedTip === tip.value
                        ? "border-pink-500 bg-pink-100 text-pink-700"
                        : "border-pink-200 bg-white text-slate-700 hover:border-pink-300"
                    }`}>
                    {tip.label}
                  </button>
                ))}
              </div>
            </motion.div>

            {/* Payment Method */}
            <motion.div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
              <h3 className="font-black text-slate-800 mb-4">Payment Method</h3>
              <div className="space-y-2">
                {paymentMethods.map((method) => {
                  const Icon = method.icon;
                  return (
                    <button
                      key={method.id}
                      onClick={() => setSelectedPayment(method.id)}
                      className={`w-full p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                        selectedPayment === method.id
                          ? "border-[#0c831f] bg-green-50"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}>
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center ${
                          selectedPayment === method.id
                            ? "bg-green-100"
                            : "bg-slate-100"
                        }`}>
                        <Icon
                          size={18}
                          className={
                            selectedPayment === method.id
                              ? "text-[#0c831f]"
                              : "text-slate-600"
                          }
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <p
                          className={`font-bold text-sm ${selectedPayment === method.id ? "text-[#0c831f]" : "text-slate-800"}`}>
                          {method.label}
                        </p>
                        <p className="text-xs text-slate-500">
                          {method.sublabel}
                        </p>
                      </div>
                      <div
                        className={`h-5 w-5 rounded-full border-2 flex items-center justify-center ${
                          selectedPayment === method.id
                            ? "border-[#0c831f]"
                            : "border-slate-300"
                        }`}>
                        {selectedPayment === method.id && (
                          <div className="h-3 w-3 rounded-full bg-[#0c831f]" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </motion.div>

            {/* Bill Details */}
            <motion.div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-gray-200/50 border border-slate-100">
              <div className="flex items-center gap-2 mb-6">
                <div className="h-10 w-10 rounded-2xl bg-green-50 flex items-center justify-center">
                  <Clipboard size={20} className="text-[#0c831f]" />
                </div>
                <h3 className="font-[1000] text-slate-800 text-xl tracking-tight uppercase">
                  Order Summary
                </h3>
              </div>

              <div className="space-y-4">
                <div className="flex justify-between items-center px-2">
                  <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                    Item Total
                  </span>
                  <span className="font-black text-slate-800">
                    ₹{pricingPreview?.productSubtotal ?? cartTotal}
                  </span>
                </div>
                <div className="flex justify-between items-center px-2">
                  <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                    Delivery Fee
                  </span>
                  <span className="font-black text-slate-800">₹{deliveryFee}</span>
                </div>                {pricingPreview &&
                  typeof pricingPreview.distanceKmActual === "number" &&
                  typeof pricingPreview.distanceKmRounded === "number" && (
                    <div className="px-2 -mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-400">
                      <span>
                        Distance: {pricingPreview.distanceKmActual.toFixed(2)} km
                        {pricingPreview.distanceKmRounded
                          ? ` (billed ${pricingPreview.distanceKmRounded.toFixed(2)} km)`
                          : ""}
                      </span>
                      <span className="uppercase tracking-wider">
                        {pricingPreview?.snapshots?.deliverySettings?.deliveryPricingMode ||
                          pricingPreview?.snapshots?.deliverySettings?.pricingMode ||
                          ""}
                      </span>
                    </div>
                  )}
                <div className="flex justify-between items-center px-2">
                  <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                    Handling Fee
                  </span>
                  <span className="font-black text-slate-800">
                    ₹{handlingFee}
                  </span>
                </div>
                <div className="flex justify-between items-center px-2">
                  <span className="text-slate-500 font-bold text-[13px] uppercase tracking-wider">
                    Tax
                  </span>
                  <span className="font-black text-slate-800">₹{taxAmount}</span>
                </div>

                {selectedCoupon && (
                  <motion.div
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex justify-between items-center px-3 py-2 bg-green-50 rounded-xl border border-green-100">
                    <span className="text-[#0c831f] font-black text-xs flex items-center gap-2 uppercase tracking-wider">
                      <Tag size={14} />
                      Coupon Reserved
                    </span>
                    <span className="font-black text-[#0c831f]">
                      -₹{discountAmount}
                    </span>
                  </motion.div>
                )}

                {false && selectedTip > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 bg-pink-50 rounded-xl border border-pink-100 italic">
                    <span className="text-pink-600 font-bold text-xs flex items-center gap-2">
                      <Heart size={14} className="fill-pink-500" />
                      Partner Support
                    </span>
                    <span className="font-black text-pink-600">
                      ₹{selectedTip}
                    </span>
                  </div>
                )}

                <div className="mt-4 pt-6 border-t-2 border-dashed border-slate-100">
                  <div className="flex justify-between items-center mb-6">
                    <div className="flex flex-col">
                      <span className="font-[1000] text-slate-800 text-lg uppercase tracking-tight">
                        To Pay
                      </span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]">
                        Safe & Secure Payment
                      </span>
                    </div>
                    <span className="font-[1000] text-[#0c831f] text-3xl tracking-tighter italic">
                      {isPreviewLoading ? "Calculating..." : `₹${totalAmount}`}
                    </span>
                  </div>

                  {/* Desktop Integrated Slide to Pay */}
                  <div className="hidden lg:block">
                    <SlideToPay
                      amount={totalAmount}
                      onSuccess={handlePlaceOrder}
                      isLoading={isPlacingOrder || isPreviewLoading || !pricingPreview}
                      text="Order Now"
                    />
                    <p className="text-center text-[10px] text-slate-400 font-bold mt-4 uppercase tracking-[0.1em]">
                      🔒 SSL encrypted secure checkout
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Sticky Footer - Mobile Only */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 px-4 py-4 shadow-[0_-10px_40px_rgba(0,0,0,0.1)] z-50 rounded-t-3xl">
        <div className="max-w-4xl mx-auto">
          <SlideToPay
            amount={totalAmount}
            onSuccess={handlePlaceOrder}
            isLoading={isPlacingOrder || isPreviewLoading || !pricingPreview}
            text="Slide to Pay"
          />
        </div>
      </div>

      {/* Address Selection Modal */}
      <Dialog open={isAddressModalOpen} onOpenChange={setIsAddressModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Delivery Address</DialogTitle>
            <DialogDescription>
              Choose where you want your order delivered.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {locationSavedAddresses.map((addr) => (
              <button
                key={addr.id}
                onClick={() => handleSelectSavedAddress(addr)}
                disabled={isResolvingAddressCoords}
                className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
                  currentAddress.id === addr.id
                    ? "border-[#0c831f] bg-green-50 shadow-sm"
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`p-2 rounded-full ${currentAddress.id === addr.id ? "bg-[#0c831f] text-white" : "bg-slate-100 text-slate-500"}`}>
                    <MapPin size={16} />
                  </div>
                  <span className="font-black text-slate-800 uppercase tracking-widest text-[10px]">
                    {addr.label}
                  </span>
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {user?.name || currentAddress.name}
                </p>
                <p className="text-xs text-slate-500 leading-relaxed mb-1">
                  {addr.address}
                </p>
                {addr.phone && (
                  <p className="text-[11px] text-slate-400 font-medium">
                    Phone: {addr.phone}
                  </p>
                )}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              className="w-full border-green-600 text-green-600 hover:bg-green-50"
              onClick={() => navigate("/addresses")}>
              <Plus size={16} className="mr-2" /> Add New Address
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Current Address Modal - slides up from bottom */}
      <Dialog open={isEditAddressOpen} onOpenChange={setIsEditAddressOpen}>
        <DialogContent className="sm:max-w-[425px] overflow-hidden p-0">
          <motion.div
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 25 }}
            className="p-6">
            <DialogHeader>
              <DialogTitle>Edit Delivery Address</DialogTitle>
              <DialogDescription>
                Update the details of your current delivery address.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label
                  htmlFor="edit-address"
                  className="text-xs font-semibold text-slate-700">
                  Address
                </Label>
                <Input
                  id="edit-address"
                  value={editAddressForm.address}
                  onChange={(e) =>
                    setEditAddressForm((prev) => ({
                      ...prev,
                      address: e.target.value,
                    }))
                  }
                  className="h-10"
                  placeholder="House, street, area"
                />
              </div>
              <div className="grid gap-2">
                <Label
                  htmlFor="edit-landmark"
                  className="text-xs font-semibold text-slate-700">
                  Nearest Landmark (optional)
                </Label>
                <Input
                  id="edit-landmark"
                  value={editAddressForm.landmark || ""}
                  onChange={(e) =>
                    setEditAddressForm((prev) => ({
                      ...prev,
                      landmark: e.target.value,
                    }))
                  }
                  className="h-10"
                  placeholder="e.g. Near City Mall, Opp. Temple"
                />
              </div>
              <div className="grid gap-2">
                <Label
                  htmlFor="edit-city"
                  className="text-xs font-semibold text-slate-700">
                  City / Pincode
                </Label>
                <Input
                  id="edit-city"
                  value={editAddressForm.city}
                  onChange={(e) =>
                    setEditAddressForm((prev) => ({
                      ...prev,
                      city: e.target.value,
                    }))
                  }
                  className="h-10"
                  placeholder="City - Pincode"
                />
              </div>
            </div>
            <DialogFooter className="mt-2">
              <Button
                variant="outline"
                onClick={() => setIsEditAddressOpen(false)}
                className="border-slate-200 text-slate-600 hover:bg-slate-50">
                Cancel
              </Button>
              <Button
                onClick={handleSaveEditedAddress}
                className="bg-[#0c831f] hover:bg-[#0b721b] text-white font-bold">
                Save changes
              </Button>
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>

      {/* Coupon Selection Modal */}
      <Dialog open={isCouponModalOpen} onOpenChange={setIsCouponModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Apply Coupon</DialogTitle>
            <DialogDescription>
              Browse available offers and save more.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
            {coupons.map((coupon) => (
              <div
                key={coupon.code}
                className={`p-4 rounded-2xl border-2 transition-all relative overflow-hidden ${
                  selectedCoupon?.code === coupon.code
                    ? "border-[#0c831f] bg-green-50 shadow-sm"
                    : "border-slate-100 bg-white hover:border-slate-200"
                }`}>
                {selectedCoupon?.code === coupon.code && (
                  <div className="absolute top-0 right-0 p-1.5 bg-[#0c831f] text-white rounded-bl-xl">
                    <Check size={12} strokeWidth={4} />
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <div
                    className={`p-3 rounded-2xl ${selectedCoupon?.code === coupon.code ? "bg-[#0c831f]/10 text-[#0c831f]" : "bg-orange-50 text-orange-500"}`}>
                    <Tag size={20} />
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-slate-800 tracking-wider mb-1">
                      {coupon.code}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed mb-3">
                      {coupon.description}
                    </p>
                    <button
                      onClick={() => handleApplyCoupon(coupon)}
                      disabled={selectedCoupon?.code === coupon.code}
                      className={`w-full py-2.5 rounded-xl font-bold text-sm transition-all ${
                        selectedCoupon?.code === coupon.code
                          ? "bg-white text-[#0c831f] border-2 border-[#0c831f] cursor-default"
                          : "bg-[#0c831f] text-white hover:bg-[#0b721b]"
                      }`}>
                      {selectedCoupon?.code === coupon.code
                        ? "Applied"
                        : "Apply Now"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="pt-2">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                size={16}
              />
              <Input
                placeholder="Enter coupon code manually"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                className="pl-10 h-12 rounded-xl focus-visible:ring-[#0c831f]"
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#0c831f] font-bold text-xs"
                onClick={async () => {
                  if (!manualCode.trim()) {
                    showToast("Please enter a coupon code", "error");
                    return;
                  }
                  try {
                    const res = await customerApi.validateCoupon({
                      code: manualCode.trim(),
                      cartTotal,
                      items: cart,
                      customerId: user?._id,
                    });
                    if (res.data.success) {
                      const data = res.data.result;
                      setSelectedCoupon({
                        code: manualCode.trim(),
                        description: "Applied manually",
                        ...data,
                      });
                      showToast(
                        `Coupon ${manualCode.trim()} applied!`,
                        "success",
                      );
                    } else {
                      showToast(res.data.message || "Invalid coupon", "error");
                    }
                  } catch (error) {
                    showToast(
                      error.response?.data?.message || "Invalid coupon",
                      "error",
                    );
                  }
                }}>
                CHECK
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Success Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center">
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", damping: 12 }}
              className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center text-[#0c831f] mb-6">
              <Check size={48} strokeWidth={4} />
            </motion.div>
            <motion.h2
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="text-3xl font-black text-slate-800 mb-2">
              Order placed
            </motion.h2>
            <motion.p
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="text-slate-500 font-medium mb-8">
              #{orderId?.slice(-6)} — waiting for the seller to accept (60s). If
              they don&apos;t, the order will cancel automatically.
              <br />
              Redirecting to order details…
            </motion.p>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 2.5, ease: "linear" }}
              className="w-48 h-1.5 bg-green-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#0c831f]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style
        dangerouslySetInnerHTML={{
          __html: `
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `,
        }}
      />
    </div>
  );
};

export default CheckoutPage;
