import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useInViewAnimation } from "@/core/hooks/useInViewAnimation";
import {
  Star,
  ChevronDown,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Heart,
  Snowflake,
  Dog,
} from "lucide-react";

// MUI Icons (shared with admin & icon selector)
import HomeIcon from "@mui/icons-material/Home";
import DevicesIcon from "@mui/icons-material/Devices";
import LocalGroceryStoreIcon from "@mui/icons-material/LocalGroceryStore";
import KitchenIcon from "@mui/icons-material/Kitchen";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import PetsIcon from "@mui/icons-material/Pets";
import SportsSoccerIcon from "@mui/icons-material/SportsSoccer";
import CardGiftcardIcon from "@mui/icons-material/CardGiftcard";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import SpaIcon from "@mui/icons-material/Spa";
import ToysIcon from "@mui/icons-material/Toys";
import DirectionsCarIcon from "@mui/icons-material/DirectionsCar";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import YardIcon from "@mui/icons-material/Yard";
import BusinessCenterIcon from "@mui/icons-material/BusinessCenter";
import MusicNoteIcon from "@mui/icons-material/MusicNote";
import CheckroomIcon from "@mui/icons-material/Checkroom";
import LocalCafeIcon from "@mui/icons-material/LocalCafe";
import DiamondIcon from "@mui/icons-material/Diamond";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import BuildIcon from "@mui/icons-material/Build";
import LuggageIcon from "@mui/icons-material/Luggage";

import SearchIcon from "@mui/icons-material/Search";
import MicIcon from "@mui/icons-material/Mic";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocationOnIcon from "@mui/icons-material/LocationOn";
import ArrowRightIcon from "@mui/icons-material/ArrowForwardIos";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import VerifiedIcon from "@mui/icons-material/Verified";
import FlashOnIcon from "@mui/icons-material/FlashOn";
import SavingsIcon from "@mui/icons-material/Savings";

import { getIconSvg } from "@/shared/constants/categoryIcons";
import { motion, useScroll, useTransform } from "framer-motion";
import { customerApi } from "../services/customerApi";
import { toast } from "sonner";
import ProductCard from "../components/shared/ProductCard";
import MainLocationHeader from "../components/shared/MainLocationHeader";
import { useProductDetail } from "../context/ProductDetailContext";
import { cn } from "@/lib/utils";
import CardBanner from "@/assets/CardBanner.jpg";
import QuickCategoriesBg from "@/assets/Catagorysection_bg.png";
import SectionRenderer from "../components/experience/SectionRenderer";
import ExperienceBannerCarousel from "../components/experience/ExperienceBannerCarousel";
import { useLocation } from "../context/LocationContext";
import { useSettings } from "@core/context/SettingsContext";
import Lottie from "lottie-react";
import {
  getSideImageByKey,
  getBackgroundColorByValue,
  getBackgroundGradientByValue,
} from "@/shared/constants/offerSectionOptions";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

const DEFAULT_CATEGORY_THEME = {
  gradient: "linear-gradient(to bottom, var(--primary), var(--brand-400))",
  shadow: "shadow-brand-500/20",
  accent: "text-[#1A1A1A]",
};

const CATEGORY_METADATA = {
  All: {
    icon: HomeIcon,
    theme: DEFAULT_CATEGORY_THEME,
    banner: {
      title: "HOUSEFULL",
      subtitle: "SALE",
      floatingElements: "sparkles",
    },
  },
  Grocery: {
    icon: LocalGroceryStoreIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF9F1C, #FFBF69)",
      shadow: "shadow-orange-500/20",
      accent: "text-orange-900",
    },
    banner: {
      title: "SUPERSAVER",
      subtitle: "FRESH & FAST",
      floatingElements: "leaves",
    },
  },
  Wedding: {
    icon: CardGiftcardIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF4D6D, #FF8FA3)",
      shadow: "shadow-rose-500/20",
      accent: "text-rose-900",
    },
    banner: { title: "WEDDING", subtitle: "BLISS", floatingElements: "hearts" },
  },
  "Home & Kitchen": {
    icon: KitchenIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #BC6C25, #DDA15E)",
      shadow: "shadow-amber-500/20",
      accent: "text-amber-900",
    },
    banner: { title: "HOME", subtitle: "KITCHEN", floatingElements: "smoke" },
  },
  Electronics: {
    icon: DevicesIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #7209B7, #B5179E)",
      shadow: "shadow-purple-500/20",
      accent: "text-purple-900",
    },
    banner: {
      title: "TECH FEST",
      subtitle: "GADGETS",
      floatingElements: "tech",
    },
  },
  Kids: {
    icon: ChildCareIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4CC9F0, #A0E7E5)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: {
      title: "LITTLE ONE",
      subtitle: "CARE",
      floatingElements: "bubbles",
    },
  },
  "Pet Supplies": {
    icon: PetsIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FB8500, #FFB703)",
      shadow: "shadow-yellow-500/20",
      accent: "text-yellow-900",
    },
    banner: { title: "PAWSOME", subtitle: "DEALS", floatingElements: "bones" },
  },
  Sports: {
    icon: SportsSoccerIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4361EE, #4895EF)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: { title: "SPORTS", subtitle: "GEAR", floatingElements: "confetti" },
  },
};

const ALL_CATEGORY = {
  id: "all",
  _id: "all",
  name: "All",
  icon: HomeIcon,
  theme: DEFAULT_CATEGORY_THEME,
  headerColor: "#0e7490",
  headerFontColor: "#111111",
  headerIconColor: "#111111",
  banner: {
    title: "HOUSEFULL",
    subtitle: "SALE",
    floatingElements: "sparkles",
    textColor: "text-white",
  },
};

