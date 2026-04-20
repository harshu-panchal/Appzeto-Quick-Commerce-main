import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "../app/dbConfig/dbConfig.js";
import Seller from "../app/models/seller.js";
import Category from "../app/models/category.js";
import Product from "../app/models/product.js";
import { uploadToCloudinary } from "../app/utils/cloudinary.js";
import { slugify } from "../app/utils/slugify.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PRODUCT_ROOT = path.resolve("d:\\Appzeto Quick Commerce\\product");
const IMPORT_HEADERS = (process.env.IMPORT_HEADERS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const IMPORT_MAX_PRODUCTS = parseInt(
  process.env.IMPORT_MAX_PRODUCTS || "0",
  10,
);
const IMPORT_SUBCATEGORY_MAX = parseInt(
  process.env.IMPORT_SUBCATEGORY_MAX || "0",
  10,
);

const isDir = async (p) => {
  try {
    const stat = await fs.promises.stat(p);
    return stat.isDirectory();
  } catch {
    return false;
  }
};

const listDirs = async (p) => {
  const items = await fs.promises.readdir(p, { withFileTypes: true });
  return items.filter((i) => i.isDirectory()).map((i) => path.join(p, i.name));
};

const listImages = async (p) => {
  const items = await fs.promises.readdir(p, { withFileTypes: true });
  return items
    .filter((i) => i.isFile())
    .map((i) => i.name)
    .filter((n) => /\.(jpg|jpeg|png|webp)$/i.test(n))
    .map((n) => path.join(p, n));
};

const readTextFileIfExists = async (pats) => {
  for (const p of pats) {
    try {
      const buf = await fs.promises.readFile(p);
      return buf.toString();
    } catch {}
  }
  return "";
};

const extractDigits = (s) => {
  const m = s.match(/(\d{3,})/);
  return m ? m[1] : "";
};

const extractBrand = (name) => {
  const trimmed = name.trim();
  if (!trimmed) return "";
  const parts = trimmed.split(/\s+/);
  return parts[0];
};

const extractWeight = (name) => {
  const m = name.match(/\(([^)]+)\)/);
  return m ? m[1] : "";
};

const ensureCategory = async (name, type, parentId = null) => {
  const slug = slugify(name);
  let cat = await Category.findOne({ slug });
  if (!cat) {
    cat = await Category.create({
      name,
      slug,
      type,
      parentId,
    });
  }
  return cat;
};

const uploadImages = async (imagePaths, folderSlug) => {
  const urls = [];
  for (const imgPath of imagePaths) {
    const buffer = await fs.promises.readFile(imgPath);
    const url = await uploadToCloudinary(buffer, `products/${folderSlug}`);
    urls.push(url);
  }
  return urls;
};

const ensureSeller = async () => {
  const email = "harsh@appzeto.com";
  let seller = await Seller.findOne({ email });
  if (!seller) {
    const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
    seller = await Seller.create({
      name: "Harsh",
      email,
      phone,
      password: "Temp@123#",
      shopName: "Harsh Store",
      isVerified: true,
      isActive: true,
    });
  }
  return seller;
};

const uniqueSlug = async (base) => {
  let s = slugify(base);
  let idx = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exists = await Product.findOne({ slug: s });
    if (!exists) return s;
    s = `${slugify(base)}-${idx++}`;
  }
};

