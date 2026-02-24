/**
 * api/index.js - Vercel Serverless Function
 * Entry point untuk deployment di Vercel
 */

// dotenv tidak diperlukan di Vercel karena env vars dihandle otomatis
// require('dotenv').config();

const app = require('../server');

// Export default untuk Vercel serverless
module.exports = app;
