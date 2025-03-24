import * as THREE from 'three';
import { SceneManager } from '../scene.js';

class ParticlePool {
  constructor(geometry, material, poolSize) {
    this.geometry = geometry;
    this.material = material;
    this.particles = [];
    this.active = new Set();

    // Pre-allocate pool
    for (let i = 0; i < poolSize; i++) {
      const particle = new THREE.Mesh(geometry, material.clone());
      particle.visible = false;
      particle.userData = {
        velocity: new THREE.Vector3(),
        startTime: 0,
        duration: 0,
      };
      this.particles.push(particle);
      SceneManager.add(particle);
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
    particle.userData.velocity.copy(velocity);
    particle.userData.startTime = performance.now();
    particle.userData.duration = duration;
    particle.visible = true;
    particle.material.opacity = 1;
    this.active.add(particle);
    return particle;
  }

  release(particle) {
    particle.visible = false;
    this.active.delete(particle);
    this.particles.push(particle);
  }

  update(currentTime) {
    for (const particle of this.active) {
      const elapsed = currentTime - particle.userData.startTime;
      const progress = elapsed / particle.userData.duration;

      if (progress >= 1) {
        this.release(particle);
        continue;
      }

      // Update position
      particle.position.add(
        particle.userData.velocity.clone().multiplyScalar(0.016)
      );
      
      // Apply gravity
      particle.userData.velocity.y -= 0.1;

      // Fade out
      particle.material.opacity = 1 - progress;
    }
  }
}

export class ParticleEffectSystem {
  constructor() {
    // Shared geometries
    this.smallGeometry = new THREE.SphereGeometry(0.1, 8, 8);
    this.mediumGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    this.largeGeometry = new THREE.SphereGeometry(0.5, 8, 8);

    // Shared materials
    this.fireMaterial = new THREE.MeshBasicMaterial({
      color: 0xff4400,
      transparent: true,
      opacity: 1
    });
    this.smokeMaterial = new THREE.MeshBasicMaterial({
      color: 0x555555,
      transparent: true,
      opacity: 0.4
    });
    this.impactMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00,
      transparent: true,
      opacity: 1
    });

    // Particle pools
    this.pools = {
      impact: new ParticlePool(this.smallGeometry, this.impactMaterial, 100),
      fire: new ParticlePool(this.mediumGeometry, this.fireMaterial, 100),
      smoke: new ParticlePool(this.largeGeometry, this.smokeMaterial, 50),
      smallFire: new ParticlePool(this.smallGeometry, this.fireMaterial, 100) // Added new pool for smaller fire particles
    };

    // Flash effect
    this.flash = new THREE.PointLight(0xff8800, 5, 10);
    this.flash.visible = false;
    SceneManager.add(this.flash);
  }

  createExplosion(position, color = 0xff4400) {
    // Fire particles (use small fire pool for smaller particles)
    for (let i = 0; i < 20; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 5,
        (Math.random() - 0.5) * 5
      );
      this.pools.smallFire.acquire(position, velocity, 500);
    }

    // Flash effect
    this.flash.position.copy(position);
    this.flash.visible = true;
    this.flash.intensity = 5;
    this.flash.userData = {
      startTime: performance.now(),
      duration: 300
    };
  }

  createPlayerExplosion(position) {
    // Fire colors
    const explosionColors = [0xff4400, 0xff8800, 0xffcc00];

    for (let i = 0; i < 40; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        Math.random() * 10,
        (Math.random() - 0.5) * 10
      );
      const particle = this.pools.fire.acquire(position, velocity, 1500);
      if (particle) {
        // Random color from explosionColors array
        const color = explosionColors[Math.floor(Math.random() * explosionColors.length)];
        particle.material.color.setHex(color);
      }
    }

    for (let i = 0; i < 15; i++) {
      const radius = 1 + Math.random() * 3;
      const angle = Math.random() * Math.PI * 2;
      const pos = position.clone().add(
        new THREE.Vector3(
          radius * Math.cos(angle),
          1 + Math.random() * 2,
          radius * Math.sin(angle)
        )
      );
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        2 + Math.random() * 4,
        (Math.random() - 0.5) * 3
      );
      this.pools.smoke.acquire(pos, velocity, 2000);
    }

    this.flash.position.copy(position);
    this.flash.visible = true;
    this.flash.intensity = 8;
    this.flash.userData = {
      startTime: performance.now(),
      duration: 500
    };
  }

  addCollisionEffect(position, color = 0xffff00) {
    for (let i = 0; i < 15; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 5,
        (Math.random() - 0.5) * 5
      );
      const particle = this.pools.impact.acquire(position, velocity, 500);
      if (particle) {
        particle.material.color.setHex(color);
      }
    }
  }

  addMuzzleFlash(position, color = 0xff4400) {
    // Create small fire particles for muzzle flash
    for (let i = 0; i < 10; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 3,
        Math.random() * 2,
        (Math.random() - 0.5) * 3
      );
      const particle = this.pools.smallFire.acquire(position, velocity, 300);
      if (particle) {
        particle.material.color.setHex(color);
      }
    }

    // Add flash effect
    this.flash.position.copy(position);
    this.flash.visible = true;
    this.flash.intensity = 3;
    this.flash.userData = {
      startTime: performance.now(),
      duration: 150
    };
  }

  addSmoke(position) {
    // Create smoke particles
    for (let i = 0; i < 5; i++) {
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        0.5 + Math.random() * 1.5,
        (Math.random() - 0.5) * 2
      );
      this.pools.smoke.acquire(position, velocity, 1000);
    }
  }

  update() {
    const currentTime = performance.now();

    // Update all particle pools
    Object.values(this.pools).forEach(pool => pool.update(currentTime));

    // Update flash effect
    if (this.flash.visible) {
      const elapsed = currentTime - this.flash.userData.startTime;
      const progress = elapsed / this.flash.userData.duration;

      if (progress >= 1) {
        this.flash.visible = false;
      } else {
        this.flash.intensity = this.flash.intensity * (1 - progress);
      }
    }
  }
}

// Export singleton instance
export const particleEffectSystem = new ParticleEffectSystem();

// Make the particle system globally available
window.particleEffectSystem = particleEffectSystem;
