import React from "react";
import { Link } from "react-router-dom";
import { Heart, Plus, Minus, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWishlist } from "../../context/WishlistContext";
import { useCart } from "../../context/CartContext";
import { useToast } from "@shared/components/ui/Toast";
import { useCartAnimation } from "../../context/CartAnimationContext";
import { applyCloudinaryTransform } from "@/core/utils/imageUtils";

import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";

import { useProductDetail } from "../../context/ProductDetailContext";

const ProductCard = React.memo(
  ({ product, badge, className, compact = false, neutralBg = false }) => {
    const { toggleWishlist: toggleWishlistGlobal, isInWishlist } =
      useWishlist();
    const { cart, addToCart, updateQuantity, removeFromCart } = useCart();
    const { showToast } = useToast();
    const { animateAddToCart, animateRemoveFromCart } = useCartAnimation();

    const { openProduct } = useProductDetail();
    const [showHeartPopup, setShowHeartPopup] = React.useState(false);

    const imageRef = React.useRef(null);

    const defaultVariant = React.useMemo(() => {
      const variants = Array.isArray(product?.variants) ? product.variants : [];
      if (variants.length === 0) return null;

      const displayed = Number(product?.price || 0);
      const displayedOriginal = Number(product?.originalPrice || 0);

      const matchesDisplayedPrice = (variant) => {
        const mrp = Number(variant?.price || 0);
        const sale = Number(variant?.salePrice || 0);
        const effective = sale > 0 && sale < mrp ? sale : mrp;

        if (Number.isFinite(displayedOriginal) && displayedOriginal > displayed) {
          // Try to match both (sale + original) when card shows a discount.
          if (effective === displayed && (mrp === displayedOriginal || displayedOriginal === 0)) {
            return true;
          }
        }

        return effective === displayed || mrp === displayed;
      };

      const picked = variants.find(matchesDisplayedPrice) || variants[0];
      const key = String(picked?.sku || picked?.name || "").trim();
      return {
        key,
        name: String(picked?.name || "").trim(),
      };
    }, [product]);

    const productId = product.id || product._id;
    const variantKey = String(defaultVariant?.key || "").trim();
    const cartKey = `${productId}::${variantKey || ""}`;

    const cartItem = React.useMemo(
      () =>
        cart.find(
          (item) =>
            `${item.id || item._id}::${String(item.variantSku || "").trim()}` ===
            cartKey,
        ),
      [cart, cartKey],
    );
    const quantity = cartItem ? cartItem.quantity : 0;
    const isWishlisted = isInWishlist(product.id || product._id);

    const handleProductClick = React.useCallback(
      (e) => {
        if (openProduct) {
          e.preventDefault();
          openProduct(product);
        }
      },
      [openProduct, product],
    );

    const toggleWishlist = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!isWishlisted) {
          setShowHeartPopup(true);
          setTimeout(() => setShowHeartPopup(false), 1000);
        }

        toggleWishlistGlobal(product);
        showToast(
          isWishlisted
            ? `${product.name} removed from wishlist`
            : `${product.name} added to wishlist`,
          isWishlisted ? "info" : "success",
        );
      },
      [isWishlisted, toggleWishlistGlobal, product, showToast],
    );

    const handleAddToCart = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (imageRef.current) {
          animateAddToCart(
            imageRef.current.getBoundingClientRect(),
            product.image,
          );
        }
        addToCart({
          ...product,
          variantSku: variantKey,
          variantName: defaultVariant?.name || "",
        });
      },
      [animateAddToCart, product, addToCart, variantKey, defaultVariant?.name],
    );

    const handleIncrement = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        updateQuantity(productId, 1, variantKey);
      },
      [updateQuantity, productId, variantKey],
    );

    const handleDecrement = React.useCallback(
      (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (quantity === 1) {
          animateRemoveFromCart(product.image);
          removeFromCart(productId, variantKey);
        } else {
          updateQuantity(productId, -1, variantKey);
        }
      },
      [
        quantity,
        animateRemoveFromCart,
        product.image,
        removeFromCart,
        productId,
        updateQuantity,
        variantKey,
      ],
    );

    return (
      <motion.div
        whileHover={{ scale: 1.02 }}
        className={cn(
          "flex-shrink-0 w-full rounded-lg sm:rounded-2xl overflow-hidden flex flex-col h-full shadow-sm cursor-pointer transition-all duration-300",
          compact
            ? "bg-white border-[1.5px] border-brand-50 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.08)]"
            : neutralBg
              ? "bg-white border border-slate-100 shadow-[0_8px_20px_-8px_rgba(0,0,0,0.08)]"
              : "bg-primary/10 border border-primary/20",
          className,
        )}
        onClick={handleProductClick}>
        {/* Top Image Section */}
        <div
          className={cn(
            "relative pb-0",
            compact ? "p-0.5" : "p-1 sm:p-2.5",
          )}>
          {/* Badge (Custom or Discount) */}
          {(badge ||
            product.discount ||
            product.originalPrice > product.price) && (
              <div
                className={cn(
                  "absolute z-10 bg-primary text-primary-foreground font-[900] rounded-md shadow-sm uppercase tracking-wider flex items-center justify-center",
                  compact
                    ? "top-1 left-1 px-1 py-0.5 text-[6.5px]"
                    : "top-1.5 left-1.5 px-1 py-0.5 text-[7px] sm:top-3 sm:left-3 sm:px-2 sm:py-1 sm:text-[9px]",
                )}>
                {badge ||
                  product.discount ||
                  `${Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)}% OFF`}
              </div>
            )}

          <button
            onClick={toggleWishlist}
            className={cn(
              "absolute z-10 bg-white/90 backdrop-blur-sm rounded-full shadow-lg flex items-center justify-center cursor-pointer hover:bg-white transition-all active:scale-90",
              compact
                ? "top-1 right-1 h-6 w-6"
                : "top-1.5 right-1.5 h-6.5 w-6.5 sm:top-3 sm:right-3 sm:h-8 sm:w-8",
            )}>
            <motion.div
              whileTap={{ scale: 0.8 }}
              animate={isWishlisted ? { scale: [1, 1.2, 1] } : {}}>
              <Heart
                size={compact ? 11 : 14}
                className={cn(
                  isWishlisted
                    ? "text-red-500 fill-current"
                    : "text-neutral-400",
                )}
              />
            </motion.div>
          </button>

          <AnimatePresence>
            {showHeartPopup && (
              <motion.div
                initial={{ scale: 0.5, opacity: 1, y: 0 }}
                animate={{ scale: 2, opacity: 0, y: -40 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="absolute top-3 right-3 z-50 pointer-events-none text-red-500">
                <Heart size={24} fill="currentColor" />
              </motion.div>
            )}
          </AnimatePresence>

          <div
            className={cn(
              "block w-full overflow-hidden flex items-center justify-center transition-transform duration-500 group-hover:scale-105",
              compact
                ? "aspect-[4/3] rounded-md bg-white/70 p-1"
                : compact || neutralBg
                ? "aspect-square rounded-md sm:rounded-xl bg-white/70 p-1 sm:p-2"
                : "aspect-square rounded-md sm:rounded-xl bg-white/50 p-1 sm:p-2",
            )}>
            <img
              ref={imageRef}
              src={applyCloudinaryTransform(product.image)}
              alt={product.name}
              loading="lazy"
              className="w-full h-full object-contain mix-blend-multiply drop-shadow-sm"
            />
          </div>
        </div>

        {/* Info Section */}
        <div
          className={cn(
            "flex flex-col flex-1",
            compact
              ? "p-1.5 pt-0.5 gap-0"
              : "bg-white/40 p-1.5 pt-2 sm:p-3 sm:pt-4 gap-0.5",
          )}>
          <div className="flex items-center gap-0.5 mb-0.5 sm:gap-1.5 sm:mb-1">
            <div
              className={cn(
                "border-2 border-primary rounded-full flex items-center justify-center",
                compact ? "h-2 w-2" : "h-2.5 w-2.5 sm:h-3.5 sm:w-3.5",
              )}>
              <div
                className={cn(
                  "bg-primary rounded-full",
                  compact ? "h-[3px] w-[3px]" : "h-1 w-1",
                )}
              />
            </div>
            <div
              className={cn(
                "bg-brand-50 text-brand-600 font-bold rounded px-1 py-0 tracking-wide",
                compact ? "text-[7px]" : "text-[8px] sm:text-[9px]",
              )}>
              {product.weight || "1 unit"}
            </div>
          </div>

          <div className={cn(compact ? "h-6.5" : "h-8 sm:h-9")}>
            <h4
              className={cn(
                "font-[600] text-[#1A1A1A] leading-tight line-clamp-2",
                compact ? "text-[9.5px]" : "text-[12px] sm:text-[13px]",
              )}>
              {product.name}
            </h4>
          </div>

          {/* Delivery Time & Unit info */}
          <div className="flex items-center gap-1 text-gray-500 mt-0.5 mb-1 sm:gap-1.5 sm:mt-1 sm:mb-2">
            <Clock size={compact ? 8 : 10} className="text-primary/80" />
            <span
              className={cn(
                "font-semibold",
                compact ? "text-[7px]" : "text-[9px] sm:text-[10px]",
              )}>
              {product.deliveryTime || "8-12 mins"}
            </span>
          </div>

          {/* Price Row / ADD Button Combination for compact */}
          <div className="mt-auto flex items-center justify-between gap-1">
            <div className="flex flex-col">
              <span
                className={cn(
                  "font-[1000] text-[#1A1A1A]",
                  compact ? "text-[10px]" : "text-[13px] sm:text-sm",
                )}>
                ₹{product.price}
              </span>
              {product.originalPrice > product.price && (
                <span
                  className={cn(
                    "font-medium text-gray-400 line-through leading-none",
                    compact ? "text-[7px]" : "text-[9px] sm:text-[10px]",
                  )}>
                  ₹{product.originalPrice}
                </span>
              )}
            </div>

            {/* ADD Button / Quantity Selector (Always in price row) */}
            <div className="flex">
              {quantity > 0 ? (
                <div
                  className={cn(
                    "flex items-center bg-white border-[1.5px] border-primary rounded-lg p-0.5 justify-between",
                    compact ? "min-w-[54px]" : "min-w-[68px] sm:min-w-[90px] md:min-w-[100px]",
                  )}>
                  <button
                    onClick={handleDecrement}
                    className="p-0.5 px-0.5 text-primary active:scale-90 transition-transform sm:p-1 sm:px-1">
                    <Minus size={compact ? 9 : 12} strokeWidth={3.5} />
                  </button>
                  <span
                    className={cn(
                      "font-black text-primary",
                      compact ? "text-[9px]" : "text-[11px] sm:text-[13px] md:text-sm",
                    )}>
                    {quantity}
                  </span>
                  <button
                    onClick={handleIncrement}
                    className="p-0.5 px-0.5 text-primary active:scale-90 transition-transform sm:p-1 sm:px-1">
                    <Plus size={compact ? 9 : 12} strokeWidth={3.5} />
                  </button>
                </div>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleAddToCart}
                  className={cn(
                    "bg-white border-[1.5px] border-primary text-primary rounded-lg font-black shadow-sm hover:bg-primary/5 mb-0 transition-all uppercase tracking-wide leading-none",
                    compact
                      ? "px-2 py-[3px] text-[9px]"
                      : "px-3.5 py-1.5 text-[11px] sm:px-7 sm:py-2 sm:text-[13px] md:text-sm md:px-8 md:py-2.5",
                  )}>
                  ADD
                </motion.button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  },
);

export default ProductCard;

