// Game Configuration Constants

module.exports = {
  TICK_RATE: 60,
  MAX_PLAYERS: 16,
  INACTIVE_TIMEOUT: 300000, // 5 minutes
  MIN_MOVE_INTERVAL: 16, // ~60fps max
  PORT: process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000,
  CORS_ORIGIN: process.env.NODE_ENV === 'production' ? process.env.CORS_ORIGIN : 'http://localhost:5173',
  
  PROJECTILE_CONFIGS: {
    cannon: {
      speed: 300,
      radius: 0.15,
      maxDistance: 200,
      maxLifetime: 5000,
      damage: 30,
      distanceFalloff: {
        start: 50,  // Distance at which damage starts falling off
        end: 100,   // Distance at which damage reaches minimum
        minDamage: 25  // Minimum damage at maximum range
      }
      
    },
    rocket: {
      speed: 200, // Matched with client perception for fast rockets
      radius: 0.3,
      maxDistance: 200,
      maxLifetime: 5000,
      damage: 40,
      distanceFalloff: {
        start: 40,
        end: 80,
        minDamage: 20
      }
    },
    // Duplicated for rocketLauncher weapon type for consistency
    rocketLauncher: {
      speed: 200, // Matched with client perception for fast rockets
      radius: 0.3,
      maxDistance: 200,
      maxLifetime: 5000,
      damage: 40,
      distanceFalloff: {
        start: 40,
        end: 80,
        minDamage: 20
      }
    },
    gatling: {
      speed: 400,       // Fast bullets
      radius: 0.1,      // Small radius
      maxDistance: 150, // Long range
      maxLifetime: 5000,
      damage: 2,        // As specified
      distanceFalloff: {
        start: 60,      // Start falloff later
        end: 100,       // End falloff sooner relative to max distance
        minDamage: 3    // Minimum damage at max range
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
    },
    turretCannon: { // New config for the turret
      speed: 250,       // Moderate speed
      radius: 2,      // Large radius (capsule-like effect via size)
      maxDistance: 1000, // Long range
      maxLifetime: 10000, // Longer lifetime
      damage: 500,       // High damage
    }
  },

  PLAYER_CONFIG: {
    maxHealth: 200,
    spawnInvulnerabilityTime: 3000, // 3 seconds of invulnerability after spawn
    respawnDelay: 5000  // 5 seconds before respawn
  },

  WEAPON_COOLDOWN: {
    cannon: 500,  // 0.5 second between shots
    rocketLauncher: 500,
    rocket: 500, // Match rocketLauncher cooldown for consistency
    gatling: 20, // 0.2 seconds between shots (20ms)
    turretCannon: 1000, // 1 second cooldown for the turret
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
    gatling: {
      initial: 500,
      max: 1000,
      pickupAmount: 500
    },
    default: {
      initial: 20,
      max: 40,
      pickupAmount: 10
    }
  }
};
