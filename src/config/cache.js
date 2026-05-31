const { createClient } = require('redis');

// In-memory fallback store when Redis is unavailable
const memoryStore = new Map();

let redisClient = null;
let usingRedis = false;

const connectRedis = async () => {
  try {
    redisClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

    redisClient.on('error', (err) => {
      if (usingRedis) {
        console.warn('Redis error, falling back to in-memory cache:', err.message);
        usingRedis = false;
      }
    });

    await redisClient.connect();
    usingRedis = true;
    console.log('Redis connected');
  } catch (err) {
    console.warn('Redis unavailable, using in-memory cache:', err.message);
    usingRedis = false;
  }
};

// cache.get(key) → value or null
const get = async (key) => {
  try {
    if (usingRedis && redisClient?.isOpen) {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    }
  } catch {
    usingRedis = false;
  }
  // fallback
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
};

// cache.set(key, value, ttlSeconds)
const set = async (key, value, ttlSeconds = 60) => {
  try {
    if (usingRedis && redisClient?.isOpen) {
      await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
      return;
    }
  } catch {
    usingRedis = false;
  }
  // fallback
  memoryStore.set(key, {
    value,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
};

// cache.del(key)
const del = async (key) => {
  try {
    if (usingRedis && redisClient?.isOpen) {
      await redisClient.del(key);
      return;
    }
  } catch {
    usingRedis = false;
  }
  memoryStore.delete(key);
};

const isRedisActive = () => usingRedis;

module.exports = { connectRedis, get, set, del, isRedisActive };
