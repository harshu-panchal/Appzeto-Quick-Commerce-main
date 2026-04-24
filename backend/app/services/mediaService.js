import crypto from "crypto";
import { v2 as cloudinary } from "cloudinary";
import MediaMetadata from "../models/mediaMetadata.js";
import logger from "./logger.js";

function getMaxUploadBytes() {
  const raw = parseInt(process.env.MEDIA_MAX_FILE_SIZE || "10485760", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 10485760;
}

function getSignedUrlExpirySeconds() {
  const raw = parseInt(process.env.MEDIA_SIGNED_URL_EXPIRY || "900", 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 900;
}

function getAllowedMimeTypes() {
  return (
    process.env.MEDIA_ALLOWED_MIME_TYPES ||
    "image/jpeg,image/png,image/webp,image/gif,application/pdf"
  )
    .split(",")
    .map((mime) => mime.trim().toLowerCase())
    .filter(Boolean);
}

function getOptimizedImageFormat() {
  return String(process.env.CLOUDINARY_IMAGE_UPLOAD_FORMAT || "")
    .trim()
    .toLowerCase();
}

function getOptimizedImageQuality() {
  const raw = String(process.env.CLOUDINARY_IMAGE_UPLOAD_QUALITY || "").trim();
  // Allow legacy values like "q_auto:good" while Cloudinary expects quality "auto:good".
  return raw.startsWith("q_") ? raw.slice(2) : raw;
}

function isImageMimeType(mimeType = "") {
  return String(mimeType || "").trim().toLowerCase().startsWith("image/");
}

function buildImageUploadTransformation() {
  const quality = getOptimizedImageQuality();
  if (!quality) return null;
  // Use object form to avoid Cloudinary treating string values as a named transformation.
  return [{ quality }];
}

function getImageUploadOptions() {
  const format = getOptimizedImageFormat();
  const transformation = buildImageUploadTransformation();
  return {
    ...(format ? { format } : {}),
    ...(transformation ? { transformation } : {}),
  };
}

const ENTITY_FOLDER_MAP = {
  product: "products",
  profile: "users",
  category: "categories",
  offer: "offers",
  banner: "banners",
  document: "docs",
  other: "misc",
};

const RESOURCE_TYPE_MAP = {
  image: "image",
  document: "raw",
  raw: "raw",
};

function isSignedUploadsEnabled() {
  const enabled = process.env.ENABLE_SIGNED_UPLOADS;
  return enabled === undefined || enabled === "true" || enabled === "1";
}

function storageProvider() {
  return String(process.env.STORAGE_PROVIDER || "cloudinary").trim().toLowerCase();
}

function validateStorageConfig() {
  if (storageProvider() !== "cloudinary") {
    const err = new Error("Unsupported storage provider configuration");
    err.statusCode = 500;
    throw err;
  }
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    const err = new Error(
      "Cloudinary configuration is missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
    );
    err.statusCode = 503;
    throw err;
  }
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
}

function normalizeExtension(rawExtension = "") {
  return String(rawExtension || "")
    .trim()
    .replace(/^\./, "")
    .toLowerCase();
}

function sanitizeEntityType(entityType = "other") {
  const normalized = String(entityType || "other").trim().toLowerCase();
  return ENTITY_FOLDER_MAP[normalized] ? normalized : "other";
}

function normalizeResourceType(resourceType = "image", mimeType = "") {
  const normalized = String(resourceType || "").trim().toLowerCase();
  if (RESOURCE_TYPE_MAP[normalized]) {
    return normalized === "document" ? "document" : normalized;
  }
  if (String(mimeType || "").toLowerCase() === "application/pdf") {
    return "document";
  }
  return "image";
}

function validateUploadRequest({
  mimeType,
  fileSize,
  extension,
  resourceType,
}) {
  const allowedMimeTypes = getAllowedMimeTypes();
  const maxUploadBytes = getMaxUploadBytes();
  const normalizedMime = String(mimeType || "").trim().toLowerCase();
  const size = Number(fileSize || 0);
  const ext = normalizeExtension(extension);

  if (!normalizedMime || !allowedMimeTypes.includes(normalizedMime)) {
    const err = new Error("Unsupported MIME type for upload intent");
    err.statusCode = 400;
    throw err;
  }

  if (!Number.isFinite(size) || size <= 0 || size > maxUploadBytes) {
    const err = new Error(`Invalid file size. Maximum allowed is ${maxUploadBytes} bytes`);
    err.statusCode = 400;
    throw err;
  }

  if (!ext || !/^[a-z0-9]+$/.test(ext)) {
    const err = new Error("Invalid file extension");
    err.statusCode = 400;
    throw err;
  }

  const normalizedResourceType = normalizeResourceType(resourceType, normalizedMime);
  const isDocument = normalizedResourceType === "document";
  const isImage = normalizedResourceType === "image";
  if (isDocument && normalizedMime !== "application/pdf") {
    const err = new Error("Document uploads currently support PDF only");
    err.statusCode = 400;
    throw err;
  }
  if (isImage && !normalizedMime.startsWith("image/")) {
    const err = new Error("Image resource type requires an image MIME type");
    err.statusCode = 400;
    throw err;
  }

  return {
    mimeType: normalizedMime,
    fileSize: size,
    extension: ext,
    resourceType: normalizedResourceType,
  };
}

function buildObjectKey({ entityType, resourceType, userId, extension }) {
  const folder = ENTITY_FOLDER_MAP[entityType] || ENTITY_FOLDER_MAP.other;
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  const resourceFolder = resourceType === "document" ? "docs" : "images";
  return `quick-commerce/${folder}/${resourceFolder}/${day}/${userId}-${suffix}.${extension}`;
}

function buildIntentId() {
  return `upl_${crypto.randomUUID().replace(/-/g, "")}`;
}

function buildUploadFolderFromObjectKey(objectKey) {
  const parts = String(objectKey || "").split("/");
  if (parts.length <= 1) return "quick-commerce/uploads";
  return parts.slice(0, -1).join("/");
}

function buildCloudinarySignedPayload({
  objectKey,
  resourceType,
  expiresInSeconds,
}) {
  configureCloudinary();
  const cloudResourceType = RESOURCE_TYPE_MAP[resourceType] || "image";
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = buildUploadFolderFromObjectKey(objectKey);
  const imageUploadOptions =
    cloudResourceType === "image" ? getImageUploadOptions() : {};
  const signatureParams = {
    timestamp,
    public_id: objectKey,
    folder,
    resource_type: cloudResourceType,
    ...imageUploadOptions,
  };
  const signature = cloudinary.utils.api_sign_request(
    signatureParams,
    process.env.CLOUDINARY_API_SECRET,
  );
  const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${cloudResourceType}/upload`;
  const expiresAt = new Date((timestamp + expiresInSeconds) * 1000);
  return {
    uploadUrl,
    uploadFields: {
      api_key: process.env.CLOUDINARY_API_KEY,
      timestamp,
      signature,
      public_id: objectKey,
      folder,
      resource_type: cloudResourceType,
      ...imageUploadOptions,
    },
    expiresAt,
  };
}

async function createUploadIntent({
  userId,
  uploadedByModel,
  entityType = "other",
  entityId = null,
  resourceType = "image",
  mimeType,
  fileSize,
  extension,
  tags = [],
}) {
  validateStorageConfig();
  if (!isSignedUploadsEnabled()) {
    const err = new Error("Signed uploads are disabled");
    err.statusCode = 503;
    throw err;
  }
  if (!userId || !uploadedByModel) {
    const err = new Error("userId and uploadedByModel are required");
    err.statusCode = 400;
    throw err;
  }

  const normalized = validateUploadRequest({
    mimeType,
    fileSize,
    extension,
    resourceType,
  });
  const safeEntityType = sanitizeEntityType(entityType);
  const objectKey = buildObjectKey({
    entityType: safeEntityType,
    resourceType: normalized.resourceType,
    userId: String(userId),
    extension: normalized.extension,
  });
  const intentId = buildIntentId();
  const signedPayload = buildCloudinarySignedPayload({
    objectKey,
    resourceType: normalized.resourceType,
    expiresInSeconds: getSignedUrlExpirySeconds(),
  });

  const record = await MediaMetadata.create({
    intentId,
    provider: "cloudinary",
    status: "pending",
    objectKey,
    publicId: objectKey,
    secureUrl: "",
    resourceType: normalized.resourceType === "document" ? "raw" : "image",
    format: normalized.extension,
    mimeType: normalized.mimeType,
    extension: normalized.extension,
    bytes: 0,
    bytesExpected: normalized.fileSize,
    uploadedBy: userId,
    uploadedByModel,
    entityType: safeEntityType,
    entityId: entityId || undefined,
    folder: buildUploadFolderFromObjectKey(objectKey),
    tags: Array.isArray(tags) ? tags : [],
    expiresAt: signedPayload.expiresAt,
  });

  logger.info("Media upload intent created", {
    intentId,
    objectKey,
    resourceType: normalized.resourceType,
    uploadedByModel,
    userId,
  });

  return {
    intentId: record.intentId,
    provider: record.provider,
    objectKey: record.objectKey,
    publicId: record.publicId,
    uploadUrl: signedPayload.uploadUrl,
    uploadFields: signedPayload.uploadFields,
    expiresAt: signedPayload.expiresAt.toISOString(),
    constraints: {
      maxFileSize: getMaxUploadBytes(),
      allowedMimeTypes: getAllowedMimeTypes(),
      resourceType: normalized.resourceType,
    },
  };
}

async function confirmUpload(metadata) {
  const {
    intentId,
    publicId,
    secureUrl,
    resourceType = "image",
    format,
    mimeType,
    width,
    height,
    bytes,
    etag = null,
    checksum = null,
    uploadedBy,
    uploadedByModel,
    entityType,
    entityId,
    folder,
    tags = [],
  } = metadata || {};

  let mediaRecord = null;
  if (intentId) {
    mediaRecord = await MediaMetadata.findOne({ intentId });
  } else if (publicId) {
    mediaRecord = await MediaMetadata.findOne({ publicId });
  }

  if (!mediaRecord) {
    const err = new Error("Upload intent not found");
    err.statusCode = 404;
    throw err;
  }

  if (mediaRecord.status === "confirmed") {
    return {
      _id: mediaRecord._id,
      intentId: mediaRecord.intentId,
      publicId: mediaRecord.publicId,
      objectKey: mediaRecord.objectKey,
      secureUrl: mediaRecord.secureUrl,
      status: mediaRecord.status,
      createdAt: mediaRecord.createdAt,
    };
  }

  if (mediaRecord.expiresAt && mediaRecord.expiresAt.getTime() < Date.now()) {
    const err = new Error("Upload intent has expired");
    err.statusCode = 410;
    throw err;
  }

  if (publicId && publicId !== mediaRecord.publicId) {
    const err = new Error("Upload confirmation publicId does not match intent");
    err.statusCode = 400;
    throw err;
  }

  const resolvedSecureUrl = String(secureUrl || "").trim();
  if (!resolvedSecureUrl) {
    const err = new Error("secureUrl is required to confirm upload");
    err.statusCode = 400;
    throw err;
  }

  const normalizedResourceType = normalizeResourceType(resourceType, mimeType || mediaRecord.mimeType);
  const normalizedFormat = normalizeExtension(format || mediaRecord.extension || mediaRecord.format);
  const uploadedBytes = Number(bytes || mediaRecord.bytesExpected || 0);
  const maxUploadBytes = getMaxUploadBytes();
  if (!Number.isFinite(uploadedBytes) || uploadedBytes <= 0) {
    const err = new Error("Uploaded file size is required");
    err.statusCode = 400;
    throw err;
  }
  if (uploadedBytes > maxUploadBytes) {
    const err = new Error(`Uploaded file exceeds max size of ${maxUploadBytes} bytes`);
    err.statusCode = 400;
    throw err;
  }

  mediaRecord.status = "confirmed";
  mediaRecord.publicId = mediaRecord.publicId || publicId;
  mediaRecord.objectKey = mediaRecord.objectKey || mediaRecord.publicId;
  mediaRecord.secureUrl = resolvedSecureUrl;
  mediaRecord.resourceType = normalizedResourceType === "document" ? "raw" : "image";
  mediaRecord.format = normalizedFormat || mediaRecord.format || "";
  mediaRecord.mimeType = String(mimeType || mediaRecord.mimeType || "").toLowerCase() || null;
  mediaRecord.extension = normalizedFormat || mediaRecord.extension || null;
  mediaRecord.width = Number.isFinite(Number(width)) ? Number(width) : mediaRecord.width;
  mediaRecord.height = Number.isFinite(Number(height)) ? Number(height) : mediaRecord.height;
  mediaRecord.bytes = uploadedBytes;
  mediaRecord.etag = etag || mediaRecord.etag;
  mediaRecord.checksum = checksum || mediaRecord.checksum;
  mediaRecord.expiresAt = null;
  mediaRecord.confirmedAt = new Date();

  if (uploadedBy) mediaRecord.uploadedBy = uploadedBy;
  if (uploadedByModel) mediaRecord.uploadedByModel = uploadedByModel;
  if (entityType) mediaRecord.entityType = sanitizeEntityType(entityType);
  if (entityId) mediaRecord.entityId = entityId;
  if (folder) mediaRecord.folder = folder;
  if (Array.isArray(tags) && tags.length > 0) mediaRecord.tags = tags;

  await mediaRecord.save();

  logger.info("Media upload confirmed", {
    intentId: mediaRecord.intentId,
    publicId: mediaRecord.publicId,
    uploadedBy: String(mediaRecord.uploadedBy || ""),
  });

  const thumbnailUrl = mediaRecord.getTransformedUrl({
    width: 200,
    height: 200,
    crop: "thumb",
  });

  return {
    _id: mediaRecord._id,
    intentId: mediaRecord.intentId,
    publicId: mediaRecord.publicId,
    objectKey: mediaRecord.objectKey,
    secureUrl: mediaRecord.secureUrl,
    thumbnailUrl,
    bytes: mediaRecord.bytes,
    mimeType: mediaRecord.mimeType,
    status: mediaRecord.status,
    createdAt: mediaRecord.createdAt,
  };
}

function getMediaURL(publicId, transformations = {}) {
  if (!publicId) return "";
  configureCloudinary();
  return cloudinary.url(publicId, {
    secure: true,
    ...transformations,
  });
}

async function deleteMedia(publicId, userId, userModel) {
  const media = await MediaMetadata.findOne({
    $or: [{ publicId }, { objectKey: publicId }],
    isDeleted: false,
  });
  if (!media) {
    const err = new Error("Media not found or already deleted");
    err.statusCode = 404;
    throw err;
  }
  if (
    String(media.uploadedBy || "") !== String(userId || "") ||
    media.uploadedByModel !== userModel
  ) {
    const err = new Error("User does not own this media");
    err.statusCode = 403;
    throw err;
  }
  await media.softDelete();
}

async function uploadToCloudinary(fileBuffer, folder = "categories", options = {}) {
  validateStorageConfig();
  configureCloudinary();
  const mimeType = String(options.mimeType || "").trim().toLowerCase();
  const resourceType = String(options.resourceType || "").trim().toLowerCase();
  const shouldOptimizeImage =
    options.optimize !== false &&
    (resourceType === "image" || isImageMimeType(mimeType));

  const uploadOptions = {
    folder,
    resource_type: shouldOptimizeImage ? "image" : "auto",
    ...(shouldOptimizeImage ? getImageUploadOptions() : {}),
  };

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      uploadOptions,
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      },
    );
    uploadStream.end(fileBuffer);
  });
}

async function generateSignedUploadURL(options) {
  const {
    userId,
    uploadedByModel = "Customer",
    entityType = "other",
    entityId = null,
    resourceType = "image",
    mimeType,
    fileSize,
    extension,
    tags = [],
  } = options || {};

  return createUploadIntent({
    userId,
    uploadedByModel,
    entityType,
    entityId,
    resourceType,
    mimeType,
    fileSize,
    extension,
    tags,
  });
}

export {
  createUploadIntent,
  generateSignedUploadURL,
  confirmUpload,
  getMediaURL,
  deleteMedia,
  uploadToCloudinary,
  isSignedUploadsEnabled,
};

export default {
  createUploadIntent,
  generateSignedUploadURL,
  confirmUpload,
  getMediaURL,
  deleteMedia,
  uploadToCloudinary,
  isSignedUploadsEnabled,
};
