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
const PRODUCTION_DEFAULT_ROLE = 'api';

function getDefaultRole() {
  return process.env.NODE_ENV === 'production'
    ? PRODUCTION_DEFAULT_ROLE
    : DEFAULT_ROLE;
}

/**
 * Get the current process role from environment
 * @returns {'api' | 'worker' | 'scheduler' | 'all'} The current process role
 */
function getProcessRole() {
  // Prefer PROCESS_ROLE over legacy APP_ROLE to avoid accidental overrides
  // (e.g. a shared APP_ROLE env var in hosting dashboards).
  const configuredRole = process.env.PROCESS_ROLE || process.env.APP_ROLE || getDefaultRole();
  const role = String(configuredRole).toLowerCase().trim();
  return role;
}

function getRoleComponentPlan(role = getProcessRole()) {
  return {
    http: role === 'api' || role === 'all',
    worker: role === 'worker' || role === 'all',
    scheduler: role === 'scheduler' || role === 'all',
  };
}

/**
 * Check if a specific component should be enabled based on process role
 * @param {string} component - Component name (http, worker, scheduler)
 * @returns {boolean} True if component should be enabled
 */
function isComponentEnabled(component) {
  const components = getRoleComponentPlan(getProcessRole());
  
  switch (component) {
    case 'http':
      return components.http;
    case 'worker':
      return components.worker;
    case 'scheduler':
      return components.scheduler;
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
      `Invalid APP_ROLE/PROCESS_ROLE value: "${role}". Must be one of: ${VALID_ROLES.join(', ')}`
    );
  }
}

const processRole = {
  getProcessRole,
  getRoleComponentPlan,
  isComponentEnabled,
  validateProcessRole,
  VALID_ROLES,
  DEFAULT_ROLE
};

export {
  getProcessRole,
  getRoleComponentPlan,
  isComponentEnabled,
  validateProcessRole,
  VALID_ROLES,
  DEFAULT_ROLE
};

export default processRole;
