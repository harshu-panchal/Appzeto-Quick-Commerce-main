/**
 * MediaMetadata Model
 * 
 * Tracks media resources uploaded to Cloudinary with metadata for
 * auditing and management.
 * 
 * @module models/mediaMetadata
 */

import mongoose from 'mongoose';

const mediaMetadataSchema = new mongoose.Schema(
  {
    intentId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
    },
    provider: {
      type: String,
      enum: ["cloudinary"],
      default: "cloudinary",
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "failed", "deleted"],
      default: "confirmed",
      index: true,
    },
    objectKey: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },
    publicId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    secureUrl: {
      type: String,
      required: false,
      default: "",
      trim: true
    },
    resourceType: {
      type: String,
      required: true,
      enum: ['image', 'video', 'raw'],
      default: 'image'
    },
    format: {
      type: String,
      required: false,
      default: "",
      trim: true,
      lowercase: true
    },
    mimeType: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    extension: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
    },
    width: {
      type: Number,
      min: 0
    },
    height: {
      type: Number,
      min: 0
    },
    bytes: {
      type: Number,
      required: false,
      default: 0,
      min: 0
    },
    bytesExpected: {
      type: Number,
      min: 0,
      default: 0,
    },
    etag: {
      type: String,
      default: null,
      trim: true,
    },
    checksum: {
      type: String,
      default: null,
      trim: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'uploadedByModel'
    },
    uploadedByModel: {
      type: String,
      required: true,
      enum: ['Customer', 'Seller', 'Admin', 'Delivery']
    },
    entityType: {
      type: String,
      trim: true,
      lowercase: true,
      enum: ['product', 'profile', 'category', 'offer', 'banner', 'document', 'other']
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId
    },
    folder: {
      type: String,
      trim: true
    },
    tags: [{
      type: String,
      trim: true
    }],
    isDeleted: {
      type: Boolean,
      default: false,
      index: true
    },
    deletedAt: {
      type: Date
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    confirmedAt: {
      type: Date,
      default: null,
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes
mediaMetadataSchema.index({ uploadedBy: 1, uploadedByModel: 1 });
mediaMetadataSchema.index({ entityType: 1, entityId: 1 });
mediaMetadataSchema.index({ isDeleted: 1, createdAt: -1 });
mediaMetadataSchema.index({ status: 1, expiresAt: 1 });
mediaMetadataSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { status: "pending", expiresAt: { $type: "date" } },
  },
);

/**
 * Mark media as deleted (soft delete)
 */
mediaMetadataSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.status = "deleted";
  await this.save();
};

/**
 * Get transformation URL with Cloudinary transformations
 * @param {Object} transformations - Cloudinary transformation parameters
 * @returns {string} Transformed URL
 */
mediaMetadataSchema.methods.getTransformedUrl = function(transformations = {}) {
  if (!this.secureUrl) {
    return '';
  }
  
  // If no transformations, return original URL
  if (Object.keys(transformations).length === 0) {
    return this.secureUrl;
  }
  
  // Parse Cloudinary URL
  const urlParts = this.secureUrl.split('/upload/');
  if (urlParts.length !== 2) {
    return this.secureUrl;
  }
  
  // Build transformation string
  const transformParts = [];
  
  if (transformations.width) {
    transformParts.push(`w_${transformations.width}`);
  }
  if (transformations.height) {
    transformParts.push(`h_${transformations.height}`);
  }
  if (transformations.crop) {
    transformParts.push(`c_${transformations.crop}`);
  }
  if (transformations.quality) {
    transformParts.push(`q_${transformations.quality}`);
  }
  if (transformations.format) {
    transformParts.push(`f_${transformations.format}`);
  }
  
  const transformStr = transformParts.join(',');
  
  // Reconstruct URL with transformations
  return `${urlParts[0]}/upload/${transformStr}/${urlParts[1]}`;
};

/**
 * Validate public_id format
 * @param {string} publicId - Public ID to validate
 * @returns {boolean} True if valid
 */
mediaMetadataSchema.statics.validatePublicId = function(publicId) {
  if (!publicId || typeof publicId !== 'string') {
    return false;
  }
  const normalized = publicId.trim();
  return /^[-a-zA-Z0-9_/]+$/.test(normalized) && normalized.includes("/");
};

/**
 * Find active (non-deleted) media
 */
mediaMetadataSchema.statics.findActive = function(query = {}) {
  return this.find({ ...query, isDeleted: false, status: "confirmed" });
};

/**
 * Find media by entity
 */
mediaMetadataSchema.statics.findByEntity = function(entityType, entityId) {
  return this.findActive({ entityType, entityId });
};

/**
 * Find media by uploader
 */
mediaMetadataSchema.statics.findByUploader = function(uploadedBy, uploadedByModel) {
  return this.findActive({ uploadedBy, uploadedByModel });
};

const MediaMetadata = mongoose.model('MediaMetadata', mediaMetadataSchema);

export default MediaMetadata;
