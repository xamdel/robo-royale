// Game Configuration Constants

module.exports = {
  TICK_RATE: 60,
  MAX_PLAYERS: 16,
  INACTIVE_TIMEOUT: 300000, // 5 minutes
  MIN_MOVE_INTERVAL: 16, // ~60fps max
  PORT: process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000,
  CORS_ORIGIN: "http://localhost:5173",
  
  PROJECTILE_CONFIGS: {
    cannon: {
      speed: 300,
      radius: 0.15,
      maxDistance: 100,
      maxLifetime: 5000
    },
    default: {
      speed: 25,
      radius: 0.3,
      maxDistance: 80,
      maxLifetime: 5000
    }
  }
};