const categories = [
  {
    id: 1,
    name: "All",
    icon: HomeIcon,
    theme: DEFAULT_CATEGORY_THEME,
    banner: {
      title: "HOUSEFULL",
      subtitle: "SALE",
      floatingElements: "sparkles",
      textColor: "text-white",
    },
  },
  {
    id: 5,
    name: "Electronics",
    icon: DevicesIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #7209B7, #B5179E)",
      shadow: "shadow-purple-500/20",
      accent: "text-purple-900",
    },
    banner: {
      title: "TECH FEST",
      subtitle: "GADGETS",
      floatingElements: "tech",
      textColor: "text-white",
    },
  },
  {
    id: 2,
    name: "Grocery",
    icon: LocalGroceryStoreIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF9F1C, #FFBF69)",
      shadow: "shadow-orange-500/20",
      accent: "text-orange-900",
    },
    banner: {
      title: "SUPERSAVER",
      subtitle: "FRESH & FAST",
      floatingElements: "leaves",
      textColor: "text-white",
    },
  },
  {
    id: 10,
    name: "Home & Kitchen",
    icon: KitchenIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #BC6C25, #DDA15E)",
      shadow: "shadow-amber-500/20",
      accent: "text-amber-900",
    },
    banner: {
      title: "HOME",
      subtitle: "KITCHEN",
      floatingElements: "smoke",
      textColor: "text-white",
    },
  },
  {
    id: 7,
    name: "Kids",
    icon: ChildCareIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4CC9F0, #A0E7E5)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: {
      title: "LITTLE ONE",
      subtitle: "CARE",
      floatingElements: "bubbles",
      textColor: "text-white",
    },
  },
  {
    id: 8,
    name: "Pet Supplies",
    icon: PetsIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FB8500, #FFB703)",
      shadow: "shadow-yellow-500/20",
      accent: "text-yellow-900",
    },
    banner: {
      title: "PAWSOME",
      subtitle: "DEALS",
      floatingElements: "bones",
      textColor: "text-white",
    },
  },
  {
    id: 11,
    name: "Sports",
    icon: SportsSoccerIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #4361EE, #4895EF)",
      shadow: "shadow-brand-500/20",
      accent: "text-brand-900",
    },
    banner: {
      title: "SPORTS",
      subtitle: "GEAR",
      floatingElements: "confetti",
      textColor: "text-white",
    },
  },
  {
    id: 3,
    name: "Wedding",
    icon: CardGiftcardIcon,
    theme: {
      gradient: "linear-gradient(to bottom, #FF4D6D, #FF8FA3)",
      shadow: "shadow-rose-500/20",
      accent: "text-rose-900",
    },
    banner: {
      title: "WEDDING",
      subtitle: "BLISS",
      floatingElements: "hearts",
      textColor: "text-white",
    },
  },
];

// Map icon ids saved from admin/category icon selector to MUI icons
const ICON_COMPONENTS = {
  electronics: DevicesIcon,
  fashion: CheckroomIcon,
  home: HomeIcon,
  food: LocalCafeIcon,
  sports: SportsSoccerIcon,
  books: MenuBookIcon,
  beauty: SpaIcon,
  toys: ToysIcon,
  automotive: DirectionsCarIcon,
  pets: PetsIcon,
  health: LocalHospitalIcon,
  garden: YardIcon,
  office: BusinessCenterIcon,
  music: MusicNoteIcon,
  jewelry: DiamondIcon,
  baby: ChildCareIcon,
  tools: BuildIcon,
  luggage: LuggageIcon,
  art: ColorLensIcon,
  grocery: LocalGroceryStoreIcon,
};

const bestsellerCategories = [
  {
    id: 1,
    name: "Chips & Namkeen",
    images: [
      "https://images.unsplash.com/photo-1566478989037-eec170784d0b?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1613919113640-25732ec5e61f?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1599490659223-e1539e76926a?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1621444541669-451006c1103d?auto=format&fit=crop&q=80&w=200&h=200",
    ],
  },
  {
    id: 2,
    name: "Bakery & Biscuits",
    images: [
      "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1550617931-e17a7b70dce2?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1597481499750-3e6b22637e12?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1581339399838-2a120c18bba3?auto=format&fit=crop&q=80&w=200&h=200",
    ],
  },
  {
    id: 3,
    name: "Vegetable & Fruits",
    images: [
      "https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1518843025960-d70213740685?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1490818387583-1baba5e638af?auto=format&fit=crop&q=80&w=200&h=200",
    ],
  },
  {
    id: 4,
    name: "Oil, Ghee & Masala",
    images: [
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1596797038558-9c50f16ee64b?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1506368249639-73a05d6f6488?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1472141521881-95d0e87e2e39?auto=format&fit=crop&q=80&w=200&h=200",
    ],
  },
  {
    id: 5,
    name: "Sweet & Chocolates",
    images: [
      "https://images.unsplash.com/photo-1581798459219-318e76aecc7b?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1481391243133-f96216dcb5d2?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1526081347589-7fa3cb419ee7?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1542841791-192d99906b27?auto=format&fit=crop&q=80&w=200&h=200",
    ],
  },
  {
    id: 6,
    name: "Drinks & Juices",
    images: [
      "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1625772290748-39126cdd9fe9?auto=format&fit=crop&q=80&w=200&h=200",
      "https://images.unsplash.com/photo-1544145945-f904253db0ad?auto=format&fit=crop&q=80&w=200&h=200",
    ],
  },
];

const MARQUEE_MESSAGES = [
  "24/7 Delivery",
  "Minimum Order ₹99",
  "Save Big on Essentials!",
];

const EMPTY_HERO_CONFIG = {
  banners: { items: [] },
  categoryIds: [],
};

// In-memory Home cache survives SPA navigation and resets on browser refresh.
// This avoids flashing static fallback data when users return to Home.
const homePageDataCache = new Map();
const headerSectionsMemoryCache = {};
const heroConfigMemoryCache = {};

