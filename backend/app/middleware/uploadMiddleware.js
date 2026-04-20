/**
 * Legacy upload middleware compatibility shim.
 *
 * The backend now uses direct-to-object-storage uploads through
 * /api/media/upload-intent and /api/media/confirm. Multipart uploads
 * through API memory are intentionally disabled for production safety.
 */

function buildDisabledUploadError() {
  const error = new Error(
    "Multipart uploads are disabled. Use /api/media/upload-intent and /api/media/confirm.",
  );
  error.statusCode = 410;
  return error;
}

function disabledUploadMiddleware(_req, _res, next) {
  next(buildDisabledUploadError());
}

function createDisabledHandler() {
  return disabledUploadMiddleware;
}

export function createUpload() {
  return {
    single: createDisabledHandler,
    array: createDisabledHandler,
    fields: createDisabledHandler,
    any: createDisabledHandler,
    none: createDisabledHandler,
  };
}

const upload = createUpload();

export default upload;
