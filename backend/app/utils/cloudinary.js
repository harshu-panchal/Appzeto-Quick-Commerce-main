import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';

dotenv.config();

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const getOptimizedImageFormat = () =>
    String(process.env.CLOUDINARY_IMAGE_UPLOAD_FORMAT || '').trim().toLowerCase();

const getOptimizedImageQuality = () =>
    String(process.env.CLOUDINARY_IMAGE_UPLOAD_QUALITY || '').trim();

const isImageMimeType = (mimeType = '') =>
    String(mimeType || '').trim().toLowerCase().startsWith('image/');

const getImageUploadOptions = () => {
    const format = getOptimizedImageFormat();
    const quality = getOptimizedImageQuality();
    return {
        ...(format ? { format } : {}),
        ...(quality ? { transformation: `q_${quality}` } : {}),
    };
};

export const uploadToCloudinary = async (fileBuffer, folder = 'categories', options = {}) => {
    const mimeType = String(options.mimeType || '').trim().toLowerCase();
    const resourceType = String(options.resourceType || '').trim().toLowerCase();
    const shouldOptimizeImage =
        options.optimize !== false &&
        (resourceType === 'image' || isImageMimeType(mimeType));

    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: shouldOptimizeImage ? 'image' : 'auto',
                ...(shouldOptimizeImage ? getImageUploadOptions() : {}),
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
};

export default cloudinary;
