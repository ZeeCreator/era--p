const NodeCache = require('node-cache');

/**
 * Konfigurasi cache dengan TTL berbeda untuk setiap endpoint
 * - latest: 5 menit (300 detik)
 * - anime detail: 10 menit (600 detik)
 * - episode detail: 10 menit (600 detik)
 * - search: 3 menit (180 detik)
 */
const cache = new NodeCache({
  stdTTL: 300, // Default TTL 5 menit
  checkperiod: 60, // Cek expired setiap 60 detik
  useClones: true,
  maxKeys: 1000 // Maksimal 1000 keys di cache
});

// TTL constants (dalam detik)
const TTL = {
  LATEST: 300,      // 5 menit
  ANIME: 600,       // 10 menit
  EPISODE: 600,     // 10 menit
  SEARCH: 180,      // 3 menit
};

/**
 * Get data dari cache
 */
function getCache(key) {
  return cache.get(key);
}

/**
 * Set data ke cache dengan TTL spesifik
 */
function setCache(key, value, ttl = TTL.LATEST) {
  return cache.set(key, value, ttl);
}

/**
 * Delete data dari cache
 */
function delCache(key) {
  return cache.del(key);
}

/**
 * Clear semua cache
 */
function flushCache() {
  return cache.flushAll();
}

/**
 * Get cache statistics
 */
function getStats() {
  return cache.getStats();
}

module.exports = {
  cache,
  TTL,
  getCache,
  setCache,
  delCache,
  flushCache,
  getStats,
};
