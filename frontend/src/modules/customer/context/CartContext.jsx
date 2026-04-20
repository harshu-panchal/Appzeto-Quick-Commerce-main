import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from "react";
import { customerApi } from "../services/customerApi";
import { useAuth } from "../../../core/context/AuthContext";

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [cart, setCart] = useState(() => {
    try {
      const savedCart = localStorage.getItem("cart");
      return savedCart ? JSON.parse(savedCart) : [];
    } catch (error) {
      console.error("Failed to load cart from localStorage", error);
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const pendingRequestsRef = React.useRef(0);
  const lsDebounceRef = useRef(null);

  // Clear cart locally when user logs out is handled by the useEffect dependency on isAuthenticated
  const normalizeBackendCart = (items) => {
    if (!items) return [];
    return items.map((item) => {
      const product = item.productId;
      const variantKey = String(item.variantSku || "").trim();
      const { price, salePrice, variantName } = resolveVariantPricing(product, variantKey);
      return {
        ...product,
        id: product?._id, // Normalize ID
        quantity: item.quantity,
        variantSku: variantKey,
        variantName,
        price,
        salePrice,
        image: product?.mainImage, // Handle mapping for frontend
      };
    });
  };

  const resolveVariantPricing = (product, variantSku = "") => {
    const normalizedKey = String(variantSku || "").trim();
    if (!normalizedKey) {
      return {
        price: Number(product?.price || 0),
        salePrice: Number(product?.salePrice || 0),
        variantName: "",
      };
    }

    const variants = Array.isArray(product?.variants) ? product.variants : [];
    const hit = variants.find((v) => {
      const sku = String(v?.sku || "").trim();
      const name = String(v?.name || "").trim();
      return (sku && sku === normalizedKey) || (!sku && name === normalizedKey) || name === normalizedKey;
    });
    return {
      price: Number(hit?.price || product?.price || 0),
      salePrice: Number(hit?.salePrice || 0),
      variantName: String(hit?.name || "").trim(),
    };
  };

  const syncCart = (backendItems) => {
    // Only update state from backend if no more pending optimistic updates
    if (pendingRequestsRef.current === 0) {
      setCart(normalizeBackendCart(backendItems));
    }
  };

  const fetchCart = async () => {
    if (isAuthenticated) {
      setLoading(true);
      try {
        const response = await customerApi.getCart();
        setCart(normalizeBackendCart(response.data.result.items));
      } catch (error) {
        console.error("Failed to fetch cart from backend", error);
      } finally {
        setLoading(false);
      }
    }
  };

  // Fetch cart from backend on mount or authentication change
  useEffect(() => {
    if (isAuthenticated) {
      fetchCart();
    } else {
      // Clear cart state and load from local storage for guests
      try {
        const savedCart = localStorage.getItem("cart");
        setCart(savedCart ? JSON.parse(savedCart) : []);
      } catch (error) {
        setCart([]);
      }
    }
  }, [isAuthenticated]);

  // Save local cart to localStorage (fallback/guest mode) — debounced to 300 ms
  useEffect(() => {
    if (isAuthenticated) return;           // backend is source of truth

    clearTimeout(lsDebounceRef.current);
    lsDebounceRef.current = setTimeout(() => {
      localStorage.setItem("cart", JSON.stringify(cart));
    }, 300);

    return () => {
      if (isAuthenticated) return;
      // Flush on unmount — no data loss
      clearTimeout(lsDebounceRef.current);
      localStorage.setItem("cart", JSON.stringify(cart));
    };
  }, [cart, isAuthenticated]);

  const addToCart = async (product) => {
    const variantSku = String(product?.variantSku || product?.variantName || "").trim();
    const id = product.id || product._id;
    const key = `${id}::${variantSku || ""}`;
    const { price, salePrice, variantName } = resolveVariantPricing(product, variantSku);

    // Optimistic UI update for instant feedback
    setCart((prev) => {
      const existingItem = prev.find(
        (item) => `${item.id || item._id}::${String(item.variantSku || "").trim()}` === key,
      );
      if (existingItem) {
        return prev.map((item) =>
          `${item.id || item._id}::${String(item.variantSku || "").trim()}` === key
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        );
      }

      return [
        ...prev,
        {
          ...product,
          id,
          variantSku,
          variantName,
          price,
          salePrice,
          quantity: 1,
          image: product.image || product.mainImage,
        },
      ];
    });

    if (isAuthenticated) {
      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.addToCart({
          productId: id,
          variantSku,
          quantity: 1,
        });
        pendingRequestsRef.current -= 1;
        await syncCart(response.data.result.items);
      } catch (error) {
        pendingRequestsRef.current -= 1;
        console.error("Error adding to cart on backend", error);
        // Re-fetch entire cart to ensure consistency on error
        if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }
  };

  const removeFromCart = async (productId, variantSku = "") => {
    const normalizedVariantSku = String(variantSku || "").trim();
    const key = `${productId}::${normalizedVariantSku || ""}`;

    // Optimistic update (remove only the matching line when variantSku is provided).
    setCart((prev) =>
      prev.filter(
        (item) =>
          `${item.id || item._id}::${String(item.variantSku || "").trim()}` !==
          key,
      ),
    );

    if (isAuthenticated) {
      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.removeFromCart(
          productId,
          normalizedVariantSku,
        );
        pendingRequestsRef.current -= 1;
        await syncCart(response.data.result.items);
      } catch (error) {
        pendingRequestsRef.current -= 1;
        console.error("Error removing from cart on backend", error);
        if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }
  };

  const updateQuantity = async (productId, delta, variantSku = "") => {
    const normalizedVariantSku = String(variantSku || "").trim();
    const key = `${productId}::${normalizedVariantSku || ""}`;
    const currentItem = cart.find(
      (item) =>
        `${item.id || item._id}::${String(item.variantSku || "").trim()}` === key,
    );
    if (!currentItem) return;

    const newQty = Math.max(0, currentItem.quantity + delta);

    if (newQty === 0) {
      removeFromCart(productId, normalizedVariantSku);
      return;
    }

    // Optimistic update
    setCart((prev) =>
      prev.map((item) => {
        if (
          `${item.id || item._id}::${String(item.variantSku || "").trim()}` ===
          key
        ) {
          return { ...item, quantity: newQty };
        }
        return item;
      }),
    );

    if (isAuthenticated) {
      pendingRequestsRef.current += 1;
      try {
        const response = await customerApi.updateCartQuantity({
          productId,
          quantity: newQty,
          variantSku: normalizedVariantSku,
        });
        pendingRequestsRef.current -= 1;
        await syncCart(response.data.result.items);
      } catch (error) {
        pendingRequestsRef.current -= 1;
        console.error("Error updating quantity on backend", error);
        if (pendingRequestsRef.current === 0) {
          await fetchCart();
        }
      }
    }
  };

  const clearCart = async () => {
    if (isAuthenticated) {
      try {
        await customerApi.clearCart();
        setCart([]);
      } catch (error) {
        console.error("Error clearing cart on backend", error);
      }
    } else {
      setCart([]);
    }
  };

  const cartTotal = cart.reduce((total, item) => {
    const unit =
      Number(item.salePrice || 0) > 0 && Number(item.salePrice) < Number(item.price || 0)
        ? Number(item.salePrice)
        : Number(item.price || 0);
    return total + unit * Number(item.quantity || 0);
  }, 0);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);

  const cartValue = useMemo(() => ({
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartTotal,
    cartCount,
    loading,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [cart, cartTotal, cartCount, loading]);

  return (
    <CartContext.Provider value={cartValue}>
      {children}
    </CartContext.Provider>
  );
};
