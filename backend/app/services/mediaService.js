/**
 * Media Service
 * 
 * Provides signed URL generation for direct client-to-Cloudinary uploads,
 * upload confirmation, and media management.
 * 
 * @module services/mediaService
 */

import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import MediaMetadata from '../models/mediaMetadata.js';
import logger from './logger.js';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Check if signed uploads are enabled
 * @returns {boolean}
 */
function isSignedUploadsEnabled() {
  const enabled = process.env.ENABLE_SIGNED_UPLOADS;
  return enabled === undefined || enabled === 'true' || enabled === '1';
}

/**
 * Validate Cloudinary configuration
 * @throws {Error} if configuration is missing
 */
function validateCloudinaryConfig() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || 
      !process.env.CLOUDINARY_API_KEY || 
      !process.env.CLOUDINARY_API_SECRET) {
    throw new Error(
      'Cloudinary configuration is missing. Please set CLOUDINARY_CLOUD_NAME, ' +
      'CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables.'
    );
  }
}

/**
 * Generate unique public_id for upload
 * @param {string} folder - Cloudinary folder path
 * @returns {string}
 */
function generatePublicId(folder) {
  const uuid = uuidv4();
  return `${folder}/${uuid}`;
}

/**
 * Generate Cloudinary signature for upload
 * @param {Object} params - Upload parameters
 * @param {string} apiSecret - Cloudinary API secret
 * @returns {string}
 */
function generateSignature(params, apiSecret) {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join('&');
  
  // Create SHA1 hash
  return crypto
    .createHash('sha1')
    .update(sortedParams + apiSecret)
    .digest('hex');
}

/**
 * Generate signed upload URL for Cloudinary
 * @param {Object} options - Upload options
 * @param {string} options.userId - User ID requesting upload
 * @param {string} options.entityType - Entity type (product, profile, etc.)
 * @param {string} options.folder - Cloudinary folder path
 * @param {Object} options.transformations - Optional transformations
 * @returns {Promise<Object>} Signed upload URL and metadata
 */
async function generateSignedUploadURL(options) {
  try {
    validateCloudinaryConfig();
    
    const {
      userId,
      entityType = 'other',
      folder = 'quick-commerce/uploads',
      transformations = {}
    } = options;
    
    if (!userId) {
      throw new Error('userId is required');
    }
    
    // Generate unique public_id
    const publicId = generatePublicId(folder);
    
    // Get current timestamp (in seconds)
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Calculate expiry (15 minutes from now)
    const expirySeconds = parseInt(process.env.MEDIA_SIGNED_URL_EXPIRY || '900', 10);
    const expiresAt = new Date((timestamp + expirySeconds) * 1000);
    
    // Get constraints from environment
    const maxFileSize = parseInt(process.env.MEDIA_MAX_FILE_SIZE || '5242880', 10); // 5MB default
    const allowedFormats = (process.env.MEDIA_ALLOWED_FORMATS || 'jpg,png,webp').split(',');
    
    // Build upload parameters
    const uploadParams = {
      timestamp,
      public_id: publicId,
      folder,
      resource_type: 'auto'
    };
    
    // Add transformations if provided
    if (transformations.eager && Array.isArray(transformations.eager)) {
      uploadParams.eager = transformations.eager
        .map(t => {
          const parts = [];
          if (t.width) parts.push(`w_${t.width}`);
          if (t.height) parts.push(`h_${t.height}`);
          if (t.crop) parts.push(`c_${t.crop}`);
          return parts.join(',');
        })
        .join('|');
    }
    
    // Generate signature
    const signature = generateSignature(uploadParams, process.env.CLOUDINARY_API_SECRET);
    
    // Build upload URL
    const uploadUrl = `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`;
    
    logger.info('Generated signed upload URL', {
      userId,
      entityType,
      publicId,
      folder,
      expiresAt
    });
    
    return {
      uploadUrl,
      publicId,
      signature,
      timestamp,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder,
      expiresAt: expiresAt.toISOString(),
      constraints: {
        maxFileSize,
        allowedFormats
      }
    };
  } catch (error) {
    logger.error('Failed to generate signed upload URL', {
      error: error.message,
      userId: options.userId
    });
    throw error;
  }
}