const getHomePageDataCacheKey = (location) => {
  const lat = Number(location?.latitude);
  const lng = Number(location?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "home:no-location";
  return `home:${lat.toFixed(5)}:${lng.toFixed(5)}`;
};

const getCachedHomePageData = (location) =>
  homePageDataCache.get(getHomePageDataCacheKey(location)) || null;

const Home = () => {
  const { scrollY } = useScroll();
  const { isOpen: isProductDetailOpen } = useProductDetail();
  const { currentLocation } = useLocation();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const quickCatsRef = useRef(null);
  const cachedHomePageData = getCachedHomePageData(currentLocation);

  // useInViewAnimation for floating particle containers
  const { ref: particleContainerRef, isVisible: particlesVisible } =
    useInViewAnimation();

  // Hero section IntersectionObserver guard for useTransform scroll listeners
  const heroRef = useRef(null);
  const [heroVisible, setHeroVisible] = useState(true);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") {
      setHeroVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setHeroVisible(entry.isIntersecting),
      { rootMargin: "0px" },
    );
    const el = heroRef.current;
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [categories, setCategories] = useState(
    () => cachedHomePageData?.categories || [ALL_CATEGORY],
  );
  const [activeCategory, setActiveCategory] = useState(
    () => cachedHomePageData?.activeCategory || ALL_CATEGORY,
  );
  const [products, setProducts] = useState(
    () => cachedHomePageData?.products || [],
  );
  const [quickCategories, setQuickCategories] = useState(
    () => cachedHomePageData?.quickCategories || [],
  );
  const [isLoading, setIsLoading] = useState(() => !cachedHomePageData);
  const [experienceSections, setExperienceSections] = useState(
    () => cachedHomePageData?.experienceSections || [],
  );
  const [headerSections, setHeaderSections] = useState([]);
  const [heroConfig, setHeroConfig] = useState(
    () =>
      cachedHomePageData?.heroConfig ||
      heroConfigMemoryCache.__home__ ||
      EMPTY_HERO_CONFIG,
  );
  const [mobileBannerIndex, setMobileBannerIndex] = useState(0);
  const [isInstantBannerJump, setIsInstantBannerJump] = useState(false);
  const [categoryMap, setCategoryMap] = useState(
    () => cachedHomePageData?.categoryMap || {},
  );
  const [subcategoryMap, setSubcategoryMap] = useState(
    () => cachedHomePageData?.subcategoryMap || {},
  );
  const [pendingReturn, setPendingReturn] = useState(null);
  const [offerSections, setOfferSections] = useState(
    () => cachedHomePageData?.offerSections || [],
  );
  const [noServiceData, setNoServiceData] = useState(null);

  // Dynamically load no-service Lottie when products are empty and not loading
  useEffect(() => {
    if (products.length === 0 && !isLoading) {
      import("@/assets/lottie/animation.json")
        .then((m) => setNoServiceData(m.default))
        .catch(() => {});
    }
  }, [products.length === 0 && !isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const scrollQuickCats = (direction) => {
    if (quickCatsRef.current) {
      const scrollAmount = direction === "left" ? -300 : 300;
      quickCatsRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const quickCategoryPalettes = [
    {
      bgFrom: "#ffd96a",
      bgVia: "#ffeaa0",
      bgTo: "#fff0c7",
      glowColor: "rgba(255,184,0,0.18)",
      frameColor: "#f0d98a",
    },
    {
      bgFrom: "var(--primary)",
      bgVia: "#cffafe",
      bgTo: "#ecfeff",
      glowColor: "rgba(97,218,251,0.18)",
      frameColor: "#a5f3fc",
    },
    {
      bgFrom: "#f3a25d",
      bgVia: "#f9c48b",
      bgTo: "#fee0bf",
      glowColor: "rgba(255,139,61,0.16)",
      frameColor: "#efc08e",
    },
    {
      bgFrom: "#b8eff0",
      bgVia: "#d5f7f5",
      bgTo: "#edfdfc",
      glowColor: "rgba(122,215,215,0.16)",
      frameColor: "#b9e5e3",
    },
  ];

  const applyHomePageData = (data, { cacheKey, persist = true } = {}) => {
    if (!data) return;

    setCategoryMap(data.categoryMap || {});
    setSubcategoryMap(data.subcategoryMap || {});
    setCategories(data.categories || [ALL_CATEGORY]);
    setQuickCategories(data.quickCategories || []);
    setProducts(data.products || []);
    setExperienceSections(data.experienceSections || []);
    setOfferSections(data.offerSections || []);
    if (data.heroConfig) setHeroConfig(data.heroConfig);

    setActiveCategory((prev) => {
      const stored = window.sessionStorage.getItem("experienceReturn");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.headerId) {
            const match = (data.formattedHeaders || []).find(
              (h) => h._id === parsed.headerId,
            );
            if (match) return match;
          }
        } catch (e) {}
      }

      if (!prev || prev._id === "all") {
        return data.activeCategory || data.categories?.[0] || ALL_CATEGORY;
      }

      return (
        (data.categories || []).find((cat) => cat._id === prev._id) ||
        data.activeCategory ||
        prev
      );
    });

    if (persist && cacheKey) {
      homePageDataCache.set(cacheKey, data);
    }
  };

  const fetchData = async ({ forceRefresh = false } = {}) => {
    const cacheKey = getHomePageDataCacheKey(currentLocation);
    if (!forceRefresh) {
      const cached = homePageDataCache.get(cacheKey);
      if (cached) {
        applyHomePageData(cached, { cacheKey, persist: false });
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    try {
      const hasValidLocation =
        Number.isFinite(currentLocation?.latitude) &&
        Number.isFinite(currentLocation?.longitude);
      const productParams = { limit: 20 };
      if (hasValidLocation) {
        productParams.lat = currentLocation.latitude;
        productParams.lng = currentLocation.longitude;
      }

      const [catRes, prodRes, expRes, sectionsRes] = await Promise.all([
        customerApi.getCategories(),
        hasValidLocation
          ? customerApi.getProducts(productParams)
          : Promise.resolve({ data: { success: true, result: { items: [] } } }),
        customerApi
          .getExperienceSections({ pageType: "home" })
          .catch(() => null),
        hasValidLocation
          ? customerApi
              .getOfferSections({
                lat: currentLocation.latitude,
                lng: currentLocation.longitude,
              })
              .catch(() => ({ data: {} }))
          : Promise.resolve({ data: { results: [] } }),
      ]);

      const nextHomeData = {
        categories: [ALL_CATEGORY],
        activeCategory: ALL_CATEGORY,
        products: [],
        quickCategories: [],
        experienceSections: [],
        offerSections: [],
        categoryMap: {},
        subcategoryMap: {},
        formattedHeaders: [],
        heroConfig: heroConfigMemoryCache.__home__ || EMPTY_HERO_CONFIG,
      };

      if (catRes.data.success) {
        const dbCats = catRes.data.results || catRes.data.result || [];

        // Build lookup maps for categories & subcategories (used by SectionRenderer)
        const catMap = {};
        const subMap = {};
        dbCats.forEach((c) => {
          if (c.type === "category") {
            catMap[c._id] = c;
          } else if (c.type === "subcategory") {
            subMap[c._id] = c;
          }
        });
        nextHomeData.categoryMap = catMap;
        nextHomeData.subcategoryMap = subMap;

        // 1. Process Header Categories (Main Navigation)
        const formattedHeaders = dbCats
          .filter((cat) => cat.type === "header")
          .map((cat) => {
            const catName = cat.name;

            // Theme / banner still come from local metadata for now
            const meta = CATEGORY_METADATA[catName] ||
              CATEGORY_METADATA[
                catName.charAt(0).toUpperCase() + catName.slice(1).toLowerCase()
              ] ||
              CATEGORY_METADATA[catName.toUpperCase()] || {
                icon: Sparkles,
                theme: DEFAULT_CATEGORY_THEME,
                banner: {
                  title: catName.toUpperCase(),
                  subtitle: "TOP PICKS",
                  floatingElements: "sparkles",
                },
              };

            // Icon is fully driven by admin-chosen iconId, mapped to MUI
            const IconComp =
              (cat.iconId && ICON_COMPONENTS[cat.iconId]) ||
              meta.icon ||
              Sparkles;

            return {
              ...cat,
              id: cat._id,
              iconId: cat.iconId,
              icon: IconComp,
              theme: meta.theme,
              headerColor: cat.headerColor || null,
              headerFontColor: cat.headerFontColor || null,
              headerIconColor: cat.headerIconColor || null,
              banner: { ...meta.banner, textColor: "text-white" },
            };
          });
        nextHomeData.formattedHeaders = formattedHeaders;

        // 1a. Merge admin-configured "All" header color into the static ALL category
        const allHeaderFromAdmin = formattedHeaders.find(
          (h) =>
            (h.slug && h.slug.toLowerCase() === "all") ||
            (h.name && h.name.toLowerCase() === "all"),
        );

        const mergedAllCategory = allHeaderFromAdmin
          ? {
              ...ALL_CATEGORY,
              // Preserve special id/_id used in UI logic, but take color and icon from admin
              headerColor:
                allHeaderFromAdmin.headerColor || ALL_CATEGORY.headerColor,
              headerFontColor:
                allHeaderFromAdmin.headerFontColor || ALL_CATEGORY.headerFontColor,
              headerIconColor:
                allHeaderFromAdmin.headerIconColor || ALL_CATEGORY.headerIconColor,
              icon: allHeaderFromAdmin.icon || ALL_CATEGORY.icon,
            }
          : ALL_CATEGORY;

        const headersWithoutAll = formattedHeaders.filter(
          (h) =>
            !(
              (h.slug && h.slug.toLowerCase() === "all") ||
              (h.name && h.name.toLowerCase() === "all")
            ),
        );

        nextHomeData.categories = [mergedAllCategory, ...headersWithoutAll];
        nextHomeData.activeCategory = mergedAllCategory;

        // 2. Process Quick Navigation Categories (Horizontal Scroll)
        const formattedQuickCats = dbCats
          .filter((cat) => cat.type === "category")
          .map((cat) => ({
            id: cat._id,
            name: cat.name,
            image:
              cat.image ||
              "https://cdn-icons-png.flaticon.com/128/2321/2321831.png",
          }));
        nextHomeData.quickCategories = formattedQuickCats;
      }

      if (prodRes.data.success) {
        const rawResult = prodRes.data.result;
        const dbProds = Array.isArray(prodRes.data.results)
          ? prodRes.data.results
          : Array.isArray(rawResult?.items)
            ? rawResult.items
            : Array.isArray(rawResult)
              ? rawResult
              : [];

        const formattedProds = dbProds.map((p) => ({
          ...p,
          id: p._id,
          image:
            p.mainImage ||
            p.image ||
            "https://images.unsplash.com/photo-1550989460-0adf9ea622e2?auto=format&fit=crop&q=80&w=400&h=400",
          price: p.salePrice || p.price,
          originalPrice: p.price,
          weight: p.weight || "1 unit",
          deliveryTime: "8-15 mins",
        }));
        nextHomeData.products = formattedProds;
      }

      if (expRes && expRes.data && expRes.data.success) {
        const raw = expRes.data.result || expRes.data.results || expRes.data;
        nextHomeData.experienceSections = Array.isArray(raw) ? raw : [];
      }

      const sectionsList =
        sectionsRes?.data?.results ||
        sectionsRes?.data?.result ||
        sectionsRes?.data;
      nextHomeData.offerSections = Array.isArray(sectionsList)
        ? sectionsList
        : [];

      applyHomePageData(nextHomeData, { cacheKey });
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initial data fetch: Consolidate storage check and API calls to prevent double fetching
  useEffect(() => {
    fetchData();
  }, [currentLocation?.latitude, currentLocation?.longitude]); // Refetch when location changes

  // Cache refs to avoid re-fetching on category tab switches
  const headerSectionsCache = useRef(headerSectionsMemoryCache);
  const heroConfigCache = useRef(heroConfigMemoryCache);

  // Fetch header-specific experience sections when active header category changes
  useEffect(() => {
    const fetchHeaderSections = async () => {
      if (!activeCategory || activeCategory._id === "all") {
        setHeaderSections([]);
        return;
      }
      const cacheKey = activeCategory._id;
      // Use cached data if available
      if (headerSectionsCache.current[cacheKey]) {
        setHeaderSections(headerSectionsCache.current[cacheKey]);
        return;
      }
      try {
        const res = await customerApi.getExperienceSections({
          pageType: "header",
          headerId: activeCategory._id,
        });
        if (res.data.success) {
          const raw = res.data.result || res.data.results || res.data;
          const sections = Array.isArray(raw) ? raw : [];
          headerSectionsCache.current[cacheKey] = sections;
          setHeaderSections(sections);
        } else {
          setHeaderSections([]);
        }
      } catch (e) {
        setHeaderSections([]);
      }
    };

    fetchHeaderSections();
  }, [activeCategory]);

  // Fetch hero config (separate from experience sections): header first, then fallback to home
  useEffect(() => {
    const fetchHeroConfig = async () => {
      try {
        const isHeader = activeCategory && activeCategory._id !== "all";
        const cacheKey = isHeader ? activeCategory._id : "__home__";

        // Use cached data if available
        if (heroConfigCache.current[cacheKey]) {
          setHeroConfig(heroConfigCache.current[cacheKey]);
          return;
        }

        let payload = null;
        if (isHeader) {
          const res = await customerApi.getHeroConfig({
            pageType: "header",
            headerId: activeCategory._id,
          });
          if (res.data?.success && res.data?.result) {
            payload = res.data.result;
          }
        }
        if (
          !payload ||
          (payload.banners?.items?.length === 0 && !payload.categoryIds?.length)
        ) {
          const homeRes = await customerApi.getHeroConfig({ pageType: "home" });
          if (homeRes.data?.success && homeRes.data?.result) {
            payload = homeRes.data.result;
          }
        }
        const resolved =
          payload &&
          (payload.banners?.items?.length > 0 ||
            payload.categoryIds?.length > 0)
            ? {
                banners: payload.banners || { items: [] },
                categoryIds: payload.categoryIds || [],
              }
            : { banners: { items: [] }, categoryIds: [] };
        heroConfigCache.current[cacheKey] = resolved;
        if (cacheKey === "__home__") {
          const homeCacheKey = getHomePageDataCacheKey(currentLocation);
          const cachedHomeData = homePageDataCache.get(homeCacheKey);
          if (cachedHomeData) {
            homePageDataCache.set(homeCacheKey, {
              ...cachedHomeData,
              heroConfig: resolved,
            });
          }
        }
        setHeroConfig(resolved);
      } catch (e) {
        setHeroConfig(EMPTY_HERO_CONFIG);
      }
    };

    fetchHeroConfig();
  }, [activeCategory, currentLocation?.latitude, currentLocation?.longitude]);

  // Hint the browser to start fetching the first (LCP) hero banner image ASAP on mobile.
  useEffect(() => {
    const firstUrl = heroConfig?.banners?.items?.[0]?.imageUrl;
    if (!firstUrl) return;

    const href = applyCloudinaryTransform(
      firstUrl,
      "f_auto,q_auto,c_fill,g_auto,w_824,h_380",
    );

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = href || firstUrl;
    link.setAttribute("fetchpriority", "high");

    document.head.appendChild(link);
    return () => {
      if (link.parentNode) link.parentNode.removeChild(link);
    };
  }, [heroConfig?.banners?.items?.[0]?.imageUrl]);

  // Autoplay for Mobile Banner Carousel (smooth, one-direction loop)
  useEffect(() => {
    const totalSlides = 3; // keep in sync with rendered slides
    const intervalId = setInterval(() => {
      setMobileBannerIndex((prev) => {
        // Prevent index from growing unbounded (which would push banners off-screen)
        if (prev >= totalSlides - 1) return prev;
        return prev + 1;
      });
    }, 3500);

    return () => clearInterval(intervalId);
  }, []);

  // After an instant jump back to first slide, re-enable transition
  useEffect(() => {
    if (!isInstantBannerJump) return;
    const id = requestAnimationFrame(() => setIsInstantBannerJump(false));
    return () => cancelAnimationFrame(id);
  }, [isInstantBannerJump]);

  const handleBannerTransitionEnd = () => {
    const totalSlides = 3; // real1, real2, clone(real1)
    if (mobileBannerIndex === totalSlides - 1) {
      // Instantly jump back to the first slide without any reverse animation
      setIsInstantBannerJump(true);
      setMobileBannerIndex(0);
    }
  };

  const bestsellerCategories = useMemo(() => {
    // Group products by category and take top 4 images for each
    const grouped = {};
    products.forEach((p) => {
      const catId = p.categoryId?._id || "other";
      const catName = p.categoryId?.name || "Other";
      if (!grouped[catId]) {
        grouped[catId] = { id: catId, name: catName, images: [] };
      }
      if (grouped[catId].images.length < 4) {
        grouped[catId].images.push(p.image);
      }
    });
    return Object.values(grouped).slice(0, 6);
  }, [products]);

  const productsById = useMemo(() => {
    const map = {};
    products.forEach((p) => {
      map[p._id || p.id] = p;
    });
    return map;
  }, [products]);

  // Quick categories: from hero config (separate section) or global quickCategories
  const effectiveQuickCategories = useMemo(() => {
    const ids = heroConfig.categoryIds || [];
    if (ids.length > 0) {
      const resolved = ids
        .map((id) => categoryMap[id])
        .filter(Boolean)
        .map((c) => ({
          id: c._id,
          name: c.name,
          image:
            c.image ||
            "https://cdn-icons-png.flaticon.com/128/2321/2321831.png",
        }));
      if (resolved.length > 0) return resolved;
    }
    return quickCategories;
  }, [heroConfig.categoryIds, categoryMap, quickCategories]);

  // Experience sections for main content (all sections; hero is separate)
  const sectionsForRenderer = headerSections.length
    ? headerSections
    : experienceSections;

  // Fade out banner as user scrolls (0 to 100px)
  // Parallax effect for banner - moves slower than scroll
  // When heroVisible is false, use [0,0] input range so transforms produce a static value
  const opacity = useTransform(
    scrollY,
    heroVisible ? [0, 300] : [0, 0],
    [1, 0.6],
  );
  const y = useTransform(scrollY, heroVisible ? [0, 300] : [0, 0], [0, 80]); // Positive Y moves down as we scroll up = Parallax
  const scale = useTransform(
    scrollY,
    heroVisible ? [0, 300] : [0, 0],
    [1, 0.95],
  );
  const pointerEvents = useTransform(scrollY, heroVisible ? [0, 100] : [0, 0], [
    "auto",
    "none",
  ]);
  // When returning from a category page, scroll back to the section that was clicked
  useEffect(() => {
    if (!pendingReturn?.sectionId) return;

    const allSections = headerSections.length
      ? headerSections
      : experienceSections;
    if (!allSections.length) return;

    const exists = allSections.some((s) => s._id === pendingReturn.sectionId);
    if (!exists) return;

    const id = `section-${pendingReturn.sectionId}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "instant", block: "start" });
      window.sessionStorage.removeItem("experienceReturn");
      setPendingReturn(null);
    }
  }, [headerSections, experienceSections, pendingReturn]);

  // Helper to render dynamic floating elements
  // isVisible: when false, animations are paused (idle state) to save CPU
  const renderFloatingElements = (type, isVisible = true) => {
    const count = 10; // Optimized count for performance

    const getParticleContent = (index) => {
      switch (type) {
        case "hearts":
          return (
            <Heart
              fill="white"
              size={12 + (index % 5) * 2}
              className="drop-shadow-sm"
            />
          );
        case "snow":
          return (
            <Snowflake
              fill="white"
              size={10 + (index % 4) * 3}
              className="drop-shadow-sm"
            />
          );
        case "stars":
        case "sparkles":
          return (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="white"
              className="drop-shadow-md">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          );
        default:
          return (
            <div
              className="bg-white/40 rounded-full blur-[1px]"
              style={{
                width: 4 + (index % 3) * 3,
                height: 4 + (index % 3) * 3,
              }}
            />
          );
      }
    };

    return [...Array(count)].map((_, i) => {
      const duration = 15 + Math.random() * 20;
      const delay = Math.random() * -20;
      const startX = Math.random() * 100;
      const startY = Math.random() * 100;
      const depth = 0.5 + Math.random() * 0.5; // Parallax depth

      return (
        <motion.div
          key={i}
          className="absolute pointer-events-none"
          style={{
            left: `${startX}%`,
            top: `${startY}%`,
            opacity: 0.1 * depth,
            zIndex: Math.floor(depth * 10),
          }}
          animate={
            isVisible
              ? {
                  x: [0, 50, -50, 0],
                  y: [0, -100, -50, 0],
                  rotate: [0, 360],
                  scale: [depth, depth * 1.2, depth],
                }
              : { x: 0, y: 0, rotate: 0, scale: depth }
          }
          transition={
            isVisible
              ? {
                  duration: duration / depth,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: delay,
                }
              : { duration: 0 }
          }>
          <div className="transform-gpu">{getParticleContent(i)}</div>
        </motion.div>
      );
    });
  };

  return (
    <div
      className={`min-h-screen pt-[216px] md:pt-[250px] ${products.length === 0 && !isLoading ? "bg-white" : "bg-[#F5F7F8]"}`}>
      {/* Top Dynamic Gradient Section */}
      <div
        className={cn("contents", isProductDetailOpen && "hidden md:contents")}>
        <MainLocationHeader
          categories={categories}
          activeCategory={activeCategory}
          onCategorySelect={setActiveCategory}
        />
      </div>

      {/* Main Page Content - Conditionally Hidden if No Service */}
      {products.length === 0 && !isLoading ? (
        <div className="flex flex-col items-center justify-center pt-24 pb-48 animate-in fade-in zoom-in duration-700">
          <div className="w-64 h-64 md:w-96 md:h-96 mb-8">
            {noServiceData ? (
              <Lottie animationData={noServiceData} loop={true} />
            ) : (
              <div className="w-64 h-64 md:w-96 md:h-96" />
            )}
          </div>
          <h3 className="text-3xl md:text-5xl font-black text-slate-800 tracking-tight mb-4 text-center px-4 uppercase">
            Service <span className="text-primary">Unavailable</span>
          </h3>
          <p className="text-slate-500 font-bold max-w-md text-center px-10 text-sm md:text-lg leading-relaxed opacity-80">
            Ah! We haven't reached your neighborhood yet. We're expanding
            rapidly to bring {settings?.appName || "Noyo"} to every corner.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => window.location.reload()}
            className="mt-12 px-10 py-4 bg-primary text-primary-foreground font-black rounded-[24px] uppercase text-[13px] tracking-[0.2em] transition-all">
            Check Again
          </motion.button>
        </div>
      ) : (
        <>
          {/* Hero Banners (mobile): admin-configured or static fallback */}
          <motion.div
            ref={heroRef}
            className="block md:hidden -mt-[18px] will-change-transform"
            style={{ opacity, y, scale, pointerEvents }}>
            <div>
              <div className="relative w-full overflow-hidden">
                {heroConfig.banners?.items?.length ? (
                  <ExperienceBannerCarousel
                    section={{ title: "" }}
                    items={heroConfig.banners.items}
                    fullWidth
                    edgeToEdge
                  />
                ) : (
                  <motion.div
                    drag="x"
                    dragConstraints={{ left: 0, right: 0 }}
                    dragElastic={0.2}
                    onDragEnd={(_, info) => {
                      const threshold = 50;
                      if (info.offset.x < -threshold) {
                        setMobileBannerIndex((prev) => Math.min(prev + 1, 2));
                      } else if (info.offset.x > threshold) {
                        setMobileBannerIndex((prev) => Math.max(prev - 1, 0));
                      }
                    }}
                    animate={{ x: `-${(mobileBannerIndex / 3) * 100}%` }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="flex touch-pan-y"
                    style={{ width: "300%" }}
                    onTransitionEnd={handleBannerTransitionEnd}>
                    <motion.div
                      onClick={() => navigate("/category/all")}
                      whileTap={{ scale: 0.96 }}
                      className="min-w-full">
                      <div className="w-full h-[190px] bg-[#ecfeff] p-6 relative overflow-hidden flex items-center border-y border-primary/10 shadow-[0_4px_15px_rgba(0,0,0,0.05)]">
                        <div className="relative z-10 w-3/5 flex flex-col items-start gap-2">
                          <div className="flex flex-col gap-0.5">
                            <h4 className="text-2xl font-black text-[#1A1A1A] tracking-tight leading-none">
                              Get{" "}
                              <span className="text-primary">Products</span>
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-sm font-black text-gray-700">
                                at
                              </span>
                              <div className="bg-primary text-primary-foreground px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                                <VerifiedIcon sx={{ fontSize: 16 }} />
                                <span className="text-xl font-bold">₹0</span>
                              </div>
                              <span className="text-sm font-semibold text-gray-700">
                                Fee
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] font-bold text-gray-500 max-w-[150px] leading-tight">
                            Get groceries delivered in minutes
                          </p>
                          <button className="bg-[#FF1E56] text-white px-6 py-2.5 rounded-2xl font-black text-xs tracking-wide shadow-lg shadow-rose-200 mt-2">
                            Order now
                          </button>
                        </div>
                        <div className="absolute right-[-10px] bottom-0 top-0 w-2/5 flex items-center justify-center">
                          <img
                            src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400"
                            alt="Promo"
                            className="w-full h-full object-contain rotate-3 scale-110 pointer-events-none"
                          />
                        </div>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mt-12 -mr-12" />
                      </div>
                    </motion.div>
                    <motion.div
                      onClick={() => navigate("/categories")}
                      whileTap={{ scale: 0.96 }}
                      className="min-w-full">
                      <div className="w-full h-[190px] bg-white relative overflow-hidden flex border-y border-gray-100 shadow-[0_4px_15px_rgba(0,0,0,0.05)] group">
                        <img
                          src={CardBanner}
                          alt="Promotion"
                          loading="lazy"
                          className="w-full h-full object-fill pointer-events-none"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-black/5 to-transparent pointer-events-none" />
                      </div>
                    </motion.div>
                    <motion.div
                      onClick={() => navigate("/category/all")}
                      whileTap={{ scale: 0.96 }}
                      className="min-w-full">
                      <div className="w-full h-[190px] bg-[#ecfeff] p-6 relative overflow-hidden flex items-center border-y border-primary/10 shadow-[0_4px_15px_rgba(0,0,0,0.05)]">
                        <div className="relative z-10 w-3/5 flex flex-col items-start gap-2">
                          <div className="flex flex-col gap-0.5">
                            <h4 className="text-2xl font-black text-[#1A1A1A] tracking-tight leading-none">
                              Get{" "}
                              <span className="text-primary">Products</span>
                            </h4>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-sm font-black text-gray-700">
                                at
                              </span>
                              <div className="bg-primary text-primary-foreground px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-sm">
                                <VerifiedIcon sx={{ fontSize: 16 }} />
                                <span className="text-xl font-bold">₹0</span>
                              </div>
                              <span className="text-sm font-semibold text-gray-700">
                                Fee
                              </span>
                            </div>
                          </div>
                          <p className="text-[11px] font-bold text-gray-500 max-w-[150px] leading-tight">
                            Get groceries delivered in minutes
                          </p>
                          <button className="bg-[#FF1E56] text-white px-6 py-2.5 rounded-2xl font-black text-xs tracking-wide shadow-lg shadow-rose-200 mt-2">
                            Order now
                          </button>
                        </div>
                        <div className="absolute right-[-10px] bottom-0 top-0 w-2/5 flex items-center justify-center">
                          <img
                            src="https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=400"
                            alt="Promo"
                            loading="lazy"
                            className="w-full h-full object-contain rotate-3 scale-110 pointer-events-none"
                          />
                        </div>
                        <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl -mt-12 -mr-12" />
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Promo Marquee Strip */}
          <div className="w-full -mt-[2px] md:-mt-[2px] mb-4">
            <div className="relative overflow-hidden border-y border-[#389ecb] bg-primary shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
              <div className="absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-primary via-primary/90 to-transparent pointer-events-none" />
              <div className="absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-primary via-primary/90 to-transparent pointer-events-none" />
              <div className="classic-marquee-track flex w-max items-center gap-4 px-3 py-1.5 text-sm font-semibold text-white -translate-y-[5px] md:px-6 md:py-2 md:text-base">
                {[...MARQUEE_MESSAGES, ...MARQUEE_MESSAGES].map(
                  (message, idx) => (
                    <React.Fragment key={`${message}-${idx}`}>
                      <span className="whitespace-nowrap">{message}</span>
                      <span className="text-white/60">•</span>
                    </React.Fragment>
                  ),
                )}
                <span className="whitespace-nowrap">❤️</span>
                <span className="whitespace-nowrap">🎁</span>
              </div>
            </div>
          </div>

          {/* Quick Navigation Category Slider (admin-configured or global fallback) */}
          {effectiveQuickCategories.length > 0 && (
            <div className="w-full mb-5 -mt-[24px] md:mt-3 overflow-hidden relative group z-20">
              <div
                className="relative overflow-hidden bg-white shadow-[0_14px_28px_rgba(15,23,42,0.09)]"
                style={{
                  backgroundImage: `linear-gradient(180deg, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.65) 100%), url(${QuickCategoriesBg})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}>
                <div className="absolute inset-0 bg-white/10 pointer-events-none" />

                <div className="relative z-10 px-4 pt-3 pb-1 md:px-8 md:pt-4">
                  <h2 className="text-center text-[18px] md:text-[20px] font-bold tracking-tight text-[#132018] leading-none">
                    Quick categories
                  </h2>
                </div>

                {/* Left Scroll Button */}
                <div className="absolute left-4 lg:left-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => scrollQuickCats("left")}
                    className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all">
                    <ChevronLeft size={22} strokeWidth={3} />
                  </motion.button>
                </div>

                <div
                  ref={quickCatsRef}
                  className="relative z-10 flex items-start gap-2.5 md:gap-3 lg:gap-4 overflow-x-auto no-scrollbar px-4 pb-3 pt-1 md:px-8 md:pb-4 snap-x scroll-smooth">
                  {effectiveQuickCategories.map((cat, idx) => {
                    const palette =
                      quickCategoryPalettes[idx % quickCategoryPalettes.length];
                    return (
                      <motion.div
                        key={cat.id}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => navigate(`/category/${cat.id}`)}
                        className="flex flex-col items-center gap-1 min-w-[84px] md:min-w-[112px] lg:min-w-[128px] cursor-pointer group/item snap-start">
                        <div
                          className="relative w-[84px] h-[96px] md:w-[112px] md:h-[126px] lg:w-[128px] lg:h-[140px] rounded-[22px] shadow-[0_10px_22px_rgba(15,23,42,0.10)] border flex items-start justify-center p-2 transition-all duration-300 group-hover/item:-translate-y-1 group-hover/item:shadow-[0_16px_30px_rgba(15,23,42,0.14)] overflow-hidden"
                          style={{
                            backgroundImage: `linear-gradient(135deg, rgba(255,255,255,0.96) 0%, rgba(255,255,255,0.6) 24%, rgba(255,255,255,0.15) 100%), linear-gradient(135deg, ${palette.bgFrom}, ${palette.bgVia}, ${palette.bgTo})`,
                            borderColor: palette.frameColor,
                          }}>
                          <div
                            className="absolute inset-0 opacity-40 pointer-events-none"
                            style={{ backgroundColor: palette.glowColor }}
                          />
                          <img
                            src={applyCloudinaryTransform(cat.image)}
                            alt={cat.name}
                            loading="lazy"
                            className="absolute left-1/2 top-3 z-10 h-[68px] w-[68px] -translate-x-1/2 object-contain drop-shadow-[0_5px_12px_rgba(0,0,0,0.10)] mix-blend-multiply group-hover/item:scale-110 transition-transform duration-500"
                          />
                          <div className="absolute inset-x-2 bottom-1.5 z-20 text-center">
                            <span className="block text-[10px] md:text-[11px] lg:text-[12px] font-semibold text-[#1f2b20] leading-tight whitespace-nowrap overflow-hidden text-ellipsis drop-shadow-[0_1px_0_rgba(255,255,255,0.65)] group-hover/item:text-primary transition-colors">
                              {cat.name}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Right Scroll Button */}
                <div className="absolute right-4 lg:right-10 top-[58%] -translate-y-1/2 z-20 hidden md:flex">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => scrollQuickCats("right")}
                    className="h-10 w-10 bg-white/90 backdrop-blur-md shadow-xl rounded-full flex items-center justify-center border border-gray-100 cursor-pointer hover:bg-white text-primary transition-all">
                    <ChevronRight size={22} strokeWidth={3} />
                  </motion.button>
                </div>
              </div>
            </div>
          )}

          {/* Lowest Price ever Section  (kept as static for now) */}
          <div className="-mt-[40px] mb-4 md:-mt-[40px] md:mb-8">
            <div className="relative overflow-hidden bg-linear-to-br from-primary/10 via-primary/5 to-transparent pt-7 pb-2 md:pt-16 md:pb-4 border-y border-primary/10 shadow-sm md:shadow-[inset_0_-10px_40px_rgba(0,0,0,0.02)]">
              {/* Background Decoration */}
              <div className="absolute -top-10 -right-10 h-40 w-40 md:h-80 md:w-80 bg-primary/10 rounded-full blur-3xl opacity-60" />
              <div className="absolute -bottom-10 -left-10 h-40 w-40 md:h-80 md:w-80 bg-yellow-400/10 rounded-full blur-3xl opacity-60" />

              <div className="container mx-auto px-4 md:px-8 lg:px-[50px] relative z-10">
                <div className="flex justify-between items-center mb-6 md:mb-10 px-1">
                  <div className="flex flex-col">
                    <h3 className="text-base md:text-xl font-black text-[#1A1A1A] tracking-tight uppercase leading-none pt-[25px]">
                      Lowest Price <span className="text-primary">ever</span>
                    </h3>
                    <div className="flex items-center gap-1.5 md:gap-2 mt-1.5 md:mt-3">
                      <div className="h-1 w-1 md:h-2 md:w-2 bg-primary rounded-full animate-pulse shadow-[0_0_8px_rgba(12,131,31,0.5)]" />
                      <span className="text-[10px] md:text-xs font-bold text-primary uppercase tracking-wide opacity-80">
                        Unbeatable Savings • Updated hourly
                      </span>
                    </div>
                  </div>
                  <motion.button
                    onClick={() => navigate("/category/all")}
                    whileHover={{ x: 5, scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-1 bg-white px-2.5 py-1 md:px-4 md:py-2 rounded-full text-primary font-bold text-[11px] md:text-sm cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.05)] md:shadow-md border border-primary/10 transition-all whitespace-nowrap">
                    See all
                    <ChevronRight
                      size={12}
                      className="ml-0.5"
                      strokeWidth={3}
                    />
                  </motion.button>
                </div>

                <div className="relative z-10 flex overflow-x-auto gap-3 md:gap-6 pb-2 md:pb-3 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory scroll-smooth">
                  {products.slice(0, 12).map((product) => (
                    <div
                      key={product.id}
                      className="w-[140px] md:w-[140px] shrink-0 snap-start">
                      <ProductCard
                        product={product}
                        className="bg-white shadow-[0_8px_20px_-8px_rgba(0,0,0,0.1)] md:shadow-[0_15px_30px_rgba(0,0,0,0.05)] border-brand-50/50 md:border-slate-100 transition-all"
                        compact={true}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Offer Sections (admin-configured: Trending, etc.) */}
          {offerSections.length > 0 && (
            <div className="w-full px-0 pt-0 pb-2 md:pb-4">
              {[...offerSections]
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((section) => {
                  const bgColor = getBackgroundColorByValue(
                    section.backgroundColor,
                  );
                  const sectionProducts = (section.productIds || [])
                    .filter((p) => typeof p === "object" && p !== null)
                    .map((p) => ({
                      id: p._id,
                      _id: p._id,
                      name: p.name,
                      image: p.mainImage || p.image || "",
                      price: p.salePrice ?? p.price,
                      originalPrice: p.price ?? p.salePrice,
                      weight: p.weight,
                      deliveryTime: p.deliveryTime,
                    }));
                  return (
                    <motion.div
                      key={section._id}
                      initial={{ opacity: 0, y: 24 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, amount: 0.25 }}
                      transition={{ duration: 0.4 }}
                      className="mb-4 rounded-none overflow-hidden shadow-[0_18px_35px_rgba(15,23,42,0.16)] bg-white border-y border-slate-100/70 border-x-0 md:border-x">
                      <div
                        className="relative flex items-center justify-between px-5 md:px-8 py-5 md:py-6 text-black"
                        style={{
                          backgroundColor: bgColor,
                          backgroundImage: getBackgroundGradientByValue(
                            section.backgroundColor,
                          ),
                        }}>
                        <div className="pointer-events-none absolute inset-0 overflow-hidden">
                          <div className="absolute -top-10 -left-10 w-40 h-40 md:w-56 md:h-56 bg-white/20 rounded-full blur-3xl" />
                          <div className="absolute -bottom-10 right-0 w-44 h-44 bg-white/10 rounded-full blur-3xl" />
                        </div>
                        <div className="flex-1 pr-4">
                          <p className="text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-black/60 mb-1">
                            Trending right now
                          </p>
                          <h3 className="text-xl md:text-2xl font-bold tracking-tight leading-tight drop-shadow-sm">
                            {section.title}
                          </h3>
                          {((section.categoryIds || [])
                            .map((c) =>
                              typeof c === "object" && c?.name ? c.name : null,
                            )
                            .filter(Boolean)
                            .join(", ") ||
                            section.categoryId?.name) && (
                            <p className="text-[11px] md:text-xs font-semibold text-black/75 mt-1">
                              {(section.categoryIds || [])
                                .map((c) =>
                                  typeof c === "object" && c?.name
                                    ? c.name
                                    : null,
                                )
                                .filter(Boolean)
                                .join(", ") || section.categoryId?.name}
                            </p>
                          )}
                        </div>
                        <motion.div
                          whileHover={{ y: -4, rotate: -4, scale: 1.06 }}
                          transition={{
                            type: "spring",
                            stiffness: 260,
                            damping: 18,
                          }}
                          className="w-20 h-20 md:w-24 md:h-24 rounded-2xl flex-shrink-0 shadow-[0_16px_30px_rgba(0,0,0,0.25)] border border-black/10 overflow-hidden relative bg-black/10">
                          {sectionProducts[0]?.image ? (
                            <>
                              <img
                                src={applyCloudinaryTransform(
                                  sectionProducts[0].image,
                                )}
                                alt={section.title}
                                loading="lazy"
                                className="absolute inset-0 w-full h-full object-cover scale-110"
                              />
                              <div className="absolute inset-0 bg-gradient-to-tr from-black/60 via-black/20 to-transparent" />
                              <div className="absolute -bottom-6 -right-6 w-16 h-16 rounded-full bg-amber-400/60 blur-xl mix-blend-screen" />
                            </>
                          ) : (
                            <div className="absolute inset-0 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500" />
                          )}

                          {sectionProducts.length > 0 && (
                            <div className="absolute top-1 left-1 px-2 py-0.5 rounded-full bg-black/70 text-[9px] font-semibold text-white/90 tracking-wide flex items-center gap-1">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-400" />
                              {sectionProducts.length} items
                            </div>
                          )}

                          <div className="relative z-10 flex items-center justify-center h-full">
                            <Sparkles
                              className="text-amber-200 drop-shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                              size={30}
                            />
                          </div>
                        </motion.div>
                      </div>
                      <div className="px-4 pt-4 md:px-5 md:pt-5 pb-1">
                        <div className="flex overflow-x-auto gap-3 md:gap-4 pb-0 no-scrollbar snap-x snap-mandatory">
                          {sectionProducts.length === 0 ? (
                            <div className="w-full py-10 flex flex-col items-center justify-center text-center">
                              <div className="w-32 h-32 mb-3">
                                {noServiceData ? (
                                  <Lottie
                                    animationData={noServiceData}
                                    loop={true}
                                  />
                                ) : (
                                  <div className="w-32 h-32" />
                                )}
                              </div>
                              <p className="text-sm md:text-base text-slate-400 font-bold">
                                Looking for the best items in this category...
                              </p>
                            </div>
                          ) : (
                            sectionProducts.map((product) => (
                              <div
                                key={product.id}
                                className="w-[140px] md:w-[140px] flex-shrink-0 snap-start">
                                <ProductCard
                                  product={product}
                                  className="bg-white border border-slate-100 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                                  compact
                                />
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          )}

          {/* Main Content Area */}
          {sectionsForRenderer.length > 0 && (
            <div className="container mx-auto px-4 md:px-8 lg:px-[50px] py-10 md:py-16">
              <SectionRenderer
                sections={sectionsForRenderer}
                productsById={productsById}
                categoriesById={categoryMap}
                subcategoriesById={subcategoryMap}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Home;
