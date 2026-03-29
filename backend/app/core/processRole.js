/**
 * Process Role Management Module
 * 
 * Manages process role configuration and component enablement for
 * multi-process architecture (API, Worker, Scheduler, All).
 * 
 * @module core/processRole
 */

const VALID_ROLES = ['api', 'worker', 'scheduler', 'all'];
const DEFAULT_ROLE = 'all';

/**
 * Get the current process role from environment
 * @returns {'api' | 'worker' | 'scheduler' | 'all'} The current process role
 */
function getProcessRole() {
  const role = (process.env.PROCESS_ROLE || DEFAULT_ROLE).toLowerCase();
  return role;
}

/**
 * Check if a specific component should be enabled based on process role
 * @param {string} component - Component name (http, worker, scheduler)
 * @returns {boolean} True if component should be enabled
 */
function isComponentEnabled(component) {
  const role = getProcessRole();
  
  switch (component) {
    case 'http':
      return role === 'api' || role === 'all';
    case 'worker':
      return role === 'worker' || role === 'all';
    case 'scheduler':
      return role === 'scheduler' || role === 'all';
    default:
      return false;
  }
}

/**
 * Validate process role configuration
 * @throws {Error} if configuration is invalid
 */
function validateProcessRole() {
  const role = getProcessRole();
  
  if (!VALID_ROLES.includes(role)) {
    throw new Error(
      `Invalid PROCESS_ROLE value: "${role}". Must be one of: ${VALID_ROLES.join(', ')}`
    );
  }
}

const processRole = {
  getProcessRole,
  isComponentEnabled,
  validateProcessRole,
  VALID_ROLES,
  DEFAULT_ROLE
};

export {
  getProcessRole,
  isComponentEnabled,
  validateProcessRole,
  VALID_ROLES,
  DEFAULT_ROLE
};

export default processRole;
