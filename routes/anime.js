const express = require('express');
const router = express.Router();

const scraper = require('../services/scraper');
const { getCache, setCache, TTL } = require('../utils/cache');

/**
 * Helper untuk response sukses
 */
function successResponse(res, data) {
  return res.json({
    status: 'success',
    data,
  });
}

/**
 * GET /api/latest
 * Ambil daftar anime ongoing terbaru
 * Query params: page (optional, default: 1)
 */
router.get('/latest', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const cacheKey = `latest:${page}`;

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] latest:${page}`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] latest page ${page}`);
    const data = await scraper.scrapeLatest(page);

    // Simpan ke cache
    setCache(cacheKey, data, TTL.LATEST);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/ongoing
 * Ambil daftar anime ongoing dari /ongoing-anime/
 * Query params: page (optional, default: 1)
 */
router.get('/ongoing', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const cacheKey = `ongoing:${page}`;

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] ongoing:${page}`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] ongoing page ${page}`);
    const data = await scraper.scrapeOngoing(page);

    // Simpan ke cache
    setCache(cacheKey, data, TTL.LATEST);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/complete
 * Ambil daftar anime complete dari /complete-anime/
 * Query params: page (optional, default: 1)
 */
router.get('/complete', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const cacheKey = `complete:${page}`;

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] complete:${page}`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] complete page ${page}`);
    const data = await scraper.scrapeComplete(page);

    // Simpan ke cache
    setCache(cacheKey, data, TTL.LATEST);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/schedule
 * Ambil jadwal rilis anime dari /jadwal-rilis/
 */
router.get('/schedule', async (req, res, next) => {
  try {
    const cacheKey = 'schedule';

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] schedule`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] schedule`);
    const data = await scraper.scrapeSchedule();

    // Simpan ke cache
    setCache(cacheKey, data, TTL.LATEST);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/anime/:slug
 * Ambil detail anime berdasarkan slug
 */
router.get('/anime/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cacheKey = `anime:${slug}`;

    // Validasi slug
    if (!slug || slug.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Slug tidak boleh kosong',
      });
    }

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] anime:${slug}`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] anime:${slug}`);
    const data = await scraper.scrapeAnimeDetail(slug);
    
    // Simpan ke cache
    setCache(cacheKey, data, TTL.ANIME);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/anime/:slug/episodes
 * Ambil daftar episode dari anime
 * Note: Episode sudah termasuk dalam response /api/anime/:slug
 */
router.get('/anime/:slug/episodes', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cacheKey = `anime:${slug}`;

    // Validasi slug
    if (!slug || slug.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Slug tidak boleh kosong',
      });
    }

    // Cek cache dulu
    let data = getCache(cacheKey);
    
    if (!data) {
      console.log(`[Scrape] anime:${slug} (for episodes)`);
      data = await scraper.scrapeAnimeDetail(slug);
      setCache(cacheKey, data, TTL.ANIME);
    } else {
      console.log(`[Cache Hit] anime:${slug} (for episodes)`);
    }

    // Return hanya episodesList
    return successResponse(res, {
      slug,
      title: data.title,
      totalEpisodes: data.episodesList?.length || 0,
      episodes: data.episodesList || [],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/episode/:slug
 * Ambil detail episode berdasarkan slug
 */
router.get('/episode/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cacheKey = `episode:${slug}`;

    // Validasi slug
    if (!slug || slug.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Slug tidak boleh kosong',
      });
    }

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] episode:${slug}`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] episode:${slug}`);
    const data = await scraper.scrapeEpisodeDetail(slug);
    
    // Simpan ke cache
    setCache(cacheKey, data, TTL.EPISODE);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/nonton/:slug
 * Ambil link streaming/nonton dari episode
 */
router.get('/nonton/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const cacheKey = `nonton:${slug}`;

    // Validasi slug
    if (!slug || slug.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Slug tidak boleh kosong',
      });
    }

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] nonton:${slug}`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] nonton:${slug}`);
    const data = await scraper.scrapeNonton(slug);
    
    // Simpan ke cache
    setCache(cacheKey, data, TTL.EPISODE);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/search
 * Cari anime berdasarkan query
 * Query params: q (required), page (optional)
 */
router.get('/search', async (req, res, next) => {
  try {
    const query = req.query.q;
    const page = parseInt(req.query.page) || 1;

    // Validasi query
    if (!query || query.trim() === '') {
      return res.status(400).json({
        status: 'error',
        message: 'Parameter "q" (query) wajib diisi',
      });
    }

    const cacheKey = `search:${query}:${page}`;

    // Cek cache
    const cached = getCache(cacheKey);
    if (cached) {
      console.log(`[Cache Hit] search:${query}`);
      return successResponse(res, cached);
    }

    console.log(`[Scrape] search:${query}`);
    const data = await scraper.scrapeSearch(query, page);
    
    // Simpan ke cache
    setCache(cacheKey, data, TTL.SEARCH);

    return successResponse(res, data);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  return res.json({
    status: 'success',
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    },
  });
});

/**
 * GET /api/cache/stats
 * Statistik cache (hanya untuk debugging)
 */
router.get('/cache/stats', (req, res) => {
  const { getStats } = require('../utils/cache');
  const stats = getStats();
  
  return res.json({
    status: 'success',
    data: {
      ...stats,
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * GET /api/cache/clear
 * Clear semua cache (hanya untuk debugging)
 */
router.get('/cache/clear', (req, res) => {
  const { flushCache } = require('../utils/cache');
  flushCache();
  
  return res.json({
    status: 'success',
    data: {
      message: 'Cache berhasil dibersihkan',
      timestamp: new Date().toISOString(),
    },
  });
});

module.exports = router;
