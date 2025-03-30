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
    this.naturalSide = config.naturalSide; // Added naturalSide from config
    this.ammo = config.ammo || 50; // Use config ammo, fallback to 50
    this.maxAmmo = config.maxAmmo || 50; // Use config max ammo, fallback to 50
    this.projectiles = new Set();
    this.active = true;
    this.shotCounter = 0; // Initialize shot counter

    // Gatling specific state
    this.firingState = 'idle'; // 'idle', 'spinningUp', 'firing', 'spinningDown'
    this.spinUpTimeout = null;
    this.lastFireTime = 0; // For controlling fire rate while in 'firing' state
    this.mountPoint = null; // Reference to the mount point this weapon is attached to

    // Audio instances (placeholders, assuming an AudioManager exists)
    this.spinUpAudio = null;
    this.fireLoopAudio = null;
    this.spinDownAudio = null; // Track this to prevent overlap

    // Preload sounds (AudioManager expects just the filename)
    if (this.config.effects?.spinUpSound && window.AudioManager) {
        window.AudioManager.loadSound(this.config.effects.spinUpSound);
    }
    if (this.config.effects?.sound && window.AudioManager) {
        window.AudioManager.loadSound(this.config.effects.sound); // Main fire sound
    }
    if (this.config.effects?.spinDownSound && window.AudioManager) {
        window.AudioManager.loadSound(this.config.effects.spinDownSound);
    }
  }

  // --- Firing Sequence Logic (Gatling) ---

  startFiringSequence() {
    if (this.type !== 'gatling' || !this.active || this.firingState === 'firing' || this.firingState === 'spinningUp') {
        return; // Only for active gatling, and not already starting/firing
    }

    // console.log(`[WEAPON] ${this.type} starting firing sequence.`);
    this.firingState = 'spinningUp';

    // Stop any lingering spin-down sound
    if (this.spinDownAudio && window.AudioManager) {
        window.AudioManager.stopSound(this.spinDownAudio);
        this.spinDownAudio = null;
    }
    // Stop any potentially stuck fire loop sound (safety)
    if (this.fireLoopAudio && window.AudioManager) {
        window.AudioManager.stopSound(this.fireLoopAudio);
        this.fireLoopAudio = null;
    }


    // Play spin-up sound (AudioManager expects just the filename)
    if (this.config.effects?.spinUpSound && window.AudioManager) {
        this.spinUpAudio = window.AudioManager.playEffect(this.config.effects.spinUpSound, this.model);
    }

    // Set timeout for the fire delay
    const delay = (this.config.fireDelay || 0) * 1000; // ms
    clearTimeout(this.spinUpTimeout); // Clear any previous timeout
    this.spinUpTimeout = setTimeout(() => {
        if (this.firingState === 'spinningUp') { // Ensure we weren't stopped during spin-up
            // console.log(`[WEAPON] ${this.type} finished spin-up, entering firing state.`);
            this.firingState = 'firing';
            this.lastFireTime = 0; // Reset fire timer for immediate first shot

            // Stop spin-up sound (it should finish naturally, but just in case)
            if (this.spinUpAudio && window.AudioManager) {
                 window.AudioManager.stopSound(this.spinUpAudio); // Stop explicitly if needed
                 this.spinUpAudio = null;
            }

            // Start fire loop sound (AudioManager expects just the filename)
            if (this.config.effects?.sound && window.AudioManager) {
                this.fireLoopAudio = window.AudioManager.playLoop(this.config.effects.sound, this.model);
            }
        }
    }, delay);
  }

  stopFiringSequence() {
    if (this.type !== 'gatling' || this.firingState === 'idle' || this.firingState === 'spinningDown') {
        return; // Only stop if it was trying to fire or firing
    }

    // console.log(`[WEAPON] ${this.type} stopping firing sequence. Current state: ${this.firingState}`);

    const previousState = this.firingState;
    this.firingState = 'spinningDown'; // Intermediate state before idle

    // Clear the spin-up timeout if it's still pending
    clearTimeout(this.spinUpTimeout);
    this.spinUpTimeout = null;

    // Stop spin-up sound if it's playing
    if (this.spinUpAudio && window.AudioManager) {
        window.AudioManager.stopSound(this.spinUpAudio);
        this.spinUpAudio = null;
    }

    // Stop the firing loop sound
    if (this.fireLoopAudio && window.AudioManager) {
        window.AudioManager.stopSound(this.fireLoopAudio);
        this.fireLoopAudio = null;
    }

    // Play spin-down sound only if it was actually firing or spinning up (AudioManager expects just the filename)
    if ((previousState === 'firing' || previousState === 'spinningUp') && this.config.effects?.spinDownSound && window.AudioManager) {
         // Stop any previous spindown sound first to prevent overlap if released/pressed quickly
         if (this.spinDownAudio && window.AudioManager) {
            window.AudioManager.stopSound(this.spinDownAudio);
         }
        this.spinDownAudio = window.AudioManager.playEffect(this.config.effects.spinDownSound, this.model);
        // Add a slight delay before setting back to idle to let spindown play a bit
        setTimeout(() => {
            if (this.firingState === 'spinningDown') { // Check if state hasn't changed again
                 this.firingState = 'idle';
                //  console.log(`[WEAPON] ${this.type} returned to idle state after spin-down.`);
            }
        }, 100); // Adjust delay as needed
    } else {
        // If stopped before firing started, go directly to idle
        this.firingState = 'idle';
        // console.log(`[WEAPON] ${this.type} returned to idle state (stopped before firing).`);
    }
  }

  // Actual single shot logic
  fire(position, direction) {
    // console.log(`[WEAPON] ${this.type} fire method called from position`, position.toArray());
    
    if (!this.active) {
      console.log(`[WEAPON] ${this.type} is not active`);
      return false;
    }
    
    if (this.ammo <= 0) {
      // console.log(`[WEAPON] ${this.type} is out of ammo`);
      if (window.HUD) {
        window.HUD.showAlert("OUT OF AMMO", "warning");
      }
      return false;
    }

    // Increment shot counter for Gatling before creating projectile
    if (this.type === 'gatling') {
        this.shotCounter++;
    }

    // Create spawn position offset in front of the weapon
    const spawnOffset = 1.5;
    const spawnPosition = position.clone().add(direction.clone().multiplyScalar(spawnOffset));
    // console.log(`[WEAPON] ${this.type} spawning projectile at`, spawnPosition.toArray());

    // Always create projectile for visual representation
    const projectile = this.createProjectile(spawnPosition, direction);
    // console.log(`[WEAPON] ${this.type} created projectile`, projectile);

    // Only send to server and manage ammo for local player weapons
    if (this.isLocalPlayerWeapon()) {
      // console.log(`[WEAPON] ${this.type} confirmed as local player weapon`);
      
      // Send shot data to server
      // console.log(`[WEAPON] ${this.type} sending shot data to server, weapon ID: ${this.id}`);
      Network.sendShot({
        weaponId: this.id,
        type: this.type,
        position: spawnPosition,
        direction: direction,
      });

      // Decrease ammo
      this.ammo--;
      // console.log(`[WEAPON] ${this.type} ammo decreased to ${this.ammo}`);
      // HUD update moved to MountPoint.fire
    }

    // Create effects for this single shot
    this.createFireEffects(spawnPosition, direction);

    return true; // Indicate a shot was attempted/processed
  }

  createProjectile(position, direction) {
    const projectileConfig = this.config.projectileConfig;
    let projectile = null; // Initialize as null

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

    } else if (this.type === 'gatling') {
        // Gatling: Only create a visual for tracer rounds (e.g., every 3rd shot)
        const tracerFrequency = 3; // Decreased frequency (more tracers)
        if (this.shotCounter % tracerFrequency === 0) {
            const tracerLength = 3.0; // Increased length of the tracer line
            const tracerRadius = 0.03; // Thin radius
            const geometry = new THREE.CylinderGeometry(tracerRadius, tracerRadius, tracerLength, 6);
            // Rotate geometry to align with Z-axis forward as standard
            geometry.rotateX(Math.PI / 2);
            const material = new THREE.MeshBasicMaterial({
                color: projectileConfig.color,
                emissive: projectileConfig.color, // Make it glow
                emissiveIntensity: 2.0
            });
            projectile = new THREE.Mesh(geometry, material);
            // Manually set rotation to align the cylinder (local Z) with the direction vector
            const quaternion = new THREE.Quaternion();
            // Assuming Z is forward for the cylinder after rotateX
            const cylinderForward = new THREE.Vector3(0, 0, 1); 
            quaternion.setFromUnitVectors(cylinderForward, direction.clone().normalize());
            projectile.quaternion.copy(quaternion);
        } else {
            // Not a tracer round, don't create a visual mesh
            // We still need a logical projectile object for tracking, just without geometry/material
            projectile = new THREE.Object3D(); // Use a simple Object3D for tracking
        }
    } else {
      // Default to sphere for other projectile types
      const geometry = new THREE.SphereGeometry(projectileConfig.radius, 8, 8);
      const material = new THREE.MeshBasicMaterial({ color: projectileConfig.color });
      projectile = new THREE.Mesh(geometry, material);
    }

    // If a visual mesh was created, add it to the scene
    if (projectile && projectile.isMesh) {
        SceneManager.add(projectile);
    } else if (!projectile) {
        // If projectile is still null (e.g., error in logic), create a basic Object3D
        // to prevent downstream errors, though this shouldn't happen with the current logic.
        console.warn(`[WEAPON] Failed to create projectile visual for type ${this.type}. Creating basic Object3D.`);
        projectile = new THREE.Object3D();
    }

    // Common projectile properties (apply to both visual and non-visual projectiles)
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
    // } <-- This closing brace was incorrect and is removed.

    this.projectiles.add(projectile);
    // SceneManager.add(projectile); // Moved this up to only add visual meshes

    return projectile;
  }

  createFireEffects(position, direction) { // Added direction parameter
    if (this.config.effects) {
      if (this.config.effects.muzzleFlash && particleEffectSystem) { // Check particleEffectSystem exists
        // Pass direction to muzzle flash
        particleEffectSystem.addMuzzleFlash(position, direction, this.config.projectileConfig.color);
        
        // Add larger muzzle flash for rocket launcher
        if (this.config.projectileType === 'rocket') {
          // Create intense launch effect for rocket
          // Add larger muzzle flash for rocket launcher
          if (this.config.projectileType === 'rocket') {
            // Create intense launch effect for rocket
            // Add a big initial flash (passing direction)
            particleEffectSystem.addMuzzleFlash(position, direction, 0xff5500, 3.0); // Bigger flash
            
            // Create staggered smaller flashes for lingering effect
            for (let i = 1; i < 4; i++) {
              setTimeout(() => {
                // Pass direction to staggered flashes
                if (particleEffectSystem) {
                  particleEffectSystem.addMuzzleFlash(position, direction, 0xff5500, 2.0 - (i * 0.5));
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
    } // End of projectile update loop

    // Gatling: Check fire rate within the update loop if in 'firing' state
    // Moved OUTSIDE the projectile loop
    if (this.type === 'gatling' && this.firingState === 'firing') {
        // console.log(`[WEAPON UPDATE] Gatling in firing state. Ammo: ${this.ammo}`); // Debug log
        const now = performance.now();
        const fireInterval = 1000 / this.config.fireRate; // ms between shots

        if (now - this.lastFireTime >= fireInterval) {
            // console.log(`[WEAPON UPDATE] Gatling fire interval met.`); // Debug log
            if (this.ammo > 0) {
                if (!this.model) {
                     console.error(`[WEAPON UPDATE] Gatling cannot fire: Weapon model is missing.`);
                     this.stopFiringSequence(); // Stop if model is gone
                      return; // Exit update for this frame if model is missing
                 }
                 // Get current position and direction FROM THE MOUNT POINT, not the weapon model
                 let firePos, fireDir;

                 // Use mount point's position/direction if available
                 if (this.mountPoint) {
                     firePos = this.mountPoint.getWorldPosition();
                     fireDir = this.mountPoint.getWorldDirection();
                     // console.log(`[WEAPON UPDATE] Gatling using mount point. Pos: ${firePos.toArray().map(n=>n.toFixed(2))}, Dir: ${fireDir.toArray().map(n=>n.toFixed(2))}`);
                 } else {
                     // Fallback to model's position/direction (should not happen ideally)
                     console.warn(`[WEAPON UPDATE] Gatling ${this.id} firing without mountPoint reference! Falling back to model position.`);
                     firePos = this.model.getWorldPosition(new THREE.Vector3());
                     fireDir = this.model.getWorldDirection(new THREE.Vector3());
                 }

                 // Call the actual single-shot fire method
                // console.log(`[WEAPON UPDATE] Gatling attempting fire. Pos: ${firePos.toArray().map(n=>n.toFixed(2))}, Dir: ${fireDir.toArray().map(n=>n.toFixed(2))}`); // Verbose log
                const fireSuccess = this.fire(firePos, fireDir); // This handles ammo decrement, network, effects
                // console.log(`[WEAPON UPDATE] Gatling fire attempt result: ${fireSuccess}`); // Debug log
                if (fireSuccess) { // Only update lastFireTime if fire was successful
                    this.lastFireTime = now;
                } else {
                    // If fire failed (e.g., somehow became inactive or out of ammo between checks), stop sequence
                    // console.log(`[WEAPON UPDATE] Gatling fire call failed (returned ${fireSuccess}), stopping sequence.`);
                    this.stopFiringSequence();
                }
            } else {
                // Out of ammo while firing
                // console.log(`[WEAPON UPDATE] ${this.type} ran out of ammo during firing sequence.`);
                this.stopFiringSequence(); // Stop the sequence
                if (window.HUD) {
                    window.HUD.showAlert("OUT OF AMMO", "warning");
                }
            }
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
      // console.log(`[WEAPON] ${this.type} cannot check if local player weapon - Game.player not available`);
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
        // console.log(`[WEAPON] ${this.type} is attached to local player (found at depth ${depth})`);
        return true;
      }
      
      // Move up the hierarchy
      currentObj = currentObj.parent;
      depth++;
    }
    
    // Log detailed debug info
    // console.log(`[WEAPON] ${this.type} is NOT attached to local player:`, {
    //   weaponModelName: this.model.name,
    //   playerName: window.Game.player.name || 'unnamed',
    //   searchDepth: depth,
    //   playerModelId: window.Game.player.userData?.id || 'unknown',
    //   weaponParentChain: this.getParentChain(this.model, 5)
    // });
    
    // TEMPORARY FIX: Force weapons to be recognized as local player weapons
    // until the hierarchy issue is resolved
    // console.log(`[WEAPON] ${this.type} - TEMPORARY FIX: Forcing recognition as local player weapon`);
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
    // Update HUD if this is a local player weapon
    if (window.HUD && window.Game && window.Game.player && this.isLocalPlayerWeapon()) {
      // Find the mount point this weapon is attached to
      // Ensure weaponSystem and mountManager are available globally or accessible
      // Assuming weaponSystem is globally available as window.weaponSystem
      const mountPoint = window.weaponSystem?.mountManager?.getAllMounts().find(m => m.getWeapon() === this);
      if (mountPoint && window.HUD.updateWeaponDisplay) {
        // Call the correct HUD update function with the mount type
        window.HUD.updateWeaponDisplay(mountPoint.config.mountType);
      } else {
        console.warn(`[Weapon] Could not update HUD ammo display for weapon ${this.id} via network update. Mount point not found or HUD function missing.`);
        // Fallback: Try updating both displays if the specific mount isn't found
        // This might happen if the update arrives during a weapon swap or detachment
        if (window.HUD.updateWeaponDisplay) {
          console.warn(`[Weapon] Falling back to updating both primary and secondary HUD sections.`);
          window.HUD.updateWeaponDisplay('primary');
          window.HUD.updateWeaponDisplay('secondary');
        }
      }
    }
  }

  deactivate() {
    this.active = false;

    // Stop any firing sequence and sounds
    if (this.type === 'gatling') {
        this.stopFiringSequence(); // Ensure sounds stop and state resets
        // Explicitly stop any potentially lingering sounds
        if (this.spinUpAudio && window.AudioManager) window.AudioManager.stopSound(this.spinUpAudio);
        if (this.fireLoopAudio && window.AudioManager) window.AudioManager.stopSound(this.fireLoopAudio);
        if (this.spinDownAudio && window.AudioManager) window.AudioManager.stopSound(this.spinDownAudio);
        this.spinUpAudio = null;
        this.fireLoopAudio = null;
        this.spinDownAudio = null;
        clearTimeout(this.spinUpTimeout);
        this.spinUpTimeout = null;
        this.firingState = 'idle';
    }


    // Clean up projectiles
    for (const projectile of this.projectiles) {
      this.removeProjectile(projectile);
    }
  }
}