const createProductFromFolder = async (
  sellerId,
  headerCat,
  categoryCat,
  subcategoryCat,
  productFolderPath,
) => {
  const productName = path.basename(productFolderPath);
  const productSlug = await uniqueSlug(productName);
  const imagePaths = await listImages(productFolderPath);
  const text = await readTextFileIfExists([
    path.join(productFolderPath, "product details.rtf"),
    path.join(productFolderPath, "Product Details.rtf"),
    path.join(productFolderPath, "product details.docx"),
    path.join(productFolderPath, "Product Details.docx"),
  ]);
  const brand = extractBrand(productName);
  const weight = extractWeight(productName);
  const folderSlug = `${slugify(headerCat.name)}/${slugify(categoryCat.name)}/${slugify(productName)}`;
  let mainImage = "";
  let galleryImages = [];
  if (imagePaths.length > 0) {
    const urls = await uploadImages(imagePaths, folderSlug);
    mainImage = urls[0];
    galleryImages = urls.slice(1);
  }
  const firstSkuSource =
    imagePaths.length > 0 ? path.basename(imagePaths[0]) : productSlug;
  const skuDigits = extractDigits(firstSkuSource);
  const sku = skuDigits
    ? `${slugify(brand)}-${skuDigits}`
    : `${productSlug}-default`;
  const variants = [
    {
      name: weight || "Default",
      price: 0,
      salePrice: 0,
      stock: 0,
      sku,
    },
  ];
  const doc = {
    name: productName,
    slug: productSlug,
    sku,
    description: text || `${productName}`,
    price: 0,
    salePrice: 0,
    stock: 0,
    lowStockAlert: 5,
    brand,
    weight,
    tags: [headerCat.name, categoryCat.name, subcategoryCat.name],
    mainImage,
    galleryImages,
    headerId: headerCat._id,
    categoryId: categoryCat._id,
    subcategoryId: subcategoryCat._id,
    sellerId,
    status: "inactive",
    variants,
    isFeatured: false,
  };
  const created = await Product.create(doc);
  return created;
};

const run = async () => {
  await connectDB();
  const seller = await ensureSeller();
  console.log(`Seller: ${seller.email}`);
  const headerDirs = await listDirs(PRODUCT_ROOT);
  console.log(`Headers found: ${headerDirs.length}`);
  let totalCreated = 0;
  for (const headerPath of headerDirs) {
    const headerName = path.basename(headerPath);
    if (IMPORT_HEADERS.length > 0 && !IMPORT_HEADERS.includes(headerName)) {
      continue;
    }
    console.log(`Processing header: ${headerName}`);
    const headerCat = await ensureCategory(headerName, "header", null);
    const categoryDirs = await listDirs(headerPath);
    console.log(`Categories under ${headerName}: ${categoryDirs.length}`);
    for (const categoryPath of categoryDirs) {
      const categoryName = path.basename(categoryPath);
      const categoryCat = await ensureCategory(
        categoryName,
        "category",
        headerCat._id,
      );
      const entries = await listDirs(categoryPath);
      console.log(`Subdirectories under ${categoryName}: ${entries.length}`);
      const defaultSubCat = await ensureCategory(
        "General",
        "subcategory",
        categoryCat._id,
      );
      for (const entryPath of entries) {
        const entryName = path.basename(entryPath);
        const imageCount = (await listImages(entryPath)).length;
        if (imageCount > 0) {
          const exists = await Product.findOne({
            name: entryName,
            sellerId: seller._id,
          });
          if (!exists) {
            console.log(
              `Creating: ${entryName} under ${headerName} > ${categoryName} > General`,
            );
            await createProductFromFolder(
              seller._id,
              headerCat,
              categoryCat,
              defaultSubCat,
              entryPath,
            );
            totalCreated++;
            if (
              IMPORT_MAX_PRODUCTS > 0 &&
              totalCreated >= IMPORT_MAX_PRODUCTS
            ) {
              process.exit(0);
            }
          }
          continue;
        }
        const subcategoryCat = await ensureCategory(
          entryName,
          "subcategory",
          categoryCat._id,
        );
        const productDirs = await listDirs(entryPath);
        console.log(`Products under ${entryName}: ${productDirs.length}`);
        let subCreated = 0;
        for (const productPath of productDirs) {
          const exists = await Product.findOne({
            name: path.basename(productPath),
            sellerId: seller._id,
          });
          if (exists) continue;
          console.log(
            `Creating: ${path.basename(productPath)} under ${headerName} > ${categoryName} > ${entryName}`,
          );
          await createProductFromFolder(
            seller._id,
            headerCat,
            categoryCat,
            subcategoryCat,
            productPath,
          );
          totalCreated++;
          subCreated++;
          if (IMPORT_MAX_PRODUCTS > 0 && totalCreated >= IMPORT_MAX_PRODUCTS) {
            process.exit(0);
          }
          if (
            IMPORT_SUBCATEGORY_MAX > 0 &&
            subCreated >= IMPORT_SUBCATEGORY_MAX
          ) {
            break;
          }
        }
      }
    }
  }
  process.exit(0);
};

if (process.argv[1] === __filename) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
