# 🎌 Otakudesu API

REST API scraper untuk mengambil data dari **Otakudesu.best** dengan fitur Cloudflare bypass, caching, dan rate limiting. Mendukung deployment di **Local (Express)** dan **Vercel (Serverless)**.

## ✨ Fitur

- 🔐 **Cloudflare Bypass** - Menggunakan header browser realistis dan random delay
- 🚀 **Caching System** - Node-cache dengan TTL berbeda per endpoint
- 🛡️ **Rate Limiting** - 60 request per IP per 15 menit
- 🔒 **Security** - Helmet.js untuk security headers
- 📦 **Dual Mode** - Support Local Express & Vercel Serverless
- 📝 **Logging** - Request logging untuk debugging
- ⚡ **Random Delay** - 1000-3000ms untuk menghindari deteksi bot

## 📁 Struktur Project

```
api-nime2/
│
├── package.json              # Dependencies & scripts
├── server.js                 # Local Express server
├── vercel.json               # Vercel configuration
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules
│
├── api/
│   └── index.js              # Vercel serverless entry point
│
├── routes/
│   └── anime.js              # API routes handler
│
├── services/
│   └── scraper.js            # Main scraping logic
│
├── utils/
│   ├── cache.js              # Cache configuration
│   └── delay.js              # Random delay helper
│
└── middleware/
    └── errorHandler.js       # Error handling middleware
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Environment

```bash
# Salin file .env.example menjadi .env
cp .env.example .env

# Edit .env sesuai kebutuhan (opsional)
```

### 3. Run Local Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

Server akan berjalan di `http://localhost:3000`

## 📡 API Endpoints

### Base URL
- **Local:** `http://localhost:3000`
- **Vercel:** `https://your-project.vercel.app`

### 1. Get Latest Anime (Ongoing)

```http
GET /api/latest
GET /api/latest?page=2
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "page": 1,
    "total": 20,
    "animes": [
      {
        "title": "Osananajimi Love Comedy",
        "slug": "osananajimi-love-comedy-sub-indo",
        "thumbnail": "https://...",
        "episodes": "Episode 12",
        "day": "Senin",
        "rating": "8.5"
      }
    ]
  }
}
```

### 2. Get Anime Detail

```http
GET /api/anime/:slug
```

**Contoh:**
```http
GET /api/anime/osananajimi-love-comedy-sub-indo
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "title": "Osananajimi Love Comedy",
    "slug": "osananajimi-love-comedy-sub-indo",
    "thumbnail": "https://...",
    "japanese": "幼馴染ラブコメ",
    "english": "Childhood Friend Love Comedy",
    "type": "TV Series",
    "status": "Ongoing",
    "episodes": "12",
    "duration": "24 min",
    "season": "Winter 2024",
    "studios": "Studio Example",
    "genre": ["Comedy", "Romance", "School"],
    "rating": "8.5",
    "score": "8.75",
    "synopsis": "Cerita tentang...",
    "episodesList": [
      {
        "title": "Osananajimi Love Comedy Episode 1 Sub Indo",
        "slug": "olcn-episode-1-sub-indo"
      }
    ]
  }
}
```

### 3. Get Anime Episodes

```http
GET /api/anime/:slug/episodes
```

**Contoh:**
```http
GET /api/anime/osananajimi-love-comedy-sub-indo/episodes
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "slug": "osananajimi-love-comedy-sub-indo",
    "title": "Osananajimi Love Comedy",
    "totalEpisodes": 12,
    "episodes": [
      {
        "title": "Osananajimi Love Comedy Episode 12 Sub Indo",
        "slug": "olcn-episode-12-sub-indo"
      }
    ]
  }
}
```

### 4. Get Episode Detail

```http
GET /api/episode/:slug
```

