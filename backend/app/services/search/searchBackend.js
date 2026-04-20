/**
 * Search Backend Interface
 * 
 * Defines the contract for search backend implementations.
 * Allows pluggable search engines (MongoDB, Elasticsearch, OpenSearch, Typesense, etc.)
 */

/**
 * @typedef {Object} SearchQuery
 * @property {string} [keyword] - Search keyword
 * @property {string} [categoryId] - Category filter
 * @property {number} [priceMin] - Minimum price
 * @property {number} [priceMax] - Maximum price
 * @property {boolean} [inStock] - Stock availability filter
 * @property {string} [sellerId] - Seller filter
 * @property {number} [page] - Page number
 * @property {number} [limit] - Results per page
 */

/**
 * @typedef {Object} ProductSearchHit
 * @property {string} _id - Product ID
 * @property {string} name - Product name
 * @property {number} price - Product price
 * @property {number} salePrice - Sale price
 * @property {string} mainImage - Main image URL
 * @property {string} sellerId - Seller ID
 * @property {number} stock - Stock quantity
 * @property {string} status - Product status
 * @property {number} score - Relevance score
 */

/**
 * @typedef {Object} SearchResult
 * @property {Array<ProductSearchHit>} items - Search results
 * @property {number} total - Total count
 * @property {number} page - Current page
 * @property {number} limit - Results per page
 * @property {number} took - Query time in milliseconds
 */

/**
 * @typedef {Object} BulkIndexResult
 * @property {number} indexed - Number of products indexed
 * @property {number} failed - Number of failures
 * @property {Array} errors - Error details
 */

/**
 * @typedef {Object} HealthStatus
 * @property {boolean} healthy - Health status
 * @property {string} backend - Backend name
 * @property {Object} details - Additional details
 */

/**
 * Search Backend Interface
 * All search backend implementations must implement this interface
 */
export class SearchBackend {
  /**
   * Search products
   * @param {SearchQuery} query - Search query
   * @returns {Promise<SearchResult>}
   */
  async search(query) {
    throw new Error("search() must be implemented by subclass");
  }

  /**
   * Index a product
   * @param {Object} product - Product to index
   * @returns {Promise<void>}
   */
  async index(product) {
    throw new Error("index() must be implemented by subclass");
  }

  /**
   * Remove a product from index
   * @param {string} productId - Product ID
   * @returns {Promise<void>}
   */
  async remove(productId) {
    throw new Error("remove() must be implemented by subclass");
  }

  /**
   * Bulk index products
   * @param {Array} products - Products to index
   * @returns {Promise<BulkIndexResult>}
   */
  async bulkIndex(products) {
    throw new Error("bulkIndex() must be implemented by subclass");
  }

  /**
   * Get backend health status
   * @returns {Promise<HealthStatus>}
   */
  async health() {
    throw new Error("health() must be implemented by subclass");
  }
}

export default SearchBackend;
