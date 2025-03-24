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
      maxLifetime: 5000,
      damage: 20,
      distanceFalloff: {
        start: 50,  // Distance at which damage starts falling off
        end: 100,   // Distance at which damage reaches minimum
        minDamage: 20  // Minimum damage at maximum range
      }
      
    },
    rocket: {
      speed: 25,
      radius: 0.3,
      maxDistance: 80,
      maxLifetime: 5000,
      damage: 40,
      distanceFalloff: {
        start: 40,
        end: 80,
        minDamage: 20
      }
    },
    default: {
      speed: 25,
      radius: 0.3,
      maxDistance: 80,
      maxLifetime: 5000,
      damage: 25,
      distanceFalloff: {
        start: 40,
        end: 80,
        minDamage: 15
      }
    }
  },

  PLAYER_CONFIG: {
    maxHealth: 100,
    spawnInvulnerabilityTime: 3000, // 3 seconds of invulnerability after spawn
    respawnDelay: 5000  // 5 seconds before respawn
  },

  WEAPON_COOLDOWN: {
    cannon: 500,  // 0.5 second between shots
    rocketLauncher: 1000,
    default: 500   // 0.5 seconds between shots
  },

  WEAPON_AMMO: {
    cannon: {
      initial: 20,      // Starting ammo when weapon is picked up
      max: 20,          // Maximum ammo capacity
      pickupAmount: 5   // Amount of ammo gained from ammo pickups
    },
    rocketLauncher: {
      initial: 4,      // Starting ammo when weapon is picked up
      max: 8,         // Maximum ammo capacity 
      pickupAmount: 4   // Amount of ammo gained from ammo pickups
    },
    default: {
      initial: 20,
      max: 40,
      pickupAmount: 10
    }
  }
};
