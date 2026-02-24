/**
 * api/index.js - Vercel Serverless Function
 * Entry point untuk deployment di Vercel
 */

require('dotenv').config();

const app = require('../server');

// Export default untuk Vercel serverless
module.exports = app;
