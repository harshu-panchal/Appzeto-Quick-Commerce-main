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
    publicId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true
    },
    secureUrl: {
      type: String,
      required: true,
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
      required: true,
      trim: true,
      lowercase: true
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
      required: true,
      min: 0
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

/**
 * Mark media as deleted (soft delete)
 */
mediaMetadataSchema.methods.softDelete = async function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
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
  
  // Expected format: {folder}/{uuid}
  // Example: quick-commerce/products/a1b2c3d4-e5f6-7890-abcd-ef1234567890
  const parts = publicId.split('/');
  
  if (parts.length < 2) {
    return false;
  }
  
  // Check if last part looks like a UUID
  const lastPart = parts[parts.length - 1];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  return uuidPattern.test(lastPart);
};

/**
 * Find active (non-deleted) media
 */
mediaMetadataSchema.statics.findActive = function(query = {}) {
  return this.find({ ...query, isDeleted: false });
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