/**
 * Confirm upload completion and persist metadata
 * @param {Object} metadata - Upload metadata from client
 * @param {string} metadata.publicId - Cloudinary public_id
 * @param {string} metadata.secureUrl - Cloudinary secure_url
 * @param {string} metadata.resourceType - Resource type (image, video, raw)
 * @param {string} metadata.format - File format
 * @param {number} metadata.width - Image width
 * @param {number} metadata.height - Image height
 * @param {number} metadata.bytes - File size in bytes
 * @param {string} metadata.uploadedBy - User ID who uploaded
 * @param {string} metadata.uploadedByModel - Model name (Customer, Seller, Admin)
 * @param {string} metadata.entityType - Entity type
 * @param {string} metadata.entityId - Entity ID (optional)
 * @returns {Promise<Object>} Media record
 */
async function confirmUpload(metadata) {
  try {
    const {
      publicId,
      secureUrl,
      resourceType = 'image',
      format,
      width,
      height,
      bytes,
      uploadedBy,
      uploadedByModel,
      entityType,
      entityId,
      folder,
      tags = []
    } = metadata;
    
    // Validate required fields
    if (!publicId || !secureUrl || !format || !bytes || !uploadedBy || !uploadedByModel) {
      throw new Error('Missing required upload metadata fields');
    }
    
    // Validate public_id format
    if (!MediaMetadata.validatePublicId(publicId)) {
      throw new Error('Invalid public_id format. Expected format: {folder}/{uuid}');
    }
    
    // Check if already confirmed
    const existing = await MediaMetadata.findOne({ publicId });
    if (existing) {
      throw new Error('Upload already confirmed for this public_id');
    }
    
    // Verify resource exists in Cloudinary
    try {
      await cloudinary.api.resource(publicId, { resource_type: resourceType });
    } catch (cloudinaryError) {
      if (cloudinaryError.http_code === 404) {
        throw new Error('Resource not found in Cloudinary');
      }
      throw cloudinaryError;
    }
    
    // Create media metadata record
    const mediaRecord = await MediaMetadata.create({
      publicId,
      secureUrl,
      resourceType,
      format: format.toLowerCase(),
      width,
      height,
      bytes,
      uploadedBy,
      uploadedByModel,
      entityType,
      entityId,
      folder,
      tags
    });
    
    logger.info('Upload confirmed successfully', {
      publicId,
      uploadedBy,
      uploadedByModel,
      entityType,
      bytes
    });
    
    // Return media record with thumbnail URL
    const thumbnailUrl = mediaRecord.getTransformedUrl({
      width: 200,
      height: 200,
      crop: 'thumb'
    });
    
    return {
      _id: mediaRecord._id,
      publicId: mediaRecord.publicId,
      secureUrl: mediaRecord.secureUrl,
      thumbnailUrl,
      createdAt: mediaRecord.createdAt
    };
  } catch (error) {
    logger.error('Failed to confirm upload', {
      error: error.message,
      publicId: metadata.publicId
    });
    throw error;
  }
}

/**
 * Get media URL with optional transformations
 * @param {string} publicId - Cloudinary public ID
 * @param {Object} transformations - Optional transformations
 * @returns {string}
 */
function getMediaURL(publicId, transformations = {}) {
  if (!publicId) {
    return '';
  }
  
  try {
    return cloudinary.url(publicId, {
      secure: true,
      ...transformations
    });
  } catch (error) {
    logger.error('Failed to generate media URL', {
      error: error.message,
      publicId
    });
    return '';
  }
}

/**
 * Delete media resource (soft delete)
 * @param {string} publicId - Cloudinary public ID
 * @param {string} userId - User ID requesting deletion
 * @param {string} userModel - User model name
 * @returns {Promise<void>}
 */
async function deleteMedia(publicId, userId, userModel) {
  try {
    // Find media record
    const media = await MediaMetadata.findOne({ publicId, isDeleted: false });
    
    if (!media) {
      throw new Error('Media not found or already deleted');
    }
    
    // Check ownership
    if (media.uploadedBy.toString() !== userId || media.uploadedByModel !== userModel) {
      throw new Error('User does not own this media');
    }
    
    // Soft delete
    await media.softDelete();
    
    logger.info('Media deleted successfully', {
      publicId,
      userId,
      userModel
    });
  } catch (error) {
    logger.error('Failed to delete media', {
      error: error.message,
      publicId,
      userId
    });
    throw error;
  }
}

/**
 * Legacy upload function (backward compatibility)
 * Uploads file buffer directly to Cloudinary
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} folder - Cloudinary folder
 * @returns {Promise<string>} Secure URL
 */
async function uploadToCloudinary(fileBuffer, folder = 'categories') {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: 'auto'
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
          resolve(result.secure_url);
        }
      }
    );
    uploadStream.end(fileBuffer);
  });
}

export {
  generateSignedUploadURL,
  confirmUpload,
  getMediaURL,
  deleteMedia,
  uploadToCloudinary,
  isSignedUploadsEnabled
};
