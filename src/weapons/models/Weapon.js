import * as THREE from 'three';
import { particleEffectSystem } from '../../systems/ParticleEffectSystem.js';
import { Network } from '../../network.js';
import { SceneManager } from '../../scene.js';

// Remove direct Game import to avoid circular dependency
// We'll use window.Game instead

export class Weapon {
  constructor(type, model, config) {
    this.type = type;
    this.model = model;
    this.config = config;
    this.id = THREE.MathUtils.generateUUID();
    this.ammo = 50; // Default ammo count, could be moved to config
    this.maxAmmo = 50;
    this.projectiles = new Set();
    this.active = true;
  }

  fire(position, direction) {
    console.log(`[WEAPON] ${this.type} fire method called from position`, position.toArray());
    
    if (!this.active) {
      console.log(`[WEAPON] ${this.type} is not active`);
      return false;
    }
    
    if (this.ammo <= 0) {
      console.log(`[WEAPON] ${this.type} is out of ammo`);
      if (window.HUD) {
        window.HUD.showAlert("OUT OF AMMO", "warning");
      }
      return false;
    }

    // Create spawn position offset in front of the weapon
    const spawnOffset = 1.5;
    const spawnPosition = position.clone().add(direction.clone().multiplyScalar(spawnOffset));
    console.log(`[WEAPON] ${this.type} spawning projectile at`, spawnPosition.toArray());

    // Always create projectile for visual representation
    const projectile = this.createProjectile(spawnPosition, direction);
    console.log(`[WEAPON] ${this.type} created projectile`, projectile);

    // Only send to server and manage ammo for local player weapons
    if (this.isLocalPlayerWeapon()) {
      console.log(`[WEAPON] ${this.type} confirmed as local player weapon`);
      
      // Send shot data to server
      console.log(`[WEAPON] ${this.type} sending shot data to server, weapon ID: ${this.id}`);
      Network.sendShot({
        weaponId: this.id,
        type: this.type,
        position: spawnPosition,
        direction: direction,
      });

      // Decrease ammo
      this.ammo--;
      console.log(`[WEAPON] ${this.type} ammo decreased to ${this.ammo}`);
      if (window.HUD) {
        window.HUD.updateAmmo(this.ammo);
      }
    }

    // Create effects for all projectiles
    this.createFireEffects(spawnPosition);

    return true;
  }

  createProjectile(position, direction) {
    const projectileConfig = this.config.projectileConfig;
    let projectile;
    
    // Special case for rocket-type projectiles
    if (this.config.projectileType === 'rocket') {
      // Create a rocket-shaped projectile
      const rocketLength = 0.8;
      const rocketRadius = 0.15;
      
      // Create rocket body (cylinder) - oriented along Z axis for forward direction
      const bodyGeometry = new THREE.CylinderGeometry(rocketRadius, rocketRadius, rocketLength, 8);
      bodyGeometry.rotateX(Math.PI / 2); // Rotate geometry to align with forward direction
      const bodyMaterial = new THREE.MeshBasicMaterial({ color: projectileConfig.color });
      projectile = new THREE.Mesh(bodyGeometry, bodyMaterial);
      
      // Create rocket nose cone
      const noseGeometry = new THREE.ConeGeometry(rocketRadius, rocketLength * 0.4, 8);
      noseGeometry.rotateX(Math.PI / 2);
      const noseMaterial = new THREE.MeshBasicMaterial({ color: projectileConfig.color });
      const noseCone = new THREE.Mesh(noseGeometry, noseMaterial);
      noseCone.position.z = rocketLength * 0.7; // Position at front
      projectile.add(noseCone);
      
      // Create rocket fins (simple planes)
      const finMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xcccccc, 
        side: THREE.DoubleSide 
      });
      
      // Add 4 fins around the rocket
      for (let i = 0; i < 4; i++) {
        const finGeometry = new THREE.PlaneGeometry(rocketRadius * 2, rocketRadius * 2);
        const fin = new THREE.Mesh(finGeometry, finMaterial);
        fin.position.z = -rocketLength * 0.4; // Position at back
        fin.rotation.y = Math.PI / 4 + (i * Math.PI / 2); // Position around cylinder
        projectile.add(fin);
      }
      
