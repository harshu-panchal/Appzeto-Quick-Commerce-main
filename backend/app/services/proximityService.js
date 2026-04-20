import { distanceMeters } from '../utils/geoUtils.js';

/**
 * Check if delivery person is within proximity range of delivery location
 * @param {Object} deliveryLocation - Current location of delivery person
 * @param {number} deliveryLocation.lat - Latitude
 * @param {number} deliveryLocation.lng - Longitude
 * @param {Object} customerLocation - Delivery destination
 * @param {number} customerLocation.lat - Latitude
 * @param {number} customerLocation.lng - Longitude
 * @returns {Object} { inRange: boolean, distance: number }
 * @throws {Error} If coordinates are invalid
 */
export function checkProximity(deliveryLocation, customerLocation) {
  // Validate input parameters
  if (!deliveryLocation || typeof deliveryLocation !== 'object') {
    throw new Error('deliveryLocation must be an object');
  }
  
  if (!customerLocation || typeof customerLocation !== 'object') {
    throw new Error('customerLocation must be an object');
  }
  
  // Validate latitude and longitude values
  const { lat: deliveryLat, lng: deliveryLng } = deliveryLocation;
  const { lat: customerLat, lng: customerLng } = customerLocation;
  
  if (typeof deliveryLat !== 'number' || typeof deliveryLng !== 'number') {
    throw new Error('deliveryLocation must have numeric lat and lng properties');
  }
  
  if (typeof customerLat !== 'number' || typeof customerLng !== 'number') {
    throw new Error('customerLocation must have numeric lat and lng properties');
  }
  
  // Validate coordinate ranges
  if (deliveryLat < -90 || deliveryLat > 90) {
    throw new Error('deliveryLocation.lat must be between -90 and 90');
  }
  
  if (deliveryLng < -180 || deliveryLng > 180) {
    throw new Error('deliveryLocation.lng must be between -180 and 180');
  }
  
  if (customerLat < -90 || customerLat > 90) {
    throw new Error('customerLocation.lat must be between -90 and 90');
  }
  
  if (customerLng < -180 || customerLng > 180) {
    throw new Error('customerLocation.lng must be between -180 and 180');
  }
  
  // Calculate distance using existing utility
  const distance = distanceMeters(
    deliveryLat,
    deliveryLng,
    customerLat,
    customerLng
  );
  
  // Check if distance is within proximity range (0m - 120m inclusive)
  const inRange = distance >= 0 && distance <= 120;
  
  return {
    inRange,
    distance
  };
}
