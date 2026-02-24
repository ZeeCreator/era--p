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

  // Get additional info from first episode page if duration/type is missing
  if ((!duration || !type) && episodesList.length > 0) {
    try {
      const firstEpSlug = episodesList[0].slug;
      const epUrl = `/episode/${firstEpSlug}/`;
      const epHtml = await fetchHtml(epUrl);
      const ep$ = parseHtml(epHtml);

      // Get duration and type from episode page if not found
      if (!duration) {
        const epDuration = ep$('.infozingle').text().match(/Durasi\s*[:：]\s*([^,\n]+)/i)?.[1]?.trim();
        if (epDuration) {
          duration = epDuration;
        }
      }

      if (!type) {
        const epType = ep$('.infozingle').text().match(/Tipe\s*[:：]\s*([^,\n]+)/i)?.[1]?.trim();
        if (epType) {
          type = epType;
        }
      }
    } catch (e) {
      // Skip if error fetching episode page
      console.log(`[Info] Gagal mengambil info tambahan dari episode: ${e.message}`);
    }
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
 * Scrape link nonton/streaming dari halaman episode
 * Mengambil iframe src dari desustream dan semua mirror kualitas
 */
async function scrapeNonton(slug) {
  const url = `/episode/${slug}/`;
  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  console.log(`[Scrape Nonton] ${url}`);

  // Get title
  let title = $('h1.jdlflm').text().trim() ||
              $('.entry-title').text().trim() ||
              $('h1').first().text().trim() ||
              slug;

  // Get iframe streaming (desustream)
  const streamingUrl = [];
  let mainIframe = null;

  // Cari iframe dengan src (prioritaskan desustream)
  $('iframe').each((_, el) => {
    try {
      const src = $(el).attr('src');
      if (src && src.startsWith('http')) {
        const iframeData = {
          type: 'iframe',
          url: src,
        };
        streamingUrl.push(iframeData);

        // Prioritaskan desustream sebagai main iframe
        if (src.includes('desustream') || src.includes('dstream')) {
          mainIframe = src;
        }
      }
    } catch (e) {
      // Skip
    }
  });

  // Jika tidak ada mainIframe, gunakan iframe pertama
  if (!mainIframe && streamingUrl.length > 0) {
    mainIframe = streamingUrl[0].url;
  }

  // Cari link streaming dari embed container
  const embedLinks = [];
  $('[class*="embed"], [class*="streaming"], [class*="watch"]').find('a, iframe').each((_, el) => {
    try {
      const src = $(el).attr('href') || $(el).attr('src');
      const name = $(el).text().trim() || 'Stream';

      if (src && src.startsWith('http')) {
        embedLinks.push({
          name,
          url: src,
        });
      }
    } catch (e) {
      // Skip
    }
  });

  // Cari semua mirror dari halaman episode
  const mirrors = [];
  const downloads = [];
  const seenUrls = new Set();

  // Helper untuk menambahkan mirror dengan duplikat checking
  const addMirror = (quality, name, url, provider = null) => {
    if (!url || !url.startsWith('http')) return;
    if (seenUrls.has(url)) return;
    
    seenUrls.add(url);
    
    // Cek jika URL mengandung /safelink/ -> masukkan ke downloads
    if (url.includes('/safelink/')) {
      downloads.push({
        quality: quality || 'Unknown',
        name: name || 'Download',
        url,
        provider: provider || null,
      });
      return;
    }
    mirrors.push({
      quality: quality || 'Unknown',
      name: name || 'Mirror',
      url,
      provider: provider || null,
    });
  };

  // Helper untuk menambahkan download link dari safelink
  const addDownload = (quality, name, url, provider = null) => {
    if (!url || !url.startsWith('http')) return;
    if (seenUrls.has(url)) return;

    seenUrls.add(url);
    downloads.push({
      quality: quality || 'Unknown',
      name: name || 'Download',
      url,
      provider: provider || null,
    });
  };

  // Helper untuk extract quality dari text
  const extractQuality = (text) => {
    if (!text) return null;
    // Prioritaskan kualitas tinggi
    const match = text.match(/(1080p|4K|720p|480p|360p|HD|SD)/i);
    if (match) {
      return match[0].toUpperCase();
    }
    // Cek pattern alternatif
    if (text.match(/full\s*hd/i)) return '1080P';
    if (text.match(/hd/i)) return '720P';
    if (text.match(/sd/i)) return '480P';
    return null;
  };

  // Helper untuk extract provider name dari URL
  const extractProvider = (url) => {
    const hostname = url.match(/(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)?.[1] || '';
    if (hostname.includes('drive.google')) return 'Google Drive';
    if (hostname.includes('mediafire')) return 'MediaFire';
    if (hostname.includes('mega.nz') || hostname.includes('mega.co')) return 'Mega';
    if (hostname.includes('gofile')) return 'GoFile';
    if (hostname.includes('acefile')) return 'Acefile';
    if (hostname.includes('desustream') || hostname.includes('desu')) return 'DesuStream';
    if (hostname.includes('kfiles') || hostname.includes('kfile')) return 'KFiles';
    if (hostname.includes('pdrain')) return 'Pdrain';
    if (hostname.includes('odfiles')) return 'ODFiles';
    return hostname.replace('www.', '');
  };

  // Strategy 0: Scrape mirrorstream div (struktur baru dengan data-content)
  // HTML: <div class="mirrorstream"><ul class="m360p"><span>Mirror 360p</span><li><a data-content="...">provider</a></li></ul>...</div>
  $('div.mirrorstream').each((_, container) => {
    try {
      const $container = $(container);

      // Cari setiap ul dengan class m360p, m480p, m720p, m1080p
      $container.find('ul[class^="m"]').each((_, ul) => {
        try {
          const $ul = $(ul);
          const ulClass = $ul.attr('class') || '';

          // Extract quality dari class (m360p -> 360P)
          let quality = 'Unknown';
          const qualityMatch = ulClass.match(/m(360p|480p|720p|1080p)/i);
          if (qualityMatch) {
            quality = qualityMatch[1].toUpperCase();
          }

          // Get mirror label dari span
          const mirrorLabel = $ul.find('span').first().text().trim();

          // Get semua link mirror di dalam ul
          $ul.find('li > a[data-content]').each((_, linkEl) => {
            try {
              const $link = $(linkEl);
              const providerName = $link.text().trim().replace(/\s+/g, '');
              const dataContent = $link.attr('data-content');

              if (!dataContent) return;

              // Cek jika ini safelink -> masukkan ke downloads
              const providerLower = providerName.toLowerCase();
              const isSafelink = providerLower.includes('safelink') || 
                                 providerLower.includes('download') || 
                                 dataContent.includes('safelink');

              // Decode base64 data-content
              try {
                const decoded = Buffer.from(dataContent, 'base64').toString('utf-8');
                const streamInfo = JSON.parse(decoded);

                if (streamInfo.id && streamInfo.i !== undefined && streamInfo.q) {
                  const streamUrl = BASE_URL + '/stream.php?id=' + streamInfo.id + '&i=' + streamInfo.i + '&q=' + streamInfo.q;
                  
                  if (isSafelink) {
                    addDownload(quality, providerName, streamUrl, providerName);
                  } else {
                    addMirror(quality, providerName, streamUrl, providerName);
                  }
                }
              } catch (e) {
                console.log('[Warning] Failed to decode data-content: ' + dataContent);
              }
            } catch (e) {
              // Skip
            }
          });
        } catch (e) {
          // Skip
        }
      });
    } catch (e) {
      // Skip
    }
  });

  // Strategy 1: Cari setiap section kualitas secara terpisah
  // Cari header/label kualitas (360p, 480p, 720p, 1080p)
  $('strong, b, h3, h4, .quality-label, [class*="quality"], [class*="res"]').each((_, el) => {
    try {
      const qualityText = $(el).text().trim();
      const quality = extractQuality(qualityText);
      
      if (quality !== null) {
        // Cari container berikutnya yang berisi links
        const $container = $(el).parent();
        const $nextSiblings = $(el).nextAll();
        
        // Cari semua link di dalam atau setelah container ini
        $container.find('a[href]').each((_, linkEl) => {
          const linkText = $(linkEl).text().trim();
          const linkUrl = $(linkEl).attr('href');
          
          if (linkUrl && linkUrl.startsWith('http')) {
            const linkQuality = extractQuality(linkText) || quality;
            const provider = extractProvider(linkUrl);
            const name = linkText.replace(/(1080p|4K|720p|480p|360p|HD|SD)/gi, '').trim() || provider;
            addMirror(linkQuality, name, linkUrl, provider);
          }
        });
        
        // Cari juga di sibling elements (hingga 5 level)
        let count = 0;
        $nextSiblings.each((_, sibling) => {
          if (count >= 5) return;
          count++;
          const $sib = $(sibling);
          $sib.find('a[href]').each((_, linkEl) => {
            const linkText = $(linkEl).text().trim();
            const linkUrl = $(linkEl).attr('href');
            
            if (linkUrl && linkUrl.startsWith('http')) {
              const linkQuality = extractQuality(linkText) || quality;
              const provider = extractProvider(linkUrl);
              const name = linkText.replace(/(1080p|4K|720p|480p|360p|HD|SD)/gi, '').trim() || provider;
              addMirror(linkQuality, name, linkUrl, provider);
            }
          });
        });
      }
    } catch (e) {
      // Skip
    }
  });

  // Strategy 2: Cari container download dengan parsing quality sections
  const qualityOrder = ['1080P', '4K', '720P', '480P', '360P', 'HD', 'SD'];
  
  $('.download-eps, .download, [class*="download"], [class*="dl-"], [class*="mirror"], [class*="quality"]').each((_, el) => {
    try {
      const $container = $(el);
      const containerHtml = $container.html();
      
      // Parse setiap quality section dari HTML
      qualityOrder.forEach((targetQuality, index) => {
        // Cari pattern: <strong>720p</strong> atau <b>480p</b>
        const qualityRegex = new RegExp(`<[^>]*>(\\s*${targetQuality.replace('P', '[pP]')}\\s*)[<\\/][^>]*>`, 'i');
        const qualityMatch = containerHtml.match(qualityRegex);
        
        if (qualityMatch) {
          // Cari links setelah quality label ini
          const qualityIndex = containerHtml.indexOf(qualityMatch[0]);
          const afterQuality = containerHtml.substring(qualityIndex);
          
          // Extract URLs dari bagian setelah quality label
          const urlRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
          let urlMatch;
          const foundUrls = [];
          
          while ((urlMatch = urlRegex.exec(afterQuality)) !== null) {
            foundUrls.push(urlMatch[1]);
          }
          
          // Ambil beberapa links pertama untuk quality ini
          foundUrls.slice(0, 3).forEach(linkUrl => {
            if (linkUrl && linkUrl.startsWith('http')) {
              const provider = extractProvider(linkUrl);
              addMirror(targetQuality, provider, linkUrl, provider);
            }
          });
        }
      });
      
      // Extract quality dari container text
      const containerText = $container.text();
      const containerQuality = extractQuality(containerText);
      
      // Cari semua link di dalam container
      $container.find('a[href], li a[href]').each((_, linkEl) => {
        const linkText = $(linkEl).text().trim();
        const linkUrl = $(linkEl).attr('href');
        
        if (linkUrl && linkUrl.startsWith('http')) {
          const linkQuality = extractQuality(linkText) || containerQuality;
          const provider = extractProvider(linkUrl);
          const name = linkText.replace(/(1080p|4K|720p|480p|360p|HD|SD)/gi, '').trim() || provider;
          addMirror(linkQuality, name, linkUrl, provider);
        }
      });
    } catch (e) {
      // Skip
    }
  });

  // Strategy 3: Cari berdasarkan pola tabel atau list dengan quality labels
  $('table, ul, ol').each((_, container) => {
    try {
      const $container = $(container);
      const containerText = $container.text();
      const containerQuality = extractQuality(containerText);
      
      // Jika container memiliki quality label
      if (containerQuality !== null) {
        $container.find('a[href]').each((_, linkEl) => {
          const linkText = $(linkEl).text().trim();
          const linkUrl = $(linkEl).attr('href');
          
          if (linkUrl && linkUrl.startsWith('http')) {
            const linkQuality = extractQuality(linkText) || containerQuality;
            const provider = extractProvider(linkUrl);
            const name = linkText.replace(/(1080p|4K|720p|480p|360p|HD|SD)/gi, '').trim() || provider;
            addMirror(linkQuality, name, linkUrl, provider);
          }
        });
      }
    } catch (e) {
      // Skip
    }
  });

  // Strategy 4: Cari berdasarkan tombol dengan class spesifik
  $('.btn-streaming, .btn-download, .btn-mirror, [class*="btn"] a, a[class*="btn"], a.button')
    .each((_, el) => {
      try {
        const href = $(el).attr('href');
        const text = $(el).text().trim();
        
        if (href && href.startsWith('http')) {
          const quality = extractQuality(text);
          const provider = extractProvider(href);
          const name = text.replace(/(1080p|4K|720p|480p|360p|HD|SD)/gi, '').trim() || provider;
          addMirror(quality, name, href, provider);
        }
      } catch (e) {
        // Skip
      }
    });

  // Strategy 5: Cari semua link provider dan assign quality berdasarkan urutan
  const providerPatterns = [
    'drive.google.com', 'mediafire.com', 'zippyshare.com', 'mega.nz', 'mega.co.nz',
    'yadi.sk', 'disk.yandex', 'dropbox.com', '1fichier.com', 'uploadhaven.com',
    'gofile.io', 'pixeldrain.com', 'streamtape.com', 'doodstream.com', 'mixdrop.co',
    'filelions.com', 'vidhide.com', 'streamwish.com', 'faststore.org', 'acefile.co',
    'desustream.com', 'kfiles', 'pdrain', 'odfiles', 'goofile'
  ];

  const allProviderLinks = [];
  
  $('a[href]').each((_, el) => {
    try {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      
      if (href && href.startsWith('http')) {
        const isProvider = providerPatterns.some(pattern => 
          href.toLowerCase().includes(pattern.toLowerCase())
        );
        
        if (isProvider) {
          const quality = extractQuality(text);
          const provider = extractProvider(href);
          const name = text.replace(/(1080p|4K|720p|480p|360p|HD|SD)/gi, '').trim() || provider;
          allProviderLinks.push({ quality, name, url: href, provider, text });
        }
      }
    } catch (e) {
      // Skip
    }
  });

  // Assign quality berdasarkan urutan jika tidak ada quality info
  // Asumsi: link pertama = kualitas tertinggi
  allProviderLinks.forEach((link, index) => {
    let finalQuality = link.quality;
    
    if (!finalQuality) {
      // Assign berdasarkan urutan provider links
      if (index < 3) finalQuality = '1080P';
      else if (index < 8) finalQuality = '720P';
      else if (index < 15) finalQuality = '480P';
      else finalQuality = '360P';
    }
    
    addMirror(finalQuality, link.name, link.url, link.provider);
  });

  // Strategy 6: Cari di dalam script tags untuk embedded URLs
  $('script').each((_, el) => {
    try {
      const scriptContent = $(el).html();
      if (!scriptContent) return;
      
      // Extract URLs dari JavaScript
      const urlPattern = /https?:\/\/[^\s"'<>]+/g;
      const matches = scriptContent.match(urlPattern) || [];
      
      matches.forEach(matchUrl => {
        // Filter untuk URL yang valid dan bukan asset
        if (matchUrl.includes('drive') || matchUrl.includes('mega') || 
            matchUrl.includes('mediafire') || matchUrl.includes('gofile') ||
            matchUrl.includes('acefile') || matchUrl.includes('desustream')) {
          
          const quality = 'Unknown';
          const provider = extractProvider(matchUrl);
          const name = provider;
          addMirror(quality, name, matchUrl, provider);
        }
      });
    } catch (e) {
      // Skip
    }
  });

  // Group mirrors by provider dan assign quality jika masih ada yang Unknown
  const providerGroups = {};
  mirrors.forEach(mirror => {
    if (!providerGroups[mirror.provider]) {
      providerGroups[mirror.provider] = [];
    }
    providerGroups[mirror.provider].push(mirror);
  });

  // Assign quality berdasarkan urutan dalam group
  Object.values(providerGroups).forEach(group => {
    group.forEach((mirror, idx) => {
      if (mirror.quality === 'Unknown') {
        if (idx === 0) mirror.quality = '1080P';
        else if (idx === 1) mirror.quality = '720P';
        else if (idx === 2) mirror.quality = '480P';
        else mirror.quality = '360P';
      }
    });
  });

  return {
    title,
    slug,
    iframe: mainIframe,
    iframes: streamingUrl,
    embedLinks,
    mirrors,
    totalMirrors: mirrors.length,
    downloads,
    totalDownloads: downloads.length,
  };
}

/**
 * Scrape ongoing anime dari /ongoing-anime/
 */
async function scrapeOngoing(page = 1) {
  const url = page === 1 ? '/ongoing-anime/' : `/ongoing-anime/page/${page}/`;
  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  const animes = [];
  const seenSlugs = new Set();

  // Selector 1: .col-anime (struktur modern)
  $('.col-anime, .anime-item, .list-item').each((_, el) => {
    try {
      const $titleEl = $(el).find('a[title], h2 a, .title a, .anime-title a').first();
      const title = $titleEl.text().trim();
      let slug = $titleEl.attr('href') || '';

      // Extract slug dari URL
      const slugMatch = slug.match(/\/anime\/([^/]+)\/?/);
      slug = slugMatch ? slugMatch[1] : slug.replace('/anime/', '').replace(/\/$/, '');

      if (!slug || seenSlugs.has(slug)) return;

      const thumbnail = $(el).find('img').first().attr('src') ||
                        $(el).find('img').first().attr('data-src') || '';
      const episodes = $(el).find('.epz, .episode-count, [class*="episode"]').first().text().trim();
      const day = $(el).find('.epztipe, .day, [class*="day"]').first().text().trim();
      const rating = $(el).find('.rating, [class*="rating"]').first().text().trim();

      seenSlugs.add(slug);
      animes.push({
        title,
        slug,
        thumbnail: thumbnail || null,
        episodes: episodes || null,
        day: day || null,
        rating: rating || null,
      });
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

        if (!slug || seenSlugs.has(slug)) return;

        const thumbnail = $(el).find('img').first().attr('src') ||
                          $(el).find('img').first().attr('data-src') || '';
        const episodes = $(el).find('.epz').text().trim();
        const day = $(el).find('.epztipe').text().trim();

        seenSlugs.add(slug);
        animes.push({
          title,
          slug,
          thumbnail: thumbnail || null,
          episodes: episodes || null,
          day: day || null,
          rating: null,
        });
      } catch (e) {
        // Skip
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

        if (title && slug && title.length < 200 && !seenSlugs.has(slug)) {
          seenSlugs.add(slug);
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
      } catch (e) {
        // Skip
      }
    });
  }

  // Parse pagination info
  const pagination = {
    currentPage: page,
    hasNextPage: false,
    hasPrevPage: page > 1,
    nextPage: null,
    prevPage: page > 1 ? page - 1 : null,
  };

  // Check for next page link
  const nextPageEl = $('.pagination a:contains("Next"), .nav-next a, a.next, [class*="next"] a').first();
  if (nextPageEl.length) {
    const nextHref = nextPageEl.attr('href');
    const nextPageMatch = nextHref.match(/\/page\/(\d+)/);
    pagination.hasNextPage = true;
    pagination.nextPage = nextPageMatch ? parseInt(nextPageMatch[1]) : page + 1;
  } else {
    // Jika tidak ada link next, cek apakah ada anime (artinya masih ada halaman berikutnya)
    pagination.hasNextPage = animes.length >= 20; // Asumsi 20+ anime per halaman
    if (pagination.hasNextPage) {
      pagination.nextPage = page + 1;
    }
  }

  return {
    page,
    total: animes.length,
    animes,
    pagination,
  };
}

/**
 * Scrape complete anime dari /complete-anime/
 */
async function scrapeComplete(page = 1) {
  const url = page === 1 ? '/complete-anime/' : `/complete-anime/page/${page}/`;
  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  const animes = [];
  const seenSlugs = new Set();

  // Selector 1: .col-anime (struktur modern)
  $('.col-anime, .anime-item, .list-item').each((_, el) => {
    try {
      const $titleEl = $(el).find('a[title], h2 a, .title a, .anime-title a').first();
      const title = $titleEl.text().trim();
      let slug = $titleEl.attr('href') || '';

      // Extract slug dari URL
      const slugMatch = slug.match(/\/anime\/([^/]+)\/?/);
      slug = slugMatch ? slugMatch[1] : slug.replace('/anime/', '').replace(/\/$/, '');

      if (!slug || seenSlugs.has(slug)) return;

      const thumbnail = $(el).find('img').first().attr('src') ||
                        $(el).find('img').first().attr('data-src') || '';
      const episodes = $(el).find('.epz, .episode-count, [class*="episode"]').first().text().trim();
      const status = $(el).find('.epztipe, .status, [class*="status"]').first().text().trim();
      const rating = $(el).find('.rating, [class*="rating"]').first().text().trim();

      seenSlugs.add(slug);
      animes.push({
        title,
        slug,
        thumbnail: thumbnail || null,
        episodes: episodes || null,
        status: status || 'Completed',
        rating: rating || null,
      });
    } catch (e) {
      // Skip item yang error
    }
  });

  // Selector 2: .venz li (struktur klasik)
  if (animes.length === 0) {
    $('.venz li, .complete-list li, ul li:has(a[href*="/anime/"])').each((_, el) => {
      try {
        const $titleEl = $(el).find('h2 a, a[title]').first();
        const title = $titleEl.text().trim();
        let slug = $titleEl.attr('href') || '';

        const slugMatch = slug.match(/\/anime\/([^/]+)\/?/);
        slug = slugMatch ? slugMatch[1] : slug.replace('/anime/', '').replace(/\/$/, '');

        if (!slug || seenSlugs.has(slug)) return;

        const thumbnail = $(el).find('img').first().attr('src') ||
                          $(el).find('img').first().attr('data-src') || '';
        const episodes = $(el).find('.epz').text().trim();
        const status = $(el).find('.epztipe').text().trim();

        seenSlugs.add(slug);
        animes.push({
          title,
          slug,
          thumbnail: thumbnail || null,
          episodes: episodes || null,
          status: status || 'Completed',
          rating: null,
        });
      } catch (e) {
        // Skip
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

        if (title && slug && title.length < 200 && !seenSlugs.has(slug)) {
          seenSlugs.add(slug);
          const thumbnail = $(el).find('img').first().attr('src') ||
                            $(el).find('img').first().attr('data-src') ||
                            $(el).parent().find('img').first().attr('src') || null;

          animes.push({
            title,
            slug,
            thumbnail,
            episodes: null,
            status: 'Completed',
            rating: null,
          });
        }
      } catch (e) {
        // Skip
      }
    });
  }

  // Parse pagination info
  const pagination = {
    currentPage: page,
    hasNextPage: false,
    hasPrevPage: page > 1,
    nextPage: null,
    prevPage: page > 1 ? page - 1 : null,
  };

  // Check for next page link
  const nextPageEl = $('.pagination a:contains("Next"), .nav-next a, a.next, [class*="next"] a').first();
  if (nextPageEl.length) {
    const nextHref = nextPageEl.attr('href');
    const nextPageMatch = nextHref.match(/\/page\/(\d+)/);
    pagination.hasNextPage = true;
    pagination.nextPage = nextPageMatch ? parseInt(nextPageMatch[1]) : page + 1;
  } else {
    // Jika tidak ada link next, cek apakah ada anime (artinya masih ada halaman berikutnya)
    pagination.hasNextPage = animes.length >= 20; // Asumsi 20+ anime per halaman
    if (pagination.hasNextPage) {
      pagination.nextPage = page + 1;
    }
  }

  return {
    page,
    total: animes.length,
    animes,
    pagination,
  };
}

/**
 * Scrape jadwal rilis dari /jadwal-rilis/
 */
async function scrapeSchedule() {
  const url = '/jadwal-rilis/';
  const html = await fetchHtml(url);
  const $ = parseHtml(html);

  const schedule = {
    Senin: [],
    Selasa: [],
    Rabu: [],
    Kamis: [],
    Jumat: [],
    Sabtu: [],
    Minggu: [],
  };

  const dayMapping = {
    'Senin': 'Senin',
    'Selasa': 'Selasa',
    'Rabu': 'Rabu',
    'Kamis': 'Kamis',
    'Jumat': 'Jumat',
    'Sabtu': 'Sabtu',
    'Minggu': 'Minggu',
  };

  // Structure: .kglist321 > h2 (day name) + ul > li > a (anime links)
  $('.kglist321').each((_, container) => {
    try {
      const dayName = $(container).find('h2').first().text().trim();
      
      // Match day name
      let matchedDay = null;
      for (const [key, value] of Object.entries(dayMapping)) {
        if (dayName.includes(key)) {
          matchedDay = key;
          break;
        }
      }

      if (!matchedDay) return;

      // Get anime list untuk hari ini
      $(container).find('ul li').each((_, el) => {
        try {
          const $link = $(el).find('a').first();
          const title = $link.text().trim();
          let href = $link.attr('href') || '';

          const slugMatch = href.match(/\/anime\/([^/]+)\/?/);
          const slug = slugMatch ? slugMatch[1] : href.replace('/anime/', '').replace(/\/$/, '');

          const thumbnail = $(el).find('img').first().attr('src') ||
                            $(el).find('img').first().attr('data-src') || null;

          if (title && slug) {
            schedule[matchedDay].push({
              title,
              slug,
              thumbnail: thumbnail || null,
              time: null,
            });
          }
        } catch (e) {
          // Skip
        }
      });
    } catch (e) {
      // Skip
    }
  });

  // Count total
  const total = Object.values(schedule).reduce((sum, arr) => sum + arr.length, 0);

  return {
    total,
    schedule,
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
  scrapeOngoing,
  scrapeComplete,
  scrapeSchedule,
  scrapeAnimeDetail,
  scrapeEpisodeDetail,
  scrapeNonton,
  scrapeSearch,
};
