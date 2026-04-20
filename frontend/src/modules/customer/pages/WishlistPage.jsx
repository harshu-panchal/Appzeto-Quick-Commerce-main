import React from "react";
import { Link, useNavigate } from "react-router-dom";
import ProductCard from "../components/shared/ProductCard";
import { useWishlist } from "../context/WishlistContext";
import { ChevronLeft, Heart, Trash2 } from "lucide-react";

const WishlistPage = () => {
  const navigate = useNavigate();
  const {
    wishlist,
    clearWishlist,
    fetchFullWishlist,
    isFullDataFetched,
    loading,
  } = useWishlist();

  React.useEffect(() => {
    if (!isFullDataFetched) {
      fetchFullWishlist();
    }
  }, [isFullDataFetched]);

  if (loading && !isFullDataFetched) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <div className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-sm px-4 pt-4 pb-3 border-b border-slate-200/60 mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-200/70 rounded-full transition-colors -ml-1">
            <ChevronLeft size={22} className="text-slate-800" />
          </button>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 tracking-tight">
              My Wishlist
            </h1>
            <p className="text-xs text-slate-500">
              {wishlist.length} {wishlist.length === 1 ? "item" : "items"} saved
            </p>
          </div>
        </div>
        {wishlist.length > 0 && (
          <button
            onClick={clearWishlist}
            className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold hover:bg-slate-200 px-3 py-2 rounded-lg transition-colors">
            <Trash2 size={14} /> Clear
          </button>
        )}
      </div>

      <div className="px-4">
        {wishlist.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {wishlist.map((product) => (
              <ProductCard 
                key={product.id || product._id} 
                product={product} 
                neutralBg={true}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
            <div className="h-14 w-14 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart size={26} className="text-slate-500" strokeWidth={1.8} />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              No items in wishlist
            </h2>
            <p className="text-slate-500 text-sm mb-6 max-w-xs mx-auto">
              Start saving your favorite items to see them here later.
            </p>
            <Link
              to="/categories"
              className="px-6 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-lg hover:bg-slate-800 transition-colors">
              Explore Products
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default WishlistPage;
