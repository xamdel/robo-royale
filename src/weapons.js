import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';
import { GPUParticleSystem } from './systems/GPUParticleSystem.js';

class Projectile extends THREE.Mesh {
  constructor(config) {
    super(
      new THREE.SphereGeometry(config.radius, 8, 8),
      new THREE.MeshBasicMaterial({ color: config.color })
    );
    
    this.velocity = new THREE.Vector3();
    this.startPosition = new THREE.Vector3();
    this.config = config;
    this.active = false;
    this.sourcePlayer = null;
    this.serverId = null; // Server-assigned ID
    this.serverPosition = null; // For reconciliation
  }

  init(position, direction, sourcePlayer, serverId = null) {
    this.position.copy(position);
    this.startPosition.copy(position);
    // Also initialize prevPosition at spawn time to ensure ray casting works on first update
    this.prevPosition = position.clone();
    this.velocity.copy(direction).multiplyScalar(this.config.speed);
    this.sourcePlayer = sourcePlayer;
    this.active = true;
    this.serverId = serverId; // Store server-assigned ID
    this.spawnTime = Date.now(); // Track spawn time for grace period
  }

  update(deltaTime) {
    if (!this.active) return;

    // Apply server correction if available
    if (this.serverId !== null && this.serverPosition) {
      const CORRECTION_STRENGTH = 0.2;
      this.position.lerp(this.serverPosition, CORRECTION_STRENGTH);
    } else {
      // Normal client-side movement for visual prediction only
      this.position.addScaledVector(this.velocity, deltaTime);
    }
    
    // Store previous position for visual effects
    this.prevPosition = this.position.clone();
  }
  
  deactivate() {
    this.active = false;
    SceneManager.remove(this);
  }
}

class ProjectileManager {
  constructor() {
    this.pools = new Map();
    this.activeProjectiles = new Set();
    
    // Pre-configure projectile types
    this.projectileTypes = {
      cannon: {
        radius: 0.15,
        speed: 300,
        maxDistance: 100,
        color: 0xdae640,
        poolSize: 20
      },
      rocket: {
        radius: 0.3,
        speed: 25,
        maxDistance: 80,
        color: 0xff4400,
        poolSize: 10
      }
    };
    
    this.initPools();
  }

  initPools() {
    for (const [type, config] of Object.entries(this.projectileTypes)) {
      const pool = [];
      for (let i = 0; i < config.poolSize; i++) {
        // Add type to projectile config
        pool.push(new Projectile({ ...config, type }));
      }
      this.pools.set(type, pool);
    }
  }

  spawn(type, position, direction, sourcePlayer) {
    const pool = this.pools.get(type);
    if (!pool || pool.length === 0) return null;
    
    const projectile = pool.pop();
    projectile.init(position, direction, sourcePlayer);
    
    SceneManager.add(projectile);
    this.activeProjectiles.add(projectile);
    
    return projectile;
  }

  update(deltaTime) {
    const toRemove = [];
  
    // First pass: update and mark
    for (const projectile of this.activeProjectiles) {
      projectile.update(deltaTime);
      if (!projectile.active) toRemove.push(projectile);
    }

    // Second pass: remove and replenish pools
    toRemove.forEach(projectile => {
      this.activeProjectiles.delete(projectile);
      const pool = this.pools.get(projectile.config.type);
      if (pool) pool.push(projectile);
    });
  }
}

