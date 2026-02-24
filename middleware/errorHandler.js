/**
 * Error Handler Middleware
 * Menangani semua error secara global dan mengembalikan response yang konsisten
 */

/**
 * Format response error yang konsisten
 */
function errorResponse(res, message, statusCode = 500) {
  return res.status(statusCode).json({
    status: 'error',
    message,
  });
}

/**
 * Middleware error handler untuk Express
 */
function errorHandler(err, req, res, next) {
  // Log error untuk debugging (hanya di development)
  if (process.env.NODE_ENV !== 'production') {
    console.error(`[Error] ${new Date().toISOString()} - ${err.message}`);
    if (err.stack) {
      console.error(err.stack);
    }
  }

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return errorResponse(res, `Validasi gagal: ${err.message}`, 400);
  }

  if (err.name === 'UnauthorizedError') {
    return errorResponse(res, 'Tidak diizinkan', 401);
  }

  if (err.message.includes('404')) {
    return errorResponse(res, 'Data tidak ditemukan', 404);
  }

  if (err.message.includes('403') || err.message.includes('Cloudflare')) {
    return errorResponse(res, 'Akses ditolak oleh server target. Coba lagi nanti.', 503);
  }

  if (err.message.includes('timeout')) {
    return errorResponse(res, 'Request timeout. Server target terlalu lama merespons.', 504);
  }

  // Default error response
  return errorResponse(res, err.message || 'Terjadi kesalahan internal server', 500);
}

/**
 * Middleware untuk handle 404 Not Found
 */
function notFoundHandler(req, res) {
  return res.status(404).json({
    status: 'error',
    message: `Endpoint tidak ditemukan: ${req.method} ${req.path}`,
  });
}

module.exports = {
  errorHandler,
  notFoundHandler,
  errorResponse,
};
