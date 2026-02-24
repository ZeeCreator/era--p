/**
 * Server.js - Local Express Server
 * Jalankan dengan: node server.js
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const animeRoutes = require('./routes/anime');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Inisialisasi Express app
const app = express();

// Deteksi mode production
const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARE
// ============================================

// Security headers dengan Helmet
app.use(helmet({
  contentSecurityPolicy: false, // Disable untuk API
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware (hanya di development)
if (!isProduction) {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });
}

// Rate limiting - 60 request per IP per 15 menit
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 60, // 60 request per IP
  message: {
    status: 'error',
    message: 'Terlalu banyak request. Silakan tunggu 15 menit.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers['x-forwarded-for'] || 'unknown';
  },
});

// Terapkan rate limit ke semua route API
app.use('/api', limiter);

// ============================================
// ROUTES
// ============================================

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'success',
    message: 'Otakudesu API - REST API scraper untuk Otakudesu.best',
    version: '1.0.0',
    endpoints: {
      'GET /api/latest': 'Daftar anime ongoing terbaru',
      'GET /api/anime/:slug': 'Detail anime berdasarkan slug',
      'GET /api/anime/:slug/episodes': 'Daftar episode dari anime',
      'GET /api/episode/:slug': 'Detail episode berdasarkan slug',
      'GET /api/search?q=': 'Cari anime berdasarkan judul',
      'GET /api/health': 'Health check endpoint',
    },
    documentation: 'https://github.com/yourusername/otaku-api#readme',
  });
});

// API routes
app.use('/api', animeRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// Handle 404
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================
// START SERVER
// ============================================

// Hanya jalankan server jika ini adalah entry point utama
// (bukan di-import oleh Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log('');
    console.log('========================================');
    console.log('   OTAKUDESU API SERVER');
    console.log('========================================');
    console.log(`   Environment: ${isProduction ? 'Production' : 'Development'}`);
    console.log(`   Port: ${PORT}`);
    console.log(`   URL: http://localhost:${PORT}`);
    console.log('========================================');
    console.log('');
    console.log('Available endpoints:');
    console.log('  GET /api/latest          - Anime ongoing terbaru');
    console.log('  GET /api/anime/:slug     - Detail anime');
    console.log('  GET /api/anime/:slug/episodes - Daftar episode');
    console.log('  GET /api/episode/:slug   - Detail episode');
    console.log('  GET /api/search?q=...    - Cari anime');
    console.log('  GET /api/health          - Health check');
    console.log('');
  });
}

// Export untuk Vercel
module.exports = app;
