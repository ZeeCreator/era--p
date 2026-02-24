/**
 * Random delay helper untuk menghindari deteksi bot
 * Delay antara 1000-3000 ms
 */

function randomDelay(min = 1000, max = 3000) {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(resolve => setTimeout(resolve, delay));
}

module.exports = { randomDelay };
