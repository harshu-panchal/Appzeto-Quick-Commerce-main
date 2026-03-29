/**
 * Media Upload Routes
 * 
 * Provides endpoints for signed URL-based media uploads to Cloudinary.
 * 
 * @module routes/mediaRoutes
 */

import express from 'express';
import { verifyToken } from '../middleware/authMiddleware.js';
import handleResponse from '../utils/helper.js';
import { 
  generateSignedUploadURL, 
  confirmUpload, 
  deleteMedia 
} from '../services/mediaService.js';
import logger from '../services/logger.js';

const router = express.Router();

/**
 * POST /api/media/upload-url
 * Generate signed upload URL for direct client-to-Cloudinary upload
 * 
 * Authentication: Required (JWT)
 * 
 * Request Body:
 * {
 *   "entityType": "product",
 *   "folder": "products",
 *   "transformations": { "eager": [...] }
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "uploadUrl": "https://api.cloudinary.com/...",
 *     "publicId": "quick-commerce/products/uuid",
 *     "signature": "sha1-signature",
 *     "timestamp": 1705315800,
 *     "apiKey": "cloudinary-api-key",
 *     "folder": "quick-commerce/products",
 *     "expiresAt": "2024-01-15T10:45:00.000Z",
 *     "constraints": {
 *       "maxFileSize": 5242880,
 *       "allowedFormats": ["jpg", "png", "webp"]
 *     }
 *   }
 * }
 */
router.post('/upload-url', verifyToken, async (req, res) => {
  try {
    const { entityType, folder, transformations } = req.body;
    
    // Validate entity type
    const validEntityTypes = ['product', 'profile', 'category', 'offer', 'banner', 'document', 'other'];
    if (entityType && !validEntityTypes.includes(entityType)) {
      return handleResponse(res, 400, 'Invalid entity type', {
        validTypes: validEntityTypes
      });
    }
    
    // Generate signed URL
    const result = await generateSignedUploadURL({
      userId: req.user.id,
      entityType: entityType || 'other',
      folder: folder || 'quick-commerce/uploads',
      transformations: transformations || {}
    });
    
    logger.info('Signed upload URL generated', {
      userId: req.user.id,
      entityType,
      folder
    });
    
    return handleResponse(res, 200, 'Signed upload URL generated', result);
  } catch (error) {
    logger.error('Failed to generate signed upload URL', {
      error: error.message,
      userId: req.user?.id
    });
    
    if (error.message.includes('Cloudinary configuration')) {
      return handleResponse(res, 503, 'Media service unavailable', {
        error: error.message
      });
    }
    
    return handleResponse(res, 500, 'Failed to generate upload URL', {
      error: error.message
    });
  }
});

/**
 * POST /api/media/confirm
 * Confirm upload completion and persist metadata
 * 
 * Authentication: Required (JWT)
 * 
 * Request Body:
 * {
 *   "publicId": "quick-commerce/products/uuid",
 *   "secureUrl": "https://res.cloudinary.com/...",
 *   "resourceType": "image",
 *   "format": "jpg",
 *   "width": 1920,
 *   "height": 1080,
 *   "bytes": 245678,
 *   "entityType": "product",
 *   "entityId": "product-id-123"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "result": {
 *     "_id": "media-id",
 *     "publicId": "quick-commerce/products/uuid",
 *     "secureUrl": "https://res.cloudinary.com/...",
 *     "thumbnailUrl": "https://res.cloudinary.com/.../c_thumb,w_200,h_200/...",
 *     "createdAt": "2024-01-15T10:30:00.000Z"
 *   }
 * }
 */
router.post('/confirm', verifyToken, async (req, res) => {
  try {
    const {
      publicId,
      secureUrl,
      resourceType,
      format,
      width,
      height,
      bytes,
      entityType,
      entityId,
      folder,
      tags
    } = req.body;
    
    // Validate required fields
    if (!publicId || !secureUrl || !format || !bytes) {
      return handleResponse(res, 400, 'Missing required fields', {
        required: ['publicId', 'secureUrl', 'format', 'bytes']
      });
    }
    
    // Determine user model based on role
    let uploadedByModel;
    switch (req.user.role) {
      case 'customer':
        uploadedByModel = 'Customer';
        break;
      case 'seller':
        uploadedByModel = 'Seller';
        break;
      case 'admin':
        uploadedByModel = 'Admin';
        break;
      case 'delivery':
        uploadedByModel = 'Delivery';
        break;
      default:
        return handleResponse(res, 400, 'Invalid user role');
    }
    
    // Confirm upload
    const result = await confirmUpload({
      publicId,
      secureUrl,
      resourceType: resourceType || 'image',
      format,
      width,
      height,
      bytes,
      uploadedBy: req.user.id,
      uploadedByModel,
      entityType,
      entityId,
      folder,
      tags
    });
    
    logger.info('Upload confirmed', {
      userId: req.user.id,
      publicId,
      entityType
    });
    
    return handleResponse(res, 200, 'Upload confirmed successfully', result);
  } catch (error) {
    logger.error('Failed to confirm upload', {
      error: error.message,
      userId: req.user?.id,
      publicId: req.body?.publicId
    });
    
    if (error.message.includes('Invalid public_id format')) {
      return handleResponse(res, 400, error.message);
    }
    
    if (error.message.includes('already confirmed')) {
      return handleResponse(res, 409, error.message);
    }
    
    if (error.message.includes('not found in Cloudinary')) {
      return handleResponse(res, 404, error.message);
    }
    
    return handleResponse(res, 500, 'Failed to confirm upload', {
      error: error.message
    });
  }
});

/**
 * DELETE /api/media/:publicId
 * Delete media resource (soft delete)
 * 
 * Authentication: Required (JWT + ownership check)
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Media deleted successfully"
 * }
 */
router.delete('/*publicId', verifyToken, async (req, res) => {
  try {
    const publicId = Array.isArray(req.params.publicId)
      ? req.params.publicId.join('/')
      : req.params.publicId;
    
    if (!publicId) {
      return handleResponse(res, 400, 'Public ID is required');
    }
    
    // Determine user model based on role
    let userModel;
    switch (req.user.role) {
      case 'customer':
        userModel = 'Customer';
        break;
      case 'seller':
        userModel = 'Seller';
        break;
      case 'admin':
        userModel = 'Admin';
        break;
      case 'delivery':
        userModel = 'Delivery';
        break;
      default:
        return handleResponse(res, 400, 'Invalid user role');
    }
    
    // Delete media
    await deleteMedia(publicId, req.user.id, userModel);
    
    logger.info('Media deleted', {
      userId: req.user.id,
      publicId
    });
    
    return handleResponse(res, 200, 'Media deleted successfully');
  } catch (error) {
    logger.error('Failed to delete media', {
      error: error.message,
      userId: req.user?.id,
      publicId: req.params?.publicId
    });
    
    if (error.message.includes('not found')) {
      return handleResponse(res, 404, error.message);
    }
    
    if (error.message.includes('does not own')) {
      return handleResponse(res, 403, error.message);
    }
    
    return handleResponse(res, 500, 'Failed to delete media', {
      error: error.message
    });
  }
});

export default router;
