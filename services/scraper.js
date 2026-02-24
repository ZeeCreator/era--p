const axios = require('axios');
const cheerio = require('cheerio');
const { randomDelay } = require('../utils/delay');

/**
 * Base URL Otakudesu
 */
const BASE_URL = 'https://otakudesu.best';

/**
 * Headers browser realistis untuk bypass Cloudflare
 */
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Connection': 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'max-age=0',
  'TE': 'Trailers',
  'DNT': '1',
};

/**
 * Axios instance dengan konfigurasi optimal
 */
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  maxRedirects: 10,
  validateStatus: (status) => status < 500,
  // Decompress response
  decompress: true,
  // Response type text untuk HTML
  responseType: 'text',
  // Headers default
  headers: DEFAULT_HEADERS,
});

/**
 * Fetch HTML dari URL dengan bypass Cloudflare
 * Menggunakan delay random dan headers realistis
 */
async function fetchHtml(url, referer = null) {
  // Random delay sebelum request (1000-3000ms)
  await randomDelay(1000, 3000);

  const headers = { ...DEFAULT_HEADERS };
  
  if (referer) {
    headers['Referer'] = referer;
  }

  // Retry logic untuk handle Cloudflare challenge
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.get(url, {
        headers,
      });

      // Cek jika response adalah Cloudflare challenge atau redirect page
      const html = response.data;
      
      // Deteksi Cloudflare challenge page
      if (html.includes('cf-browser-verification') || 
          html.includes('cf_chl_opt') || 
          html.includes('__cf_chl_rt')) {
        throw new Error('Cloudflare challenge detected');
      }

      // Deteksi redirect page Otakudesu dan extract URL tujuan
      if (html.includes('Anda sebentar lagi akan dialihkan')) {
        // Extract redirect URL dari JavaScript
        const redirectMatch = html.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
        if (redirectMatch) {
          const redirectUrl = redirectMatch[1];
          console.log(`[Redirect] Mengikuti redirect ke: ${redirectUrl}`);
          await randomDelay(500, 1500);
          // Fetch URL tujuan langsung
          return await fetchHtml(redirectUrl, BASE_URL);
        }
        
        // Coba extract dari meta refresh
        const metaMatch = html.match(/<meta[^>]+http-equiv=["']refresh["'][^>]+content=["']\d+;url=([^'"]+)['"]/i);
        if (metaMatch) {
          const redirectUrl = metaMatch[1];
          console.log(`[Redirect] Meta refresh ke: ${redirectUrl}`);
          await randomDelay(500, 1500);
          return await fetchHtml(redirectUrl, BASE_URL);
        }
        
        // Jika tidak ada URL redirect, coba akses homepage langsung
        console.log('[Redirect] Tidak ada URL redirect, akses homepage');
        await randomDelay(500, 1500);
        const homeResponse = await client.get('/', { headers });
        return homeResponse.data;
      }

      // Cek status error
      if (response.status === 403 || response.status === 503) {
        throw new Error(`Server returned ${response.status}`);
      }

      return html;
    } catch (error) {
      lastError = error;
      
      // Jangan retry untuk error tertentu
      if (error.message.includes('404')) {
        throw new Error('Halaman tidak ditemukan (404)');
      }
      
      // Delay sebelum retry
      if (attempt < maxRetries) {
        await randomDelay(2000, 4000);
      }
    }
  }

  // Semua retry gagal
  if (lastError?.code === 'ECONNABORTED') {
    throw new Error('Request timeout - server terlalu lama merespons');
  }
  if (lastError?.response?.status === 403) {
    throw new Error('Akses ditolak oleh Cloudflare (403)');
  }
  if (lastError?.message.includes('Cloudflare')) {
    throw new Error('Cloudflare protection - tidak dapat mengakses website');
  }
  
  throw new Error(`Gagal mengambil data: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Parse HTML dengan Cheerio
 */
function parseHtml(html) {
  return cheerio.load(html);
}

/**
 * Scrape halaman ongoing anime (latest)
 */
async function scrapeLatest(page = 1) {
  const url = page === 1 ? '/ongoing/' : `/ongoing/page/${page}/`;
  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  const animes = [];

  // Selector 1: .col-anime (struktur modern)
  $('.col-anime, .anime-item, .list-item').each((_, el) => {
    try {
      const $titleEl = $(el).find('a[title], h2 a, .title a, .anime-title a').first();
      const title = $titleEl.text().trim();
      let slug = $titleEl.attr('href') || '';
      
      // Extract slug dari URL
      const slugMatch = slug.match(/\/anime\/([^/]+)\/?/);
      slug = slugMatch ? slugMatch[1] : slug.replace('/anime/', '').replace(/\/$/, '');
      
      const thumbnail = $(el).find('img').first().attr('src') || 
                        $(el).find('img').first().attr('data-src') || '';
      const episodes = $(el).find('.epz, .episode-count, [class*="episode"]').first().text().trim();
      const day = $(el).find('.epztipe, .day, [class*="day"]').first().text().trim();
      const rating = $(el).find('.rating, [class*="rating"]').first().text().trim();

      if (title && slug) {
        animes.push({
          title,
          slug,
          thumbnail: thumbnail || null,
          episodes: episodes || null,
          day: day || null,
          rating: rating || null,
        });
      }
    } catch (e) {
      // Skip item yang error
    }
  });

  // Selector 2: .venz li (struktur klasik)
  if (animes.length === 0) {
    $('.venz li, .ongoing-list li, ul li:has(a[href*="/anime/"])').each((_, el) => {
      try {
        const $titleEl = $(el).find('h2 a, a[title]').first();
        const title = $titleEl.text().trim();
        let slug = $titleEl.attr('href') || '';
        
        const slugMatch = slug.match(/\/anime\/([^/]+)\/?/);
        slug = slugMatch ? slugMatch[1] : slug.replace('/anime/', '').replace(/\/$/, '');
        
        const thumbnail = $(el).find('img').first().attr('src') || 
                          $(el).find('img').first().attr('data-src') || '';
        const episodes = $(el).find('.epz').text().trim();
        const day = $(el).find('.epztipe').text().trim();

        if (title && slug) {
          animes.push({
            title,
            slug,
            thumbnail: thumbnail || null,
            episodes: episodes || null,
            day: day || null,
            rating: null,
          });
        }
      } catch (e) {
        // Skip item yang error
      }
    });
  }

  // Selector 3: Fallback - cari semua link ke /anime/
  if (animes.length === 0) {
    $('a[href*="/anime/"]').each((_, el) => {
      try {
        const href = $(el).attr('href') || '';
        const slugMatch = href.match(/\/anime\/([^/]+)\/?/);
        const slug = slugMatch ? slugMatch[1] : '';
        const title = $(el).text().trim();
        
        if (title && slug && title.length < 200) {
          // Cek duplikat
          const exists = animes.some(a => a.slug === slug);
          if (!exists) {
            const thumbnail = $(el).find('img').first().attr('src') || 
                              $(el).find('img').first().attr('data-src') || 
                              $(el).parent().find('img').first().attr('src') || null;
            
            animes.push({
              title,
              slug,
              thumbnail,
              episodes: null,
              day: null,
              rating: null,
            });
          }
        }
      } catch (e) {
        // Skip
      }
    });
  }

  return {
    page,
    total: animes.length,
    animes,
  };
}

/**
 * Scrape detail anime dari halaman /anime/{slug}/
 */
async function scrapeAnimeDetail(slug) {
  const url = `/anime/${slug}/`;
  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  // Coba berbagai selector untuk kompatibilitas
  let title = $('h1.jdlflm').text().trim() ||
              $('.entry-title').text().trim() ||
              $('h1').first().text().trim() ||
              $('[class*="title"]').first().text().trim() || slug;

  // Get thumbnail
  let thumbnail = $('.fotoanime img').attr('src') ||
                  $('.fotoanime img').attr('data-src') ||
                  $('.thumb img').attr('src') ||
                  $('.thumb img').attr('data-src') ||
                  $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="twitter:image"]').attr('content') ||
                  null;

  // Parse info dari .infozingle dengan struktur HTML
  let japanese = null, english = null, type = null, status = null;
  let episodes = null, duration = null, season = null, studios = null;
  let genre = [], rating = null, score = null;

  // Cari container info
  const $infoContainer = $('.infozingle, .anime-info').first();
  
  if ($infoContainer.length) {
    // Parse setiap baris info dari HTML structure
    $infoContainer.find('p, div, b, strong').each((_, el) => {
      const text = $(el).text().trim();
      const $link = $(el).find('a').first();
      
      // Japanese title
      if (text.match(/Judul Jepang/i) || text.match(/Japanese/i)) {
        japanese = $link.text().trim() || text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // English title
      if (text.match(/Judul Inggris/i) || text.match(/English/i)) {
        english = $link.text().trim() || text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Type
      if (text.match(/Tipe/i) || text.match(/Type/i)) {
        type = text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Status
      if (text.match(/Status/i)) {
        status = text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Total Episode
      if (text.match(/Total Episode/i) || text.match(/Episode\s*:/i)) {
        episodes = text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Duration
      if (text.match(/Durasi/i) || text.match(/Duration/i)) {
        duration = text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Season
      if (text.match(/Musim/i) || text.match(/Season/i)) {
        season = text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Studio/Producer
      if (text.match(/Studio/i) || text.match(/Producer/i)) {
        studios = text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Genre
      if (text.match(/Genre/i)) {
        const genreMatch = text.match(/Genre\s*[:：]\s*(.+)/i);
        if (genreMatch) {
          genre = genreMatch[1].split(/[,;]/).map(g => g.trim()).filter(g => g);
        }
      }
      
      // Rating
      if (text.match(/Rating/i)) {
        rating = text.split(/[:：]/)[1]?.trim() || null;
      }
      
      // Score
      if (text.match(/Score/i)) {
        score = text.split(/[:：]/)[1]?.trim() || null;
      }
    });
  }

  // Get synopsis
  let synopsis = $('.sinopc').text().trim() ||
                 $('.entry-content p').first().text().trim() ||
                 $('[class*="synopsis"], [class*="description"]').text().trim() ||
                 null;

  // Get episodes list dari halaman yang sama
  const episodesList = [];
  
  // Multiple selector untuk episode list
  // Coba .episodelist li langsung (bukan ul li)
  $('.episodelist li').each((_, el) => {
    try {
      const $link = $(el).find('a').first();
      const epTitle = $link.text().trim();
      const epHref = $link.attr('href') || '';

      // Extract slug dari URL
      const slugMatch = epHref.match(/\/episode\/([^/]+)\/?/);
      const epSlug = slugMatch ? slugMatch[1] : epHref.replace('/episode/', '').replace(/\/$/, '');

      if (epTitle && epSlug && epTitle.length < 300) {
        episodesList.push({
          title: epTitle,
          slug: epSlug,
        });
      }
    } catch (e) {
      // Skip
    }
  });

  // Fallback: cari semua link episode
  if (episodesList.length === 0) {
    $('a[href*="/episode/"]').each((_, el) => {
      try {
        const epTitle = $(el).text().trim();
        const epHref = $(el).attr('href') || '';
        
        const slugMatch = epHref.match(/\/episode\/([^/]+)\/?/);
        const epSlug = slugMatch ? slugMatch[1] : epHref.replace('/episode/', '').replace(/\/$/, '');
        
        if (epTitle && epSlug && epTitle.length < 300) {
          // Cek duplikat
          const exists = episodesList.some(e => e.slug === epSlug);
          if (!exists) {
            episodesList.push({
              title: epTitle,
              slug: epSlug,
            });
          }
        }
      } catch (e) {
        // Skip
      }
    });
  }

  return {
    title: title || slug,
    slug,
    thumbnail,
    japanese,
    english,
    type,
    status,
    episodes,
    duration,
    season,
    studios,
    genre,
    rating,
    score,
    synopsis,
    episodesList,
  };
}

/**
 * Scrape detail episode dari halaman /episode/{slug}/
 */
async function scrapeEpisodeDetail(slug) {
  const url = `/episode/${slug}/`;
  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  // Get title
  let title = $('h1.jdlflm').text().trim() ||
              $('.entry-title').text().trim() ||
              $('h1').first().text().trim() ||
              $('[class*="title"]').first().text().trim() ||
              slug;

  // Get thumbnail
  let thumbnail = $('.fotoanime img').attr('src') ||
                  $('.fotoanime img').attr('data-src') ||
                  $('.thumb img').attr('src') ||
                  $('.thumb img').attr('data-src') ||
                  $('meta[property="og:image"]').attr('content') ||
                  $('meta[name="twitter:image"]').attr('content') ||
                  null;

  // Get anime info (judul anime asli)
  const animeTitle = $('b a').first().text().trim() ||
                     $('.infozingle b a').text().trim() ||
                     $('[class*="anime"] a').first().text().trim() || null;

  // Get episode number
  const episodeNumber = title.match(/Episode\s*(\d+)/i)?.[1] ||
                        slug.match(/episode[-_]?(\d+)/i)?.[1] || null;

  // Get release date
  const releaseDate = $('.infozingle').text().match(/(\d{2}\s+\w+\s+\d{4})/)?.[0] ||
                      $('.entry-meta').text().match(/(\d{2}\s+\w+\s+\d{4})/)?.[0] ||
                      $('time').attr('datetime') || null;

  // Get download links
  const downloadLinks = [];

  // Cari semua container download dengan berbagai selector
  $('.download-eps, .download, [class*="download"], [class*="dl-"]').each((_, el) => {
    try {
      const quality = $(el).find('strong').first().text().trim() ||
                      $(el).find('b').first().text().trim() ||
                      $(el).find('[class*="quality"]').first().text().trim() || 'Unknown';

      const links = [];
      $(el).find('li a, a[href*="drive"], a[href*="mediafire"], a[href*="zippy"]').each((_, linkEl) => {
        const linkText = $(linkEl).text().trim();
        const linkUrl = $(linkEl).attr('href');

        if (linkText && linkUrl && linkUrl.startsWith('http')) {
          links.push({
            name: linkText,
            url: linkUrl,
          });
        }
      });

      if (links.length > 0) {
        downloadLinks.push({
          quality,
          links,
        });
      }
    } catch (e) {
      // Skip
    }
  });

  // Get streaming links jika ada
  const streamingLinks = [];
  $('[class*="streaming"], [class*="watch"], [class*="embed"]').find('a, iframe').each((_, el) => {
    try {
      const name = $(el).text().trim() || 'Stream';
      const url = $(el).attr('href') || $(el).attr('src');

      if (url && url.startsWith('http')) {
        streamingLinks.push({ name, url });
      }
    } catch (e) {
      // Skip
    }
  });

  // Get navigation (prev/next episode)
  const navigation = {
    prev: null,
    next: null,
  };

  // Cari navigation dengan berbagai selector
  $('.lchx a, .nav-previous a, a[rel="prev"], [class*="prev"] a').each((_, el) => {
    if (!navigation.prev) {
      const href = $(el).attr('href') || '';
      const slugMatch = href.match(/\/episode\/([^/]+)\/?/);
      navigation.prev = {
        title: $(el).text().trim(),
        slug: slugMatch ? slugMatch[1] : href.replace('/episode/', '').replace(/\/$/, ''),
      };
    }
  });

  $('.lchx a, .nav-next a, a[rel="next"], [class*="next"] a').each((_, el) => {
    if (!navigation.next) {
      const href = $(el).attr('href') || '';
      const slugMatch = href.match(/\/episode\/([^/]+)\/?/);
      navigation.next = {
        title: $(el).text().trim(),
        slug: slugMatch ? slugMatch[1] : href.replace('/episode/', '').replace(/\/$/, ''),
      };
    }
  });

  return {
    title,
    slug,
    thumbnail,
    animeTitle,
    episodeNumber,
    releaseDate,
    downloadLinks,
    streamingLinks,
    navigation,
  };
}

/**
 * Scrape hasil pencarian
 */
async function scrapeSearch(query, page = 1) {
  const encodedQuery = encodeURIComponent(query);
  const url = `/?s=${encodedQuery}&post_type=anime`;

  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  const results = [];
  const seenSlugs = new Set();

  // Selector 1: .col-anime (struktur modern)
  $('.col-anime, .anime-item, .search-result, .result-item').each((_, el) => {
    try {
      const $titleEl = $(el).find('a[title], h2 a, .title a, .anime-title a').first();
      const title = $titleEl.text().trim();
      let href = $titleEl.attr('href') || '';
      
      // Extract slug
      const slugMatch = href.match(/\/anime\/([^/]+)\/?/);
      const slug = slugMatch ? slugMatch[1] : href.replace('/anime/', '').replace(/\/$/, '');
      
      const thumbnail = $(el).find('img').first().attr('src') ||
                        $(el).find('img').first().attr('data-src') || '';

      if (title && slug && !seenSlugs.has(slug)) {
        seenSlugs.add(slug);
        results.push({
          title,
          slug,
          thumbnail: thumbnail || null,
        });
      }
    } catch (e) {
      // Skip
    }
  });

  // Selector 2: .venz, .chivsrc (struktur klasik)
  if (results.length === 0) {
    $('.venz li, .chivsrc li, .anime-list li, ul li:has(a[href*="/anime/"])').each((_, el) => {
      try {
        const $titleEl = $(el).find('h2 a, a[title]').first();
        const title = $titleEl.text().trim();
        let href = $titleEl.attr('href') || '';
        
        const slugMatch = href.match(/\/anime\/([^/]+)\/?/);
        const slug = slugMatch ? slugMatch[1] : href.replace('/anime/', '').replace(/\/$/, '');
        
        const thumbnail = $(el).find('img').first().attr('src') ||
                          $(el).find('img').first().attr('data-src') || '';

        if (title && slug && !seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          results.push({
            title,
            slug,
            thumbnail: thumbnail || null,
          });
        }
      } catch (e) {
        // Skip
      }
    });
  }

  // Selector 3: Fallback - cari semua link ke /anime/ yang mengandung query
  if (results.length === 0) {
    $(`a[href*="/anime/"]`).each((_, el) => {
      try {
        const href = $(el).attr('href') || '';
        const slugMatch = href.match(/\/anime\/([^/]+)\/?/);
        const slug = slugMatch ? slugMatch[1] : '';
        const title = $(el).text().trim();

        if (title && slug && title.length < 200 && !seenSlugs.has(slug)) {
          // Cek apakah title mengandung query (case insensitive)
          if (title.toLowerCase().includes(query.toLowerCase())) {
            seenSlugs.add(slug);
            const thumbnail = $(el).find('img').first().attr('src') ||
                              $(el).find('img').first().attr('data-src') ||
                              $(el).parent().find('img').first().attr('src') || null;
            
            results.push({
              title,
              slug,
              thumbnail: thumbnail || null,
            });
          }
        }
      } catch (e) {
        // Skip
      }
    });
  }

  return {
    query,
    page,
    total: results.length,
    results,
  };
}

module.exports = {
  BASE_URL,
  DEFAULT_HEADERS,
  fetchHtml,
  parseHtml,
  scrapeLatest,
  scrapeAnimeDetail,
  scrapeEpisodeDetail,
  scrapeSearch,
};
