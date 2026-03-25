import React from "react";
import { useNavigate } from "react-router-dom";
import ProductCard from "../shared/ProductCard";
import { cn } from "@/lib/utils";
import ExperienceBannerCarousel from "./ExperienceBannerCarousel";

const SectionRenderer = ({ sections = [], productsById = {}, categoriesById = {}, subcategoriesById = {} }) => {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {sections.map((section) => {
        const heading = section.title;

        if (section.displayType === "banners") {
          const items = section.config?.banners?.items || [];
          if (!items.length) return null;
          return (
            <div key={section._id} className="-mt-8 md:-mt-8">
              <ExperienceBannerCarousel section={section} items={items} slideGap={12} />
            </div>
          );
        }

        if (section.displayType === "categories") {
          const ids = section.config?.categories?.categoryIds || [];
          const rows = section.config?.categories?.rows || 1;
          const visibleCount = rows * 4;
          const items = ids
            .map((id) => categoriesById[id])
            .filter(Boolean)
            .slice(0, visibleCount);

          if (!items.length) return null;

          return (
            <div
              key={section._id}
              id={`section-${section._id}`}
              className="-mx-2 md:-mx-4 lg:-mx-6 px-2 md:px-4 lg:px-6"
            >
              {heading && (
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-black text-[#1A1A1A]">
                    {heading}
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {items.length} categories
                  </span>
                </div>
              )}
              <div className="rounded-3xl bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] border border-slate-100 px-3.5 py-3">
                <div className="grid grid-cols-4 gap-3">
                  {items.map((cat) => (
                    <button
                      key={cat._id}
                      className="group flex flex-col items-center gap-1.5 focus:outline-none"
                      onClick={() => {
                        // Remember the header & section so back navigation can restore context
                        window.sessionStorage.setItem(
                          "experienceReturn",
                          JSON.stringify({
                            headerId: section.headerId || null,
                            sectionId: section._id,
                          })
                        );
                        navigate(`/category/${cat._id}`);
                      }}
                    >
                      <div className="relative aspect-square w-full rounded-2xl bg-[#F8F9FA] border border-slate-100/80 flex items-center justify-center overflow-hidden p-1 transition-all duration-200 group-hover:border-[#0c831f]/40 group-hover:bg-white group-hover:shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                        {cat.image ? (
                          <img
                            src={cat.image}
                            alt={cat.name}
                            className="w-full h-full object-contain object-center mix-blend-multiply transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-slate-100" />
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-700 text-center leading-snug line-clamp-2 group-hover:text-[#0c831f]">
                        {cat.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        if (section.displayType === "subcategories") {
          const ids = section.config?.subcategories?.subcategoryIds || [];
          const rows = section.config?.subcategories?.rows || 1;
          const visibleCount = rows * 4;
          const items = ids
            .map((id) => subcategoriesById[id])
            .filter(Boolean)
            .slice(0, visibleCount);
          if (!items.length) return null;

          return (
            <div
              key={section._id}
              id={`section-${section._id}`}
              className="-mx-2 md:-mx-4 lg:-mx-6 px-2 md:px-4 lg:px-6"
            >
              {heading && (
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-black text-[#1A1A1A]">
                    {heading}
                  </h3>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {items.length} picks
                  </span>
                </div>
              )}
              <div className="rounded-3xl bg-white shadow-[0_18px_45px_rgba(15,23,42,0.06)] border border-slate-100 px-3.5 py-3">
                <div className="grid grid-cols-4 gap-3">
                  {items.map((cat) => (
                    <button
                      key={cat._id}
                      className="group flex flex-col items-center gap-1.5 focus:outline-none"
                      onClick={() => {
                        window.sessionStorage.setItem(
                          "experienceReturn",
                          JSON.stringify({
                            headerId: section.headerId || null,
                            sectionId: section._id,
                          })
                        );
                        const parentId =
                          cat.parentId?._id ||
                          cat.parentId ||
                          cat.categoryId?._id ||
                          cat.categoryId ||
                          null;

                        if (parentId) {
                          navigate(`/category/${parentId}`, {
                            state: { activeSubcategoryId: cat._id },
                          });
                        } else {
                          // Fallback to previous behavior if we can't resolve parent
                          navigate(`/category/${cat._id}`);
                        }
                      }}
                    >
                      <div className="relative aspect-square w-full rounded-2xl bg-[#F8F9FA] border border-slate-100/80 flex items-center justify-center overflow-hidden p-1 transition-all duration-200 group-hover:border-[#0c831f]/40 group-hover:bg-white group-hover:shadow-[0_10px_25px_rgba(15,23,42,0.08)]">
                        {cat.image ? (
                          <img
                            src={cat.image}
                            alt={cat.name}
                            className="w-full h-full object-contain object-center mix-blend-multiply transition-transform duration-200 group-hover:scale-105"
                          />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-slate-100" />
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-700 text-center leading-snug line-clamp-2 group-hover:text-[#0c831f]">
                        {cat.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        }

        if (section.displayType === "products") {
          const productConfig = section.config?.products || {};
          const ids = productConfig.productIds || [];
          const rows = productConfig.rows || 1;
          const columns = productConfig.columns || 2;
          const singleRowScrollable = !!productConfig.singleRowScrollable;

          let allProducts;

          if (ids.length) {
            allProducts = ids.map((id) => productsById[id]).filter(Boolean);
          } else {
            const categoryFilter = productConfig.categoryIds || [];
            const subcategoryFilter = productConfig.subcategoryIds || [];
            const hasCategoryFilter = categoryFilter.length > 0;
            const hasSubcategoryFilter = subcategoryFilter.length > 0;

            const all = Object.values(productsById);
            allProducts = all.filter((p) => {
              const catId = p.categoryId?._id || p.categoryId;
              const subId = p.subcategoryId?._id || p.subcategoryId;

              const matchesCategory = hasCategoryFilter
                ? categoryFilter.includes(catId)
                : true;
              const matchesSubcategory = hasSubcategoryFilter
                ? subcategoryFilter.includes(subId)
                : true;

              return matchesCategory && matchesSubcategory;
            });
          }

          if (!allProducts.length) return null;

          if (singleRowScrollable) {
            return (
            <div
              key={section._id}
              id={`section-${section._id}`}
              className="-mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 mt-6 mb-2"
            >
                <div className="flex items-center justify-between mb-3">
                  {heading && (
                    <h3 className="text-base font-black text-[#1A1A1A]">
                      {heading}
                    </h3>
                  )}
                  <span className="text-[11px] font-semibold text-slate-400">
                    {allProducts.length} items
                  </span>
                </div>
                <div className="relative z-10 flex overflow-x-auto gap-3 pb-4 no-scrollbar">
                  {allProducts.map((product) => (
                    <div
                      key={product._id || product.id}
                      className="w-[165px] shrink-0"
                    >
                      <ProductCard product={product} compact={true} neutralBg={true} />
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          const visibleCount = rows * columns;
          const items = allProducts.slice(0, visibleCount);

          return (
            <div
              key={section._id}
              id={`section-${section._id}`}
              className="-mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 mt-6"
            >
              <div className="flex items-center justify-between mb-3">
                {heading && (
                  <h3 className="text-base font-black text-[#1A1A1A]">
                    {heading}
                  </h3>
                )}
                <span className="text-[11px] font-semibold text-slate-400">
                  {items.length} items
                </span>
              </div>
              <div
                className={cn(
                  "grid gap-3",
                  columns === 1
                    ? "grid-cols-1"
                    : columns === 2
                    ? "grid-cols-2"
                    : columns === 3
                    ? "grid-cols-3"
                    : "grid-cols-2"
                )}
              >
                {items.map((product) => (
                  <div key={product._id || product.id}>
                    <ProductCard product={product} compact={columns > 2} neutralBg={true} />
                  </div>
                ))}
              </div>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
};

export default SectionRenderer;
