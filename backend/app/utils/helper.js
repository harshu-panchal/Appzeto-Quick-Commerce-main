export const handleResponse = (res, statusCode, message, data = {}) => {
  const success = statusCode >= 200 && statusCode < 300;

  const sanitize = (item) => {
    if (!item) return item;

    // Handle Mongoose documents
    let obj = item;
    if (typeof item.toObject === 'function') {
      obj = item.toObject();
    } else if (typeof item === 'object') {
      // Recursively sanitize if it's a plain object that might contain Mongoose docs
      obj = { ...item };
      for (const key in obj) {
        if (obj[key] && typeof obj[key].toObject === 'function') {
          obj[key] = obj[key].toObject();
          // Clean the nested object too
          const { updatedAt, __v, password, ...rest } = obj[key];
          obj[key] = rest;
        }
      }
    }

    const { updatedAt, __v, password, ...cleaned } = obj;
    return cleaned;
  };

  const sanitizedData = Array.isArray(data)
    ? data.map(sanitize)
    : sanitize(data);

  const responsePayload = {
    success,
    error: !success,
    message,
  };

  if (Array.isArray(sanitizedData)) {
    responsePayload.results = sanitizedData;
  } else {
    responsePayload.result = sanitizedData;
  }

  return res.status(statusCode).json(responsePayload);
};

export const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of the Earth in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) *
            Math.cos(lat2 * (Math.PI / 180)) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    return distance; // Distance in km
};

export default handleResponse;