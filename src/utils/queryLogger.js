const logger = require('./logger');

/**
 * Utility untuk logging database queries
 */
class QueryLogger {
  constructor() {
    this.slowQueryThreshold = process.env.SLOW_QUERY_THRESHOLD_MS || 1000;
    this.logQueries = process.env.LOG_DB_QUERIES === 'true';
    this.logTiming = process.env.LOG_DB_QUERY_TIMING === 'true';
  }

  /**
   * Log query SQL
   * @param {string} context - Konteks dari query
   * @param {string} query - Query SQL
   * @param {Array} params - Parameter query (opsional)
   */
  log(context, query, params = []) {
    if (!this.logQueries) return;
    
    // Bersihkan query untuk logging (hilangkan baris baru berlebih)
    const cleanQuery = query.replace(/\s+/g, ' ').trim();
    
    logger.debug({
      type: 'db_query',
      context,
      query: cleanQuery.substring(0, 500), // Batasi panjang query
      params: params ? JSON.stringify(params).substring(0, 200) : 'none' // Batasi panjang params
    });
  }

  /**
   * Log waktu eksekusi query
   * @param {string} context - Konteks dari query
   * @param {string} query - Query SQL
   * @param {number} duration - Durasi eksekusi dalam ms
   */
  logTiming(context, query, duration) {
    if (!this.logTiming) return;
    
    // Bersihkan query untuk logging
    const cleanQuery = query.replace(/\s+/g, ' ').trim();
    
    // Periksa apakah ini query lambat
    const isSlow = duration > this.slowQueryThreshold;
    
    // Log dengan level yang sesuai
    const logMethod = isSlow ? 'warn' : 'debug';
    const queryPreview = cleanQuery.substring(0, 100) + (cleanQuery.length > 100 ? '...' : '');
    
    logger[logMethod]({
      type: isSlow ? 'slow_query' : 'query_timing',
      context,
      query: queryPreview,
      duration: `${duration}ms`,
      threshold: `${this.slowQueryThreshold}ms`,
      isSlow
    });
  }

  /**
   * Log error query
   * @param {string} context - Konteks dari query
   * @param {string} query - Query SQL
   * @param {Array} params - Parameter query
   * @param {Error} error - Object error
   */
  logError(context, query, params, error) {
    // Bersihkan query untuk logging
    const cleanQuery = query.replace(/\s+/g, ' ').trim();
    
    logger.error({
      type: 'db_query_error',
      context,
      query: cleanQuery.substring(0, 500),
      params: params ? JSON.stringify(params).substring(0, 200) : 'none',
      error: error.message,
      stack: error.stack
    });
  }
}

module.exports = new QueryLogger(); 