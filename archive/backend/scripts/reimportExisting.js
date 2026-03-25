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

const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

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

const buildCategoryMaps = async () => {
  const headers = await Category.find({ type: "header" });
  const categories = await Category.find({ type: "category" });
  const subs = await Category.find({ type: "subcategory" });
  const headerMap = new Map();
  for (const h of headers) headerMap.set(h.slug, h);
  const catMap = new Map();
  for (const c of categories) {
    catMap.set(`${c.parentId?.toString()}:${c.slug}`, c);
  }
  const subMap = new Map();
  for (const s of subs) {
    subMap.set(`${s.parentId?.toString()}:${s.slug}`, s);
  }
  return { headerMap, catMap, subMap };
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

const run = async () => {
  await connectDB();
  const { headerMap, catMap, subMap } = await buildCategoryMaps();
  let seller = await Seller.findOne({ email: "harsh@appzeto.com" });
  if (!seller) {
    const phone = `9${Math.floor(100000000 + Math.random() * 899999999)}`;
    seller = await Seller.create({
      name: "Harsh",
      email: "harsh@appzeto.com",
      phone,
      password: "Temp@123#",
      shopName: "Harsh Store",
      isVerified: true,
      isActive: true,
    });
  }
  const groceryHeader = headerMap.get("grocery");
  const headerCategoryMap = new Map([
    ["atta-rice-dal", "aata-dal-rice"],
    ["dairy-bread-eggs", "dairy"],
    ["fruits-vegetables", "fruitsandvegetables"],
    ["masala-oil-more", "masalas"],
  ]);
  const headerDirs = await listDirs(PRODUCT_ROOT);
  for (const headerPath of headerDirs) {
    const headerName = path.basename(headerPath);
    const headerSlug = slugify(headerName);
    let headerDoc = headerMap.get(headerSlug);
    const mappedSubDirs = await listDirs(headerPath);
    if (!headerDoc && groceryHeader && headerCategoryMap.has(headerSlug)) {
      headerDoc = groceryHeader;
      const categorySlug = headerCategoryMap.get(headerSlug);
      const categoryDoc = catMap.get(
        `${headerDoc._id.toString()}:${categorySlug}`,
      );
      if (!categoryDoc) continue;
      for (const subPath of mappedSubDirs) {
        const subName = path.basename(subPath);
        const subSlug = slugify(subName);
        const subDoc = subMap.get(`${categoryDoc._id.toString()}:${subSlug}`);
        if (!subDoc) continue;
        const productDirs = await listDirs(subPath);
        for (const productPath of productDirs) {
          const productName = path.basename(productPath);
          const exists = await Product.findOne({
            name: productName,
            sellerId: seller._id,
          });
          if (exists) continue;
          const productSlug = await uniqueSlug(productName);
          const images = await listImages(productPath);
          const folderSlug = `${headerDoc.slug}/${categorySlug}/${slugify(productName)}`;
          let mainImage = "";
          let galleryImages = [];
          if (images.length > 0) {
            const urls = await uploadImages(images, folderSlug);
            mainImage = urls[0];
            galleryImages = urls.slice(1);
          }
          const text = await readTextFileIfExists([
            path.join(productPath, "product details.rtf"),
            path.join(productPath, "Product Details.rtf"),
            path.join(productPath, "product details.docx"),
            path.join(productPath, "Product Details.docx"),
          ]);
          const firstSkuSource =
            images.length > 0 ? path.basename(images[0]) : productSlug;
          const skuDigits = extractDigits(firstSkuSource);
          const sku = skuDigits
            ? `${slugify(headerName)}-${skuDigits}-${randomInt(1000, 9999)}`
            : `${productSlug}-${randomInt(1000, 9999)}`;
          const price = randomInt(50, 2000);
          const discount = randomInt(0, Math.floor(price * 0.3));
          const salePrice = price - discount;
          const stock = randomInt(5, 60);
          const variants = [{ name: "Default", price, salePrice, stock, sku }];
          const doc = {
            name: productName,
            slug: productSlug,
            sku,
            description: text || productName,
            price,
            salePrice,
            stock,
            lowStockAlert: 5,
            tags: [headerDoc.name, categoryDoc.name, subName],
            mainImage,
            galleryImages,
            headerId: headerDoc._id,
            categoryId: categoryDoc._id,
            subcategoryId: subDoc._id,
            sellerId: seller._id,
            status: "active",
            variants,
            isFeatured: false,
          };
          await Product.create(doc);
        }
      }
      continue;
    }
    const categoryDirs = await listDirs(headerPath);
    if (!headerDoc) continue;
    for (const categoryPath of categoryDirs) {
      const categoryName = path.basename(categoryPath);
      const categorySlug = slugify(categoryName);
      const categoryDoc = catMap.get(
        `${headerDoc._id.toString()}:${categorySlug}`,
      );
      if (!categoryDoc) continue;
      const subDirs = await listDirs(categoryPath);
      for (const subPath of subDirs) {
        const subName = path.basename(subPath);
        const subSlug = slugify(subName);
        const subDoc = subMap.get(`${categoryDoc._id.toString()}:${subSlug}`);
        if (!subDoc) continue;
        const productDirs = await listDirs(subPath);
        for (const productPath of productDirs) {
          const productName = path.basename(productPath);
          const exists = await Product.findOne({
            name: productName,
            sellerId: seller._id,
          });
          if (exists) continue;
          const productSlug = await uniqueSlug(productName);
          const images = await listImages(productPath);
          const folderSlug = `${headerSlug}/${categorySlug}/${slugify(productName)}`;
          let mainImage = "";
          let galleryImages = [];
          if (images.length > 0) {
            const urls = await uploadImages(images, folderSlug);
            mainImage = urls[0];
            galleryImages = urls.slice(1);
          }
          const text = await readTextFileIfExists([
            path.join(productPath, "product details.rtf"),
            path.join(productPath, "Product Details.rtf"),
            path.join(productPath, "product details.docx"),
            path.join(productPath, "Product Details.docx"),
          ]);
          const firstSkuSource =
            images.length > 0 ? path.basename(images[0]) : productSlug;
          const skuDigits = extractDigits(firstSkuSource);
          const sku = skuDigits
            ? `${slugify(headerName)}-${skuDigits}-${randomInt(1000, 9999)}`
            : `${productSlug}-${randomInt(1000, 9999)}`;
          const price = randomInt(50, 2000);
          const discount = randomInt(0, Math.floor(price * 0.3));
          const salePrice = price - discount;
          const stock = randomInt(5, 60);
          const variants = [
            {
              name: "Default",
              price,
              salePrice,
              stock,
              sku,
            },
          ];
          const doc = {
            name: productName,
            slug: productSlug,
            sku,
            description: text || productName,
            price,
            salePrice,
            stock,
            lowStockAlert: 5,
            tags: [headerName, categoryName, subName],
            mainImage,
            galleryImages,
            headerId: headerDoc._id,
            categoryId: categoryDoc._id,
            subcategoryId: subDoc._id,
            sellerId: seller._id,
            status: "active",
            variants,
            isFeatured: false,
          };
          await Product.create(doc);
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