export const WeaponManager = {
  projectileManager: new ProjectileManager(),
  weaponOwnership: new Map(), // Track which weapons are owned by which players
  lastFireTime: 0, // Track last weapon fire time for cooldown
  networkProjectiles: new Map(), // Track projectiles by server-assigned ID
  weaponAmmo: new Map(), // Track ammo for each weapon
  
  // Particle systems will be initialized in init()
  explosionParticles: null,
  collisionParticles: null,

  weaponSockets: {
    leftArm: {
      boneName: 'ArmL',
      position: [-0.55, -2.46, 0.00],
      rotation: [0, 0, 0],
      scale: 1,
      attachmentCallback: null,
    },
    rightArm: {
      boneName: 'ArmR',
      position: [-0.5, 0, 0],
      rotation: [0, -Math.PI / 2, 0],
      scale: 0.2,
    },
    shoulderLeft: {
      boneName: 'ShoulderL',
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 0.25,
    },
    shoulderRight: {
      boneName: 'ShoulderR',
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 0.25,
    },
  },

  weaponTypes: {
    cannon: {
      socket: 'leftArm',
      positionOffset: [0, 0, 0],
      rotationOffset: [0, 0, 0],
      scaleMultiplier: 1.0,
      effectColor: 0xffff00,
    },
    rocketLauncher: {
      socket: 'rightArm',
      positionOffset: [0, 0.1, 0],
      rotationOffset: [0, 0, 0],
      scaleMultiplier: 1.2,
      effectColor: 0xff0000,
    },
  },

  findBoneByName(player, boneName) {
    let result = null;

    if (!player) {
      console.error('Player model not loaded, cannot find bone:', boneName);
      return null;
    }

    player.traverse((object) => {
      if (object.name === boneName) {
        result = object;
      }
    });

    if (!result) {
      console.warn(`Bone "${boneName}" not found in player model`);
    }

    return result;
  },

  attachWeaponToSocket(player, weaponObject, socketName, weaponType = 'cannon', isRemotePickup = false) {
    const socket = this.weaponSockets[socketName];
    const weaponConfig = this.weaponTypes[weaponType] || this.weaponTypes.cannon;

    if (!socket) {
      console.error(`Socket "${socketName}" not defined`);
      return false;
    }

    // Track weapon ownership
    this.weaponOwnership.set(weaponObject.uuid, player.uuid);

    const bone = this.findBoneByName(player, socket.boneName);
    if (!bone) {
      console.error(
        `Could not find bone "${socket.boneName}" for socket "${socketName}"`
      );
      return false;
    }

    const worldPos = new THREE.Vector3();
    weaponObject.getWorldPosition(worldPos);

    const originalScale = weaponObject.scale.clone();

    SceneManager.scene.remove(weaponObject);
    bone.add(weaponObject);

    weaponObject.position.set(...socket.position);
    weaponObject.rotation.set(...socket.rotation);

    weaponObject.position.x += weaponConfig.positionOffset[0];
    weaponObject.position.y += weaponConfig.positionOffset[1];
    weaponObject.position.z += weaponConfig.positionOffset[2];

    weaponObject.rotation.x += weaponConfig.rotationOffset[0];
    weaponObject.rotation.y += weaponConfig.rotationOffset[1];
    weaponObject.rotation.z += weaponConfig.rotationOffset[2];

    const finalScale = socket.scale * weaponConfig.scaleMultiplier;
    weaponObject.scale.set(
      originalScale.x * finalScale,
      originalScale.y * finalScale,
      originalScale.z * finalScale
    );

    // Only log attachment for local pickups
    if (!isRemotePickup) {
      console.log(
        `Attached "${weaponType}" to socket "${socketName}" on bone "${socket.boneName}"`,
        {
          finalPosition: weaponObject.position.toArray(),
          finalRotation: weaponObject.rotation.toArray(),
          finalScale: weaponObject.scale.toArray(),
        }
      );
    }

    if (socket.attachmentCallback) {
      socket.attachmentCallback(weaponObject, bone);
    }

    // Notify other players about weapon pickup with weapon type and player ID
    if (!isRemotePickup) {
      Network.sendWeaponPickup({
        weaponId: weaponObject.uuid,
        weaponType: weaponType,
        socketName: socketName
      });
    }

    return true;
  },

  handleAmmoUpdate(data) {
    // Update weapon ammo count
    this.weaponAmmo.set(data.weaponId, data.ammo);

    // Update HUD if available
    if (window.HUD) {
      window.HUD.updateAmmo(data.ammo);
    }
  },

  fireWeapon(player, weaponType = 'cannon') {
    const now = Date.now();
    
    // Get weapon info
    const weaponId = Array.from(this.weaponOwnership.entries())
      .find(([_, ownerId]) => ownerId === player.uuid)?.[0];

    if (!weaponId) {
      console.warn('No weapon found for player');
      return;
    }

    // Check if player is dead
    if (player === Game.player && Game.isDead) {
      return;
    }

    // Check ammo for local player
    if (player === Game.player) {
      const ammo = this.weaponAmmo.get(weaponId);
      if (ammo !== undefined && ammo <= 0) {
        if (window.HUD) {
          window.HUD.showAlert("OUT OF AMMO", "warning");
        }
        return;
      }
    }

    const socketName = this.weaponTypes[weaponType].socket;
    const socket = this.weaponSockets[socketName];
    const bone = this.findBoneByName(player, socket.boneName);
    if (!bone) return;

    const worldPos = new THREE.Vector3();
    const worldDir = new THREE.Vector3(0, 0, -1);

    bone.getWorldPosition(worldPos);
    bone.getWorldDirection(worldDir);

    // Offset spawn position to avoid self-collision
    const spawnOffset = 1.5;
    worldPos.add(worldDir.clone().multiplyScalar(spawnOffset));

    // Only proceed if this is the local player
    if (player === Game.player) {
      // Send shot data to server first
      Network.sendShot({
        weaponId: weaponId,
        type: weaponType,
        position: worldPos,
        direction: worldDir,
      });

      // Spawn projectile for client-side prediction
      const projectile = this.projectileManager.spawn(
        weaponType,
        worldPos,
        worldDir,
        player
      );

      if (projectile) {
        this.lastFireTime = now;
        Game.lastFireTime = now;
      }
    }
  },

  async init() {
    try {
      // Initialize particle systems
      this.explosionParticles = await GPUParticleSystem.create({
        maxParticles: 2000,
        particleSize: 0.4,
        blending: THREE.AdditiveBlending
      });
      
      this.collisionParticles = await GPUParticleSystem.create({
        maxParticles: 1000,
        particleSize: 0.15,
        blending: THREE.AdditiveBlending
      });

      // Add to scene
      SceneManager.add(this.explosionParticles);
      SceneManager.add(this.collisionParticles);

      console.log('Weapon particle systems initialized');
      
      // Test particle systems
      setTimeout(() => {
        console.log('[Particles] Running test effects');
        this.createExplosion(new THREE.Vector3(0, 2, 0));
        this.addCollisionEffect(new THREE.Vector3(2, 2, 0), 0xffff00);
        this.createPlayerExplosion(new THREE.Vector3(-2, 2, 0));
      }, 1000); // Wait for scene to be ready
    } catch (error) {
      console.error('Failed to initialize particle systems:', error);
    }
  },


  handleRemoteShot(data) {
    // Only spawn projectile if server confirmed the shot
    if (!data.serverConfirmed) return;

    const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
    const sourcePlayer = Game.otherPlayers[data.playerId]?.mesh;
    
    const projectile = this.projectileManager.spawn(
      data.type,
      position,
      direction,
      sourcePlayer
    );

    if (projectile) {
      projectile.serverId = data.projectileId;
    }
  },

  // Handle server hit confirmations
  handleServerHit(data) {
    console.log('[Particles] Server hit:', data);
    // Show hit effect with weapon-specific colors
    if (data.position) {
      const pos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
      // Use weapon-specific colors if available
      const color = data.weaponType === 'cannon' ? 0xffff00 : 0xff4400;
      this.createExplosion(pos);
      this.addCollisionEffect(pos, color);
    }

    // If we're the shooter, show hit confirmation in HUD
    if (Game.player && data.sourcePlayerId === Network.socket.id && window.HUD) {
      window.HUD.showAlert(`Hit! Damage: ${data.damage}`, "success");
      
      if (data.wasKilled) {
        window.HUD.showAlert("Enemy destroyed!", "success");
      }
    }
  },

  // Handle server health updates
  handleHealthUpdate(data) {
    // Only handle ammo updates here, health is handled by Game object
    if (data.weaponId && data.ammo !== undefined) {
      this.weaponAmmo.set(data.weaponId, data.ammo);
      if (window.HUD) {
        window.HUD.updateAmmo(data.ammo);
      }
    }
  },

  createPlayerExplosion(position) {
    if (!this.explosionParticles) {
      console.error('[Particles] Explosion particles not initialized');
      return;
    }
    
    console.log('[Particles] Creating player explosion at:', position.toArray());
    
    // Core explosion
    this.explosionParticles.emit({
      position: position,
      count: 50,
      spread: 2.0,
      velocity: 12.0,
      color: new THREE.Color(0xff3300),
      lifetime: 0.8
    });

    // Metal debris
    this.explosionParticles.emit({
      position: position,
      count: 35,
      spread: 2.5,
      velocity: 18.0,
      color: new THREE.Color(0xcccccc),
      lifetime: 1.2
    });

    // Electrical sparks
    this.explosionParticles.emit({
      position: position,
      count: 25,
      spread: 3.0,
      velocity: 20.0,
      color: new THREE.Color(0x00ffff),
      lifetime: 0.4
    });
    
    // Add a flash effect
    const flash = new THREE.PointLight(0xff8800, 5, 10);
    flash.position.copy(position);
    SceneManager.add(flash);
    
    // Fade out the flash
    const startTime = performance.now();
    const flashDuration = 300;
    
    const updateFlash = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / flashDuration;
      
      if (progress >= 1) {
        SceneManager.remove(flash);
        return;
      }
      
      flash.intensity = 5 * (1 - progress);
      requestAnimationFrame(updateFlash);
    };
    
    updateFlash();
  },

  createExplosion(position) {
    if (!this.collisionParticles) {
      console.error('[Particles] Collision particles not initialized');
      return;
    }
    
    console.log('[Particles] Creating explosion at:', position.toArray());
    
    this.collisionParticles.emit({
      position: position,
      count: 40,
      spread: 3.0,
      velocity: 12.0,
      color: new THREE.Color(0xff4400),
      lifetime: 1.0
    });
  },

  addCollisionEffect(position, color = 0xffff00) {
    if (!this.collisionParticles) {
      console.error('[Particles] Collision particles not initialized');
      return;
    }
    
    console.log('[Particles] Adding collision effect at:', position.toArray());
    
    this.collisionParticles.emit({
      position: position,
      count: 15, // Fewer particles
      spread: 1.0, // More concentrated
      velocity: 6.0, // Slightly slower
      color: new THREE.Color(color),
      lifetime: 0.3 // Shorter lifetime
    });
  },

  update(deltaTime) {
    this.projectileManager.update(deltaTime);
    
    // Only update particle systems if they're initialized
    if (this.explosionParticles && this.collisionParticles) {
      this.explosionParticles.update(deltaTime);
      this.collisionParticles.update(deltaTime);
    }
  }
};
