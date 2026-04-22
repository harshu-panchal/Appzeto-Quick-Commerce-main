import React from "react";
import ProductCard from "../../../components/shared/ProductCard";

/**
 * CheckoutWishlistSection
 *
 * Props:
 *   wishlist   – array of wishlist items
 *   sectionRef – ref forwarded from CheckoutPage (wishlistSectionRef) so the
 *                IntersectionObserver in the parent can observe this container
 */
const CheckoutWishlistSection = React.memo(function CheckoutWishlistSection({
  wishlist,
  sectionRef,
}) {
  const visibleItems = wishlist.filter((item) => item.name);
  if (visibleItems.length === 0) return null;

  return (
    <div ref={sectionRef} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
      <h3 className="font-black text-slate-800 text-lg mb-4">Your wishlist</h3>
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 snap-x">
        {visibleItems.map((item) => (
          <div
            key={`${item.id}::${String(item.variantSku || "").trim()}`}
            className="flex-shrink-0 w-[126px] sm:w-[136px] md:w-[160px] snap-start">
            <ProductCard product={item} compact={true} />
          </div>
        ))}
      </div>
    </div>
  );
});

export default CheckoutWishlistSection;
