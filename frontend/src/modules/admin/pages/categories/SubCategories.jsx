import React, { useState, useEffect, useMemo, useRef } from "react";
import Card from "@shared/components/ui/Card";
import Badge from "@shared/components/ui/Badge";
import Pagination from "@shared/components/ui/Pagination";
import {
  Plus,
  Search,
  Edit,
  Trash,
  Trash2,
  X,
  Upload,
  Image,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { adminApi } from "../../services/adminApi";
import { toast } from "sonner";

const makeSlug = (value) =>
  String(value || "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w-]+/g, "")
    .replace(/-+/g, "-");

const SubCategories = () => {
  const [categories, setCategories] = useState([]);
  const [level2Categories, setLevel2Categories] = useState([]);
  const [headerCategories, setHeaderCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLevel2, setFilterLevel2] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [selectedItems, setSelectedItems] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    status: "active",
    type: "subcategory",
    parentId: "",
  });

  const [imageFile, setImageFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setIsLoading(true);
    try {
      const res = await adminApi.getCategories();
      if (res.data.success) {
        const payload = res.data.result;
        const results = res.data.results;
        const allCats = Array.isArray(results)
          ? results
          : Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.items)
              ? payload.items
              : [];
        setCategories(allCats.filter((c) => c.type === "subcategory"));
        setLevel2Categories(allCats.filter((c) => c.type === "category"));
        setHeaderCategories(allCats.filter((c) => c.type === "header"));
      }
    } catch (error) {
      toast.error("Failed to fetch categories");
    } finally {
      setIsLoading(false);
    }
  };

  const getParentInfo = (parentId) => {
    const id = parentId?._id || parentId;
    const parent = level2Categories.find((c) => (c._id || c.id) === id);
    if (!parent) return { name: "Unknown", headerName: "Unknown" };

    const headerId = parent.parentId?._id || parent.parentId;
    const header = headerCategories.find((h) => (h._id || h.id) === headerId);

    return {
      name: parent.name,
      headerName: header ? header.name : "Unknown",
    };
  };

  const filteredCategories = useMemo(() => {
    const filtered = categories.filter((cat) => {
      const matchesSearch = cat.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesParent =
        filterLevel2 === "all" ||
        (cat.parentId && cat.parentId._id === filterLevel2) ||
        cat.parentId === filterLevel2;
      return matchesSearch && matchesParent;
    });

    return [...filtered].sort((a, b) => {
      const aName = String(a.name || "").toLowerCase();
      const bName = String(b.name || "").toLowerCase();
      const aTime = new Date(a.createdAt || 0).getTime();
      const bTime = new Date(b.createdAt || 0).getTime();

      switch (sortBy) {
        case "oldest":
          return aTime - bTime;
        case "name-asc":
          return aName.localeCompare(bName);
        case "name-desc":
          return bName.localeCompare(aName);
        case "newest":
        default:
          return bTime - aTime;
      }
    });
  }, [categories, searchTerm, filterLevel2, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredCategories.length / pageSize));

  const paginatedCategories = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return filteredCategories.slice(startIndex, startIndex + pageSize);
  }, [filteredCategories, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, filterLevel2, sortBy, pageSize]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const sortedParentCategoryOptions = useMemo(() => {
    return [...level2Categories]
      .map((c) => {
        const headerId = c.parentId?._id || c.parentId;
        const header = headerCategories.find(
          (h) => (h._id || h.id) === headerId,
        );
        const headerName = header ? header.name : "Unknown";

        return {
          id: c._id || c.id,
          label: `${headerName} > ${c.name}`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [level2Categories, headerCategories]);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.slug || !formData.parentId) {
      toast.error("Name, slug and parent category are required");
      return;
    }

    setIsSaving(true);
    try {
      const data = new FormData();
      data.append("type", "subcategory");
      Object.keys(formData).forEach((key) => {
        if (key !== "type") data.append(key, formData[key]);
      });

      if (imageFile) {
        data.append("image", imageFile);
      } else if (previewUrl && !previewUrl.startsWith("blob:")) {
        // If no new file is chosen, but we have a preview URL that isn't a local blob,
        // it means we have an existing image URL or a string.
        data.append("image", previewUrl);
      }

      if (editingItem) {
        await adminApi.updateCategory(editingItem._id || editingItem.id, data);
        toast.success("Subcategory updated");
      } else {
        await adminApi.createCategory(data);
        toast.success("Subcategory created");
      }
      setIsAddModalOpen(false);
      setEditingItem(null);
      fetchCategories();
    } catch (error) {
      console.error(error);
      toast.error(editingItem ? "Failed to update" : "Failed to create");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await adminApi.deleteCategory(deleteTarget._id || deleteTarget.id);
      toast.success("Subcategory deleted");
      setIsDeleteModalOpen(false);
      setDeleteTarget(null);
      fetchCategories();
    } catch (error) {
      toast.error("Failed to delete subcategory");
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    setFormData({
      name: "",
      slug: "",
      description: "",
      status: "active",
      type: "subcategory",
      parentId: "",
    });
    setImageFile(null);
    setPreviewUrl(null);
    setIsAddModalOpen(true);
  };

  const openEditModal = (item) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      slug: item.slug,
      description: item.description || "",
      status: item.status,
      type: "subcategory",
      parentId: item.parentId?._id || item.parentId || "",
    });
    const currentImage = item.image && typeof item.image === 'object' ? item.image.url : (item.image || null);
    setPreviewUrl(currentImage);
    setIsAddModalOpen(true);
  };

  const handleSelect = (id) => {
    setSelectedItems((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedItems(paginatedCategories.map((c) => c._id || c.id));
    } else {
      setSelectedItems([]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.length === 0) return;

    if (
      window.confirm(
        `Are you sure you want to delete ${selectedItems.length} items?`,
      )
    ) {
      try {
        await Promise.all(
          selectedItems.map((id) => adminApi.deleteCategory(id)),
        );
        toast.success("Subcategories deleted");
        setSelectedItems([]);
        fetchCategories();
      } catch (error) {
        console.error("Bulk delete error:", error);
        toast.error("Failed to delete some subcategories");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Subcategories</h1>
          <p className="text-gray-500 mt-1">
            Manage level 3 categories linked to secondary categories
          </p>
        </div>
        <button
          onClick={openAddModal}
          className="flex items-center gap-2 bg-black  text-primary-foreground px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors">
          <Plus className="w-5 h-5" />
          Add New Subcategory
        </button>
      </div>

      <Card className="border-none shadow-sm">
        <div className="p-4 border-b border-gray-100 flex gap-4 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search subcategories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
            />
          </div>
          <div className="flex items-center gap-2 min-w-[200px]">
            <Filter className="text-gray-400 w-5 h-5" />
            <select
              value={filterLevel2}
              onChange={(e) => setFilterLevel2(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
              <option value="all">All Level 2 Categories</option>
              {level2Categories.map((c) => (
                <option key={c._id || c.id} value={c._id || c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 min-w-[180px]">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name-asc">Name A-Z</option>
              <option value="name-desc">Name Z-A</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="py-3 px-4 text-left">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    checked={
                      selectedItems.length > 0 &&
                      paginatedCategories.length > 0 &&
                      paginatedCategories.every((cat) =>
                        selectedItems.includes(cat._id || cat.id),
                      )
                    }
                    onChange={handleSelectAll}
                  />
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Image
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Parent Chain
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Slug
                </th>
                <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="text-right py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-gray-500">
                    No subcategories found
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((cat) => {
                  const parentInfo = getParentInfo(cat.parentId);
                  return (
                    <tr
                      key={cat._id || cat.id}
                      className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          checked={selectedItems.includes(cat._id || cat.id)}
                          onChange={() => handleSelect(cat._id || cat.id)}
                        />
                      </td>
                      <td className="py-3 px-4">
                        <div className="w-10 h-10 rounded-lg bg-gray-100 overflow-hidden flex items-center justify-center border border-gray-200">
                          {cat.image ? (
                            <img
                              src={typeof cat.image === 'string' ? cat.image : (cat.image.url || cat.image.secure_url || cat.image)}
                              alt={cat.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Image className="w-5 h-5 text-gray-400" />
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {cat.name}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
                            {parentInfo.headerName}
                          </span>
                          <span className="text-sm text-gray-700 font-medium pl-2.5 border-l-2 border-gray-200">
                            {parentInfo.name}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-500">{cat.slug}</td>
                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            cat.status === "active" ? "success" : "warning"
                          }>
                          {cat.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => openEditModal(cat)}
                          className="p-1 text-gray-500 hover:text-brand-600 transition-colors">
                          <Edit className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeleteTarget(cat);
                            setIsDeleteModalOpen(true);
                          }}
                          className="p-1 text-gray-500 hover:text-red-600 transition-colors">
                          <Trash className="w-5 h-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-3 border-t border-gray-100">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={filteredCategories.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            loading={isLoading}
          />
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <h2 className="text-lg font-bold text-gray-900">
                  {editingItem ? "Edit Subcategory" : "Add Subcategory"}
                </h2>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-gray-400 hover:text-gray-600">
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Image Upload */}
                <div className="flex justify-center">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-24 h-24 rounded-full bg-gray-50 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-brand-500 overflow-hidden transition-colors">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-center">
                        <Image className="w-8 h-8 text-gray-400 mx-auto" />
                        <span className="text-xs text-gray-500 mt-1">
                          Upload
                        </span>
                      </div>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleImageChange}
                    accept="image/*"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Parent Category (Level 2)
                  </label>
                  <select
                    value={formData.parentId}
                    onChange={(e) =>
                      setFormData({ ...formData, parentId: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                    <option value="">Select Parent Category</option>
                    {sortedParentCategoryOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        name: e.target.value,
                        slug: makeSlug(e.target.value),
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    placeholder="e.g., Gaming Laptops"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                    placeholder="e.g., gaming-laptops"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="p-6 border-t border-gray-100 flex justify-end gap-3 bg-gray-50">
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-black  text-primary-foreground rounded-lg hover:bg-brand-700 font-medium disabled:opacity-50 flex items-center gap-2">
                  {isSaving && (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {editingItem ? "Update Subcategory" : "Create Subcategory"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                  <Trash className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Delete Subcategory?
                </h3>
                <p className="text-gray-500 text-sm mb-6">
                  Are you sure you want to delete{" "}
                  <span className="font-semibold text-gray-900">
                    {deleteTarget?.name}
                  </span>
                  ? This action cannot be undone.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setIsDeleteModalOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium transition-colors">
                    Delete
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default SubCategories;
