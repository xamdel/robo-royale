import * as THREE from 'three';

class ParticlePool {
  constructor(geometry, material, poolSize) {
    this.geometry = geometry;
    this.material = material;
    this.particles = [];
    this.active = new Set();
    this.sceneManager = null;
    this.isPlanePool = geometry instanceof THREE.PlaneGeometry; // Check if this pool uses planes

    // Pre-allocate pool
    for (let i = 0; i < poolSize; i++) {
      const particle = new THREE.Mesh(geometry, material.clone());
      particle.visible = false;
      particle.userData = {
        velocity: new THREE.Vector3(),
        startTime: 0,
        duration: 0,
        isMuzzleFlash: false, // Initialize flag
      };
      this.particles.push(particle);
    }
  }

  setSceneManager(sceneManager) {
    this.sceneManager = sceneManager;
    // Add all particles to scene if they weren't added before
    if (this.sceneManager) {
      this.particles.forEach(particle => {
        if (!particle.parent) {
          this.sceneManager.add(particle);
        }
      });
    }
  }

  acquire(position, velocity, duration) {
    if (this.particles.length === 0) {
      // If pool is empty, try to reclaim oldest active particle
      if (this.active.size > 0) {
        const oldest = Array.from(this.active)[0];
        this.release(oldest);
        this.particles.push(oldest);
      } else {
        return null;
      }
    }

    const particle = this.particles.pop();
    particle.position.copy(position);
    particle.userData.velocity.copy(velocity); // Fixed duplicate line
    particle.userData.startTime = performance.now();
    particle.userData.duration = duration;
    particle.userData.isMuzzleFlash = false; // Reset flag on acquire
    particle.visible = true;
    particle.material.opacity = 1;
    particle.scale.set(1, 1, 1); // Reset scale
    particle.rotation.set(0, 0, 0); // Reset rotation
    this.active.add(particle);
    return particle;
  }

  release(particle) {
    particle.visible = false;
    particle.userData.isMuzzleFlash = false; // Reset flag on release
    this.active.delete(particle);
    this.particles.push(particle);
  }

  update(currentTime, camera) { // Accept camera
    // Need camera for billboarding plane particles
    if (this.isPlanePool && !camera) {
       console.warn('[ParticlePool] Camera required for plane particle update, but not provided.');
       return; // Skip update if camera is needed but not provided
    }

    for (const particle of this.active) {
      const elapsed = currentTime - particle.userData.startTime;
      const progress = elapsed / particle.userData.duration;

      if (progress >= 1) {
        this.release(particle);
        continue;
      }

      // Update position
      particle.position.add(
        particle.userData.velocity.clone().multiplyScalar(0.016) // Assuming 60fps
      );

      // Billboarding for plane particles
      if (this.isPlanePool) {
        particle.quaternion.copy(camera.quaternion);
        // Optional: Add slight random rotation wobble if desired
        // particle.rotation.z += (Math.random() - 0.5) * 0.1;
      }

      // Physics/Movement Logic
      if (particle.material.color.equals(new THREE.Color(0x555555))) { // Smoke check
        particle.userData.velocity.y += 0.03; // Slower upward drift for smoke
      } else if (!particle.userData.isMuzzleFlash) { // Reduced Gravity for non-muzzle-flash, non-smoke
        particle.userData.velocity.y -= 0.02; // Much less gravity
      }
      // Muzzle flash particles (planes or spheres) continue without gravity if isMuzzleFlash is true

      // Fade out
      particle.material.opacity = 1 - progress;
      // Optional: Scale down muzzle flash planes over time
      if (this.isPlanePool && particle.userData.isMuzzleFlash) {
         const scaleProgress = 1 - progress;
         // Ensure initialScale exists before using it
         const initialScale = particle.userData.initialScale || 1;
         particle.scale.set(scaleProgress, scaleProgress, scaleProgress).multiplyScalar(initialScale);
      }
    }
  }
}