      // Create a large initial flame effect at the back of the rocket (visual only)
      const flameGeometry = new THREE.ConeGeometry(rocketRadius * 1.2, rocketLength * 1.0, 8);
      flameGeometry.rotateX(-Math.PI / 2);
      const flameMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff5500,
        transparent: true,
        opacity: 0.9,
        emissive: 0xff3300,
        emissiveIntensity: 1.0
      });
      const flame = new THREE.Mesh(flameGeometry, flameMaterial);
      flame.position.z = -rocketLength * 0.8; // Position at back
      projectile.add(flame);
      
    } else {
      // Default to sphere for other projectile types
      const geometry = new THREE.SphereGeometry(projectileConfig.radius, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color: projectileConfig.color });
      projectile = new THREE.Mesh(geometry, material);
    }
    
    projectile.position.copy(position);
    
    // All projectiles use their configured speed immediately
    projectile.velocity = direction.clone().multiplyScalar(projectileConfig.speed);
    
    projectile.startPosition = position.clone();
    projectile.prevPosition = position.clone();
    projectile.maxDistance = projectileConfig.maxDistance;
    projectile.sourceWeapon = this;
    
    // Add userData for tracking
    projectile.userData = projectile.userData || {};
    
    // Set up the rocket to always face its direction of travel
    if (this.config.projectileType === 'rocket') {
        projectile.lookAt(position.clone().add(direction));
        
        projectile.isRocket = true;
        projectile.initialFlare = true; // Flag for initial flare effect
        projectile.flareEndTime = performance.now() + 150; // Flare lasts for 150ms
        
        // Scale up initial flame effect
        const flameElement = projectile.children.find(child => 
          child.material && child.material.color.getHex() === 0xff5500);
        if (flameElement) {
          flameElement.scale.set(3.0, 3.0, 3.0);
        }
      }
    
    this.projectiles.add(projectile);
    // Add projectile to scene so it can be rendered
    SceneManager.add(projectile);
    return projectile;
  }

  createFireEffects(position) {
    if (this.config.effects) {
      if (this.config.effects.muzzleFlash) {
        particleEffectSystem.addMuzzleFlash(position, this.config.projectileConfig.color);
        
        // Add larger muzzle flash for rocket launcher
        if (this.config.projectileType === 'rocket') {
          // Create intense launch effect for rocket
          if (particleEffectSystem) {
            // Add a big initial flash
            particleEffectSystem.addMuzzleFlash(position, 0xff5500, 3.0); // Bigger flash
            
            // Create staggered smaller flashes for lingering effect
            for (let i = 1; i < 4; i++) {
              setTimeout(() => {
                if (particleEffectSystem) {
                  particleEffectSystem.addMuzzleFlash(position, 0xff5500, 2.0 - (i * 0.5));
                }
              }, i * 40); // Stagger the flashes
            }
          }
        }
      }
      
      // We've removed smoke effects since they didn't look good
    }
  }

  update(deltaTime) {
    // Update projectiles
    for (const projectile of this.projectiles) {
      // Store previous position for collision detection
      projectile.prevPosition.copy(projectile.position);
      
      // Update position
      projectile.position.addScaledVector(projectile.velocity, deltaTime);
      
      // If it's a rocket, handle flare effects and orientation
      if (projectile.isRocket) {
        // Handle initial flare effect timing
        const currentTime = performance.now();
        if (projectile.initialFlare && currentTime > projectile.flareEndTime) {
          projectile.initialFlare = false;
          // Hide large flame after initial flare
          if (projectile.children.length > 0) {
            const flame = projectile.children.find(child => 
              child.material && (child.material.color.getHex() === 0xff5500 || child.material.color.getHex() === 0xff7700));
            if (flame) {
              flame.visible = false;
            }
          }
        }
        
        // Make rocket always face its direction of travel
        if (projectile.velocity.lengthSq() > 0.00001) {
          const lookAtPos = projectile.position.clone().add(projectile.velocity.clone().normalize());
          projectile.lookAt(lookAtPos);
        }
      }
      
      // Check if projectile has exceeded max distance
      const distanceTraveled = projectile.position.distanceTo(projectile.startPosition);
      if (distanceTraveled > projectile.maxDistance) {
        this.removeProjectile(projectile);
      }
    }
  }

  removeProjectile(projectile) {
    this.projectiles.delete(projectile);
    // Remove from scene
    SceneManager.remove(projectile);
  }

  handleHit(position) {
    // Create hit effects
    particleEffectSystem.addCollisionEffect(position, this.config.projectileConfig.color);
  }

  isLocalPlayerWeapon() {
    // Check if this weapon is attached to the local player
    if (!window.Game || !window.Game.player) {
      console.log(`[WEAPON] ${this.type} cannot check if local player weapon - Game.player not available`);
      return false;
    }
    
    // Traverse up the object hierarchy to find if this is connected to the player
    let currentObj = this.model;
    let depth = 0;
    const maxDepth = 10; // Prevent infinite loops
    
    while (currentObj && depth < maxDepth) {
      // Check multiple ways to identify if this is the player model
      if (
        currentObj === window.Game.player || 
        currentObj.isPlayerModel === true ||
        (currentObj.userData && currentObj.userData.id === window.Game.player.userData?.id) ||
        (currentObj.name === "PlayerMech" && currentObj.type === "Group")
      ) {
        console.log(`[WEAPON] ${this.type} is attached to local player (found at depth ${depth})`);
        return true;
      }
      
      // Move up the hierarchy
      currentObj = currentObj.parent;
      depth++;
    }
    
    // Log detailed debug info
    console.log(`[WEAPON] ${this.type} is NOT attached to local player:`, {
      weaponModelName: this.model.name,
      playerName: window.Game.player.name || 'unnamed',
      searchDepth: depth,
      playerModelId: window.Game.player.userData?.id || 'unknown',
      weaponParentChain: this.getParentChain(this.model, 5)
    });
    
    // TEMPORARY FIX: Force weapons to be recognized as local player weapons
    // until the hierarchy issue is resolved
    console.log(`[WEAPON] ${this.type} - TEMPORARY FIX: Forcing recognition as local player weapon`);
    return true;
  }
  
  // Helper method to get a parent chain for debugging
  getParentChain(obj, maxDepth = 5) {
    const chain = [];
    let current = obj;
    let depth = 0;
    
    while (current && depth < maxDepth) {
      chain.push({
        name: current.name || 'unnamed',
        type: current.type,
        isPlayer: current === window.Game.player
      });
      current = current.parent;
      depth++;
    }
    
    return chain;
  }

  handleAmmoUpdate(ammo) {
    this.ammo = ammo;
    if (window.HUD && window.Game && window.Game.player && this.isLocalPlayerWeapon()) {
      window.HUD.updateAmmo(ammo);
    }
  }

  deactivate() {
    this.active = false;
    // Clean up projectiles
    for (const projectile of this.projectiles) {
      this.removeProjectile(projectile);
    }
  }
}
