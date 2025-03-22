import * as THREE from 'three';
import { SceneManager } from './scene.js';
import { Game } from './game.js';
import { Network } from './network.js';

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

    // If this is a server-synced projectile and we have a server position
    if (this.serverId !== null && this.serverPosition && this.sourcePlayer === Game.player) {
      // Lerp toward server position (soft correction)
      const CORRECTION_STRENGTH = 0.2;
      this.position.lerp(this.serverPosition, CORRECTION_STRENGTH);
    } else {
      // Normal client-side movement for local prediction
      this.position.addScaledVector(this.velocity, deltaTime);
    }
    
    // Check max distance
    if (this.position.distanceTo(this.startPosition) > this.config.maxDistance) {
      this.deactivate();
      return;
    }
    
    // Check collisions
    if (this.checkCollisions()) {
      this.onHit();
      this.deactivate();
    }
  }

  checkCollisions() {
    // Filter out the source player to completely prevent self-collisions
    const allPlayers = Object.values(Game.otherPlayers).map(p => p.mesh);
    // Only include the local player in collision checks if this is not their projectile
    if (this.sourcePlayer !== Game.player) {
      allPlayers.push(Game.player);
    }
    
    // Always use the previously stored position or fall back to start position
    // This ensures the ray begins from a valid previous position
    const prevPosition = this.prevPosition || this.startPosition.clone();
    
    // Calculate ray direction and length from previous position to current
    const rayDirection = new THREE.Vector3().subVectors(this.position, prevPosition);
    const rayLength = rayDirection.length();
    
    // Skip if no movement
    if (rayLength < 0.0001) {
      this.prevPosition = this.position.clone();
      return false;
    }
    
    // For high-speed projectiles like the cannon, we might need to subdivide the ray
    // into smaller segments to avoid tunneling through targets
    const MAX_RAY_DISTANCE = 1.0; // Maximum distance per ray check to prevent tunneling
    const numSegments = Math.ceil(rayLength / MAX_RAY_DISTANCE);
    
    // Check if we need to do segmented ray checks
    if (numSegments > 1) {
      // Create intermediate points along the ray path
      for (let i = 1; i <= numSegments; i++) {
        const t = i / numSegments;
        const intermediatePos = new THREE.Vector3().lerpVectors(prevPosition, this.position, t);
        
        // Create a raycaster for this segment
        const segmentStart = i === 1 ? prevPosition : 
                              new THREE.Vector3().lerpVectors(prevPosition, this.position, (i-1)/numSegments);
        const segmentDirection = new THREE.Vector3().subVectors(intermediatePos, segmentStart).normalize();
        const segmentLength = segmentStart.distanceTo(intermediatePos);
        
        const raycaster = new THREE.Raycaster(segmentStart, segmentDirection, 0, segmentLength);
        
        // Check if this segment hits any players
        if (this.checkRaycastHit(raycaster, allPlayers)) {
          return true;
        }
      }
      
      // No hits after checking all segments
      this.prevPosition = this.position.clone();
      return false;
    } else {
      // Standard single-ray check for slower projectiles
      // Normalize the direction vector
      rayDirection.normalize();
      
      // Create a raycaster
      const raycaster = new THREE.Raycaster(prevPosition, rayDirection, 0, rayLength);
      
      // Check if the ray hits any players
      if (this.checkRaycastHit(raycaster, allPlayers)) {
        return true;
      }
      
      // No hits
      this.prevPosition = this.position.clone();
      return false;
    }
  }
  
  // Helper method to check if a raycaster hits any players
  checkRaycastHit(raycaster, allPlayers) {
    // For each player, create bounding spheres for simpler collision testing
    for (const player of allPlayers) {
      // Skip invalid players and the source player (already filtered in checkCollisions)
      if (!player) continue;
      
      // Skip players without colliders
      if (!player.colliders) continue;
      
      // Create test spheres based on player colliders
      const spheres = [];
      
      // Body capsule - represent with 3 spheres (top, middle, bottom)
      const capsule = player.colliders.body.params;
      const capsuleStart = new THREE.Vector3(0, capsule.height / 2, 0).add(player.position).add(capsule.offset);
      const capsuleEnd = new THREE.Vector3(0, -capsule.height / 2, 0).add(player.position).add(capsule.offset);
      const capsuleMid = new THREE.Vector3().addVectors(capsuleStart, capsuleEnd).multiplyScalar(0.5);
      
      // Add spheres for capsule ends and middle
      spheres.push(new THREE.Sphere(capsuleStart, capsule.radius));
      spheres.push(new THREE.Sphere(capsuleMid, capsule.radius));
      spheres.push(new THREE.Sphere(capsuleEnd, capsule.radius));
      
      // Add sphere for cabin
      const sphere = player.colliders.cabin.params;
      const sphereCenter = new THREE.Vector3().add(player.position).add(sphere.offset);
      spheres.push(new THREE.Sphere(sphereCenter, sphere.radius));
      
      // Check intersection with each sphere
      for (const testSphere of spheres) {
        // Adjust sphere radius to account for projectile size
        const adjustedSphere = new THREE.Sphere(testSphere.center, testSphere.radius + this.config.radius);
        
        // Check if ray intersects the sphere
        const hit = raycaster.ray.intersectSphere(adjustedSphere, new THREE.Vector3());
        
        if (hit) {
          // We found a hit!
          this.setCollisionPoint(hit);
          this.hitPlayerId = player.userData?.id || null;
          return true;
        }
      }
    }
    
    return false;
  }

  // Update the onHit method to inform server about hits with improved hit data
  onHit() {
    // Create visual effect immediately for client-side responsiveness
    if (this.collisionPoint) {
      console.log('Client-side hit prediction showing effect at:', this.collisionPoint);
      WeaponManager.createExplosion(this.collisionPoint, this.config.color);
      // Mark that we've shown the hit effect locally
      this.hasShownHitEffect = true;
    }
    
    // Only send hit data to server if this is a local projectile
    if (this.sourcePlayer === Game.player && this.serverId !== null) {
      console.log('Sending hit suggestion to server for projectile:', this.serverId);
      // Enhanced hit suggestion with more detailed data
      Network.socket.emit('projectileHitSuggestion', {
        projectileId: this.serverId,
        position: this.position.clone(),
        prevPosition: this.prevPosition ? this.prevPosition.clone() : this.startPosition.clone(),
        hitPlayerId: this.hitPlayerId,
        collisionPoint: this.collisionPoint ? this.collisionPoint.clone() : this.position.clone(),
        timeMs: Date.now() // Include timestamp for latency calculations
      });
    }
  }

  deactivate() {
    this.active = false;
    SceneManager.remove(this);
  }

  setCollisionPoint(point) {
    this.collisionPoint = point;
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

  fireWeapon(player, weaponType = 'cannon') {
    const now = Date.now();
    const fireCooldown = Game.cooldownTime || 250; // Use Game's cooldown time
    
    if (now - this.lastFireTime < fireCooldown) return;
    
    // Check ammo for local player
    if (player === Game.player && Game.ammo <= 0) {
      // Display "out of ammo" message using HUD if available
      if (window.HUD) {
        window.HUD.showAlert("OUT OF AMMO", "warning");
      }
      return;
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
    const spawnOffset = 1.5; // Slightly larger than player body radius
    worldPos.add(worldDir.clone().multiplyScalar(spawnOffset));

    const projectile = this.projectileManager.spawn(
      weaponType,
      worldPos,
      worldDir,
      player
    );

    if (projectile) {
      // Only send network event if this is the local player
      if (player === Game.player) {
        // Decrease ammo when firing
        Game.ammo = Math.max(0, Game.ammo - 1);
        
        Network.sendShot({
          type: weaponType,
          position: worldPos,
          direction: worldDir,
        });
        
        // Show firing message
        if (window.HUD) {
          window.HUD.addMessage(`Fired ${weaponType}. Ammo: ${Game.ammo}/${Game.maxAmmo}`);
        }
      }
    }

    this.lastFireTime = now;
    Game.lastFireTime = now; // Update Game's fire time for HUD cooldown display
  },

  update(deltaTime) {
    this.projectileManager.update(deltaTime);
  },

  handleRemoteShot(data) {
    const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
    const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
    const sourcePlayer = Game.otherPlayers[data.playerId]?.mesh;
    
    const projectile = this.projectileManager.spawn(
      data.type,
      position,
      direction,
      sourcePlayer
    );
  },

  createExplosion(position) {
    // Use the same effect system as projectile collisions
    this.addCollisionEffect(position, 0xff4400);
  },

  addCollisionEffect(position, color = 0xffff00) {
    const particles = new THREE.Group();

    for (let i = 0; i < 20; i++) {
      const geometry = new THREE.SphereGeometry(0.1, 8, 8);
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
      });

      const particle = new THREE.Mesh(geometry, material);

      particle.position.set(
        position.x + (Math.random() - 0.5) * 1,
        position.y + (Math.random() - 0.5) * 1,
        position.z + (Math.random() - 0.5) * 1
      );

      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 5,
        (Math.random() - 0.5) * 5
      );

      particles.add(particle);
    }

    SceneManager.add(particles);

    const startTime = performance.now();
    const duration = 500;

    const updateParticles = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        SceneManager.remove(particles);
        return;
      }

      particles.children.forEach((particle) => {
        particle.position.add(
          particle.userData.velocity.clone().multiplyScalar(0.016)
        );
        particle.userData.velocity.y -= 0.1;

        if (particle.material) {
          particle.material.opacity = 0.8 * (1 - progress);
        }
      });

      requestAnimationFrame(updateParticles);
    };

    updateParticles();
  },
};