export class ParticleEffectSystem {
  constructor() {
    this.initialized = false;

    // Shared geometries - Made smaller
    this.smallSphereGeometry = new THREE.SphereGeometry(0.06, 6, 6); // Smaller impact/gatling
    this.mediumSphereGeometry = new THREE.SphereGeometry(0.15, 6, 6); // Smaller fire
    this.largeSphereGeometry = new THREE.SphereGeometry(0.25, 8, 8); // Smaller smoke
    this.planeGeometry = new THREE.PlaneGeometry(0.3, 0.3); // Smaller muzzle flash

    // Shared materials - Ensured AdditiveBlending for brightness
    this.fireMaterial = new THREE.MeshBasicMaterial({
      color: 0xffcc44, // Slightly brighter yellow/orange
      transparent: true,
      opacity: 1,
      side: THREE.DoubleSide, // Important for planes
      blending: THREE.AdditiveBlending // Make flashes brighter when overlapping
    });
    this.smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0x444444, // Slightly darker smoke
      transparent: true,
      opacity: 0.3 // Less opaque smoke
    });
    this.impactMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffaa, // Brighter yellow impact
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending // Additive blending for impact sparks
    });
    this.dirtMaterial = new THREE.MeshBasicMaterial({ // New material for dirt
        color: 0x5d4037, // Dark brown color
        transparent: true,
        opacity: 0.8 // Slightly less opaque than smoke initially
    });

    // Particle pools - Adjusted sizes
    this.pools = {
      impact: new ParticlePool(this.smallSphereGeometry, this.impactMaterial, 150), // Increased pool size slightly
      fire: new ParticlePool(this.mediumSphereGeometry, this.fireMaterial, 100),
      smoke: new ParticlePool(this.largeSphereGeometry, this.smokeMaterial, 75), // Increased pool size
      smallFire: new ParticlePool(this.smallSphereGeometry, this.fireMaterial, 150), // For explosions, increased pool size
      muzzleFlash: new ParticlePool(this.planeGeometry, this.fireMaterial.clone(), 75), // Use plane geometry, clone material, increased pool size
      dirt: new ParticlePool(this.largeSphereGeometry, this.dirtMaterial, 100) // New pool for dirt impacts
    };

    // Flash effect - Brighter color
    this.flash = new THREE.PointLight(0xffcc66, 6, 8); // Brighter, slightly shorter range
    this.flash.visible = false;
  }

  // Call this method after the scene and camera are ready
  initialize(sceneManager) {
     if (this.initialized) return;
     Object.values(this.pools).forEach(pool => pool.setSceneManager(sceneManager));
     sceneManager.add(this.flash); // Add the point light to the scene
     this.initialized = true;
     console.log('[PARTICLE SYSTEM] Initialized');
  }

  createExplosion(position, color = 0xff4400) {
    if (!this.initialized) return;
    // Use smallFire pool (spheres) - Reduced count, shorter duration, faster velocity
    for (let i = 0; i < 20; i++) { // Fewer particles
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 10, (Math.random() - 0.5) * 12); // Faster
      const particle = this.pools.smallFire.acquire(position, velocity, 500); // Shorter duration
      if (particle) {
        const colorVariation = Math.random() * 0.1 - 0.05; // Less variation
        const colorObj = new THREE.Color(color);
        colorObj.offsetHSL(colorVariation, 0, 0);
        particle.material.color.copy(colorObj);
      }
    }
    // Smoke... - Reduced count, shorter duration
    for (let i = 0; i < 8; i++) { // Fewer smoke particles
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4); // Slightly faster smoke
      this.pools.smoke.acquire(position, velocity, 900); // Shorter duration
    }
    // Flash... - Shorter duration
    this.flash.position.copy(position);
    this.flash.visible = true;
    this.flash.intensity = 10; // More intense flash
    this.flash.color.set(color);
    this.flash.userData = { startTime: performance.now(), duration: 300, baseIntensity: 10 }; // Shorter flash duration, store base intensity
  }

  createPlayerExplosion(position) {
    if (!this.initialized) return;
    const explosionColors = [0xff6600, 0xffaa00, 0xffee00]; // Brighter colors
    // Use fire pool (medium spheres) - Reduced count, shorter duration, faster velocity
    for (let i = 0; i < 30; i++) { // Fewer particles
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 15, Math.random() * 15, (Math.random() - 0.5) * 15); // Faster
      const particle = this.pools.fire.acquire(position, velocity, 1000); // Shorter duration
      if (particle) {
        const color = explosionColors[Math.floor(Math.random() * explosionColors.length)];
        particle.material.color.setHex(color);
        particle.material.blending = THREE.AdditiveBlending; // Ensure additive blending
      }
    }
    // Smoke... - Reduced count, shorter duration
     for (let i = 0; i < 10; i++) { // Fewer smoke particles
      const radius = 0.5 + Math.random() * 2; // Smaller radius
      const angle = Math.random() * Math.PI * 2;
      const pos = position.clone().add(new THREE.Vector3(radius * Math.cos(angle), 0.5 + Math.random() * 1.5, radius * Math.sin(angle))); // Lower start pos
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 4, 1 + Math.random() * 3, (Math.random() - 0.5) * 4); // Slightly faster
      this.pools.smoke.acquire(pos, velocity, 1500); // Shorter duration
    }
    // Flash... - Shorter duration
    this.flash.position.copy(position);
    this.flash.visible = true;
    this.flash.intensity = 12; // More intense flash
    this.flash.color.setHex(0xffaa44); // Player death flash color
    this.flash.userData = { startTime: performance.now(), duration: 400, baseIntensity: 12 }; // Shorter flash duration, store base intensity
  }

  addCollisionEffect(position, color = 0xffffaa) { // Default to brighter yellow
    if (!this.initialized) return;
    // Use impact pool (small spheres) - Reduced count, shorter duration, faster velocity
    for (let i = 0; i < 8; i++) { // Fewer particles
      const velocity = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8 + 1, (Math.random() - 0.5) * 8); // Faster, slight upward bias
      const particle = this.pools.impact.acquire(position, velocity, 350); // Shorter duration
      if (particle) {
        particle.material.color.setHex(color);
        particle.material.blending = THREE.AdditiveBlending; // Ensure additive blending
      }
    }
  }

  // New method for single-particle gatling impact - Faster, shorter duration
  addGatlingImpactEffect(position, color = 0xffffaa) { // Default to brighter yellow
    if (!this.initialized) return;
    // Use impact pool (small spheres)
    // Spawn just one particle with a random velocity
    const velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 10, // Faster velocity spread
      (Math.random() - 0.5) * 10 + 1.5, // Faster, more upward bias
      (Math.random() - 0.5) * 10
    );
    const particle = this.pools.impact.acquire(position, velocity, 250); // Shorter duration
    if (particle) {
      particle.material.color.setHex(color);
      particle.material.blending = THREE.AdditiveBlending; // Ensure additive blending
    }
  }

  addMuzzleFlash(position, direction, color = 0xffcc44, sizeMultiplier = 1.0) { // Added direction, brighter default color
    if (!this.initialized) return;

    const particleCount = Math.round(4 * sizeMultiplier); // Even fewer planes
    const baseSpeed = 8 * sizeMultiplier; // Faster base speed
    const spreadAngle = Math.PI / 8; // Tighter spread (22.5 degrees)

    for (let i = 0; i < particleCount; i++) {
      // Create velocity vector based on direction and spread
      const randomAngle = (Math.random() - 0.5) * spreadAngle;
      const randomAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      // Ensure direction is normalized before applying rotation
      const velocity = direction.clone().normalize().applyAxisAngle(randomAxis, randomAngle).multiplyScalar(baseSpeed * (0.9 + Math.random() * 0.2)); // Faster, less speed variation

      // Use the muzzleFlash pool (planes)
      const particle = this.pools.muzzleFlash.acquire(position, velocity, 60 * sizeMultiplier); // Very short duration flash
      if (particle) {
        particle.userData.isMuzzleFlash = true; // Mark as muzzle flash particle
        particle.material.color.setHex(color);
        particle.material.blending = THREE.AdditiveBlending; // Ensure additive blending

        // Scale particle based on size multiplier, add randomness
        const baseScale = 0.4 * sizeMultiplier; // Adjusted base size for smaller planes
        const randomScale = baseScale * (0.8 + Math.random() * 0.4); // Less size variation
        particle.scale.set(randomScale, randomScale, randomScale);
        particle.userData.initialScale = randomScale; // Store for scaling down

        // Initial random rotation around Z axis (facing direction)
        particle.rotation.z = Math.random() * Math.PI * 2;
      }
    }

    // Point light flash effect - Shorter duration, store base intensity
    this.flash.position.copy(position);
    this.flash.visible = true;
    const baseIntensity = 5 * sizeMultiplier; // Adjusted base intensity
    this.flash.intensity = baseIntensity;
    this.flash.color.setHex(color);
    this.flash.userData = {
      startTime: performance.now(),
      duration: 50 * sizeMultiplier, // Very short light flash
      baseIntensity: baseIntensity // Store base intensity
    };
  }

  addSmoke(position) { // Less frequent, shorter duration smoke puffs
    if (!this.initialized) return;
    const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.8); // Slightly faster drift
    this.pools.smoke.acquire(position, velocity, 200); // Shorter duration
  }

  // New method for dirt impact effect
  createDirtImpact(position) {
    if (!this.initialized) return;
    const particleCount = 25; // Number of dirt particles
    const duration = 2000; // How long particles last (ms)
    const upwardVelocity = 9; // Base upward speed
    const spread = 6; // Horizontal spread speed

    for (let i = 0; i < particleCount; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        Math.random() * upwardVelocity, // Random upward velocity
        (Math.random() - 0.5) * spread
      );
      // Start slightly above the impact point to avoid z-fighting
      const startPos = position.clone().add(new THREE.Vector3(0, 0.1, 0));
      const particle = this.pools.dirt.acquire(startPos, velocity, duration * (0.8 + Math.random() * 0.4)); // Randomize duration slightly
      // Dirt particles will use the default gravity in the pool update logic
    }
  }

  update(camera) { // Accept camera directly
    if (!this.initialized || !camera) {
      // Don't update if not initialized or camera is missing
      return;
    }

    const currentTime = performance.now();

    // Update all particle pools, passing the camera
    Object.values(this.pools).forEach(pool => pool.update(currentTime, camera));

    // Update flash effect
    if (this.flash.visible) {
      const elapsed = currentTime - this.flash.userData.startTime;
      const progress = elapsed / this.flash.userData.duration;

      if (progress >= 1) {
        this.flash.visible = false;
      } else {
         // Fade intensity quadratically for a faster falloff
         const baseIntensity = this.flash.userData.baseIntensity || 4; // Use stored base intensity or default
         this.flash.intensity = baseIntensity * (1 - progress) * (1 - progress);
      }
    }
  }
}

// Singleton instance management
export let particleEffectSystem = null;

export function initParticleEffectSystem(sceneManager) { // Accept sceneManager for initialization
  if (!particleEffectSystem) {
    particleEffectSystem = new ParticleEffectSystem();
    particleEffectSystem.initialize(sceneManager); // Call internal initialize
    window.particleEffectSystem = particleEffectSystem; // Optional: expose globally for debugging
  }
  return particleEffectSystem;
}