**Contoh:**
```http
GET /api/episode/olcn-episode-12-sub-indo
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "title": "Osananajimi Love Comedy Episode 12 Sub Indo",
    "slug": "olcn-episode-12-sub-indo",
    "thumbnail": "https://...",
    "animeTitle": "Osananajimi Love Comedy",
    "episodeNumber": "12",
    "releaseDate": "24 Februari 2024",
    "downloadLinks": [
      {
        "quality": "480p",
        "links": [
          { "name": "Google Drive", "url": "https://..." },
          { "name": "Mediafire", "url": "https://..." }
        ]
      },
      {
        "quality": "720p",
        "links": [...]
      }
    ],
    "streamingLinks": [],
    "navigation": {
      "prev": {
        "title": "Episode 11",
        "slug": "olcn-episode-11-sub-indo"
      },
      "next": null
    }
  }
}
```

### 5. Get Link Nonton/Streaming

```http
GET /api/nonton/:slug
```

**Contoh:**
```http
GET /api/nonton/kmygold-s5-episode-8-sub-indo
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "title": "Golden Kamuy Season 5 Episode 8 Sub Indo",
    "slug": "kmygold-s5-episode-8-sub-indo",
    "iframe": "https://desustream.info/dstream/ondesu/v5/index.php?id=...",
    "iframes": [
      {
        "type": "iframe",
        "url": "https://desustream.info/dstream/ondesu/v5/index.php?id=..."
      }
    ],
    "embedLinks": [
      {
        "name": "Stream",
        "url": "https://desustream.info/dstream/ondesu/v5/index.php?id=..."
      }
    ],
    "mirrors": []
  }
}
```

### 6. Search Anime

```http
GET /api/search?q={query}
GET /api/search?q=one+piece&page=1
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "query": "one piece",
    "page": 1,
    "total": 5,
    "results": [
      {
        "title": "One Piece",
        "slug": "one-piece-sub-indo",
        "thumbnail": "https://..."
      }
    ]
  }
}
```

### 6. Health Check

```http
GET /api/health
```

**Response:**
```json
{
  "status": "success",
  "data": {
    "status": "healthy",
    "timestamp": "2024-02-24T10:00:00.000Z",
    "uptime": 3600
  }
}
```

## 🗄️ Cache Configuration

| Endpoint | TTL |
|----------|-----|
| `/api/latest` | 5 menit |
| `/api/anime/:slug` | 10 menit |
| `/api/episode/:slug` | 10 menit |
| `/api/search` | 3 menit |

## 🛡️ Rate Limiting

- **Limit:** 60 request per IP
- **Window:** 15 menit
- **Response saat limit tercapai:**
```json
{
  "status": "error",
  "message": "Terlalu banyak request. Silakan tunggu 15 menit."
}
```

## 🌐 Deploy ke Vercel

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Login ke Vercel

```bash
vercel login
```

### 3. Deploy

```bash
# Deploy preview
vercel

# Deploy production
vercel --prod
```

### 4. Set Environment Variables (Optional)

Di dashboard Vercel:
- `PORT` (otomatis diatur Vercel)
- `NODE_ENV=production`
- `CORS_ORIGIN` (jika perlu)

## 📝 Format Response

### Success Response
```json
{
  "status": "success",
  "data": { ... }
}
```

### Error Response
```json
{
  "status": "error",
  "message": "Error message here"
}
```

## 🔧 Development

### Run in Development Mode

```bash
npm run dev
```

Server akan auto-reload saat ada perubahan file.

### Debug Cache

```http
# Lihat statistik cache
GET /api/cache/stats

# Clear semua cache
GET /api/cache/clear
```

## ⚠️ Disclaimer

Project ini dibuat untuk tujuan **edukasi** dan **pembelajaran**. 

- Gunakan dengan bijak dan bertanggung jawab
- Jangan gunakan untuk komersial tanpa izin
- Hormati kebijakan dan Terms of Service dari otakudesu.best
- Developer tidak bertanggung jawab atas penyalahgunaan

## 📄 License

MIT License - Silakan digunakan dan dimodifikasi sesuai kebutuhan.

## 🤝 Contributing

Pull request dan issue sangat welcome! Mari bersama-sama improve project ini.

---

**Dibuat dengan ❤️ untuk komunitas anime Indonesia**
