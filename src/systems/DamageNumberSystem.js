import * as THREE from 'three';
import { SceneManager } from '../scene.js'; // Assuming SceneManager provides access to the scene

class DamageNumber {
  constructor(sprite, position, lifespan) {
    this.sprite = sprite;
    this.position = position.clone(); // Store initial position if needed
    this.lifespan = lifespan; // Duration in seconds
    this.age = 0;
    this.initialY = position.y;
    this.floatSpeed = 2.0; // Simple upward speed
  }

  update(deltaTime) {
    this.age += deltaTime;
    const progress = this.age / this.lifespan;

    if (progress >= 1) {
      return false; // Indicate removal
    }

    // --- Simple Upward Movement ---
    this.sprite.position.y = this.initialY + (this.age * this.floatSpeed);

    // --- Fade Out Animation ---
    // Fade uniformly over the lifespan
    this.sprite.material.opacity = 1.0 - progress;

    // Keep scale constant
    // this.sprite.scale remains unchanged

    return true; // Indicate still active
  }
}

export const DamageNumberSystem = {
  activeNumbers: [],
  scene: null,

  init(scene) {
    if (!scene) {
      console.error("DamageNumberSystem requires a THREE.Scene instance.");
      return;
    }
    this.scene = scene;
    this.activeNumbers = [];
    console.log("Damage Number System Initialized.");
    // Make it globally accessible if needed, e.g., for network handlers
    window.damageNumberSystem = this;
  },

  createTextSprite(text, options = {}) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = options.fontSize || 32; // Increased font size
    // Use the HUD font family: 'Orbitron', 'Roboto Mono', monospace
    const font = `${fontSize}px 'Orbitron', 'Roboto Mono', monospace`;
    context.font = font;

    // Fixed size canvas
    canvas.width = 128;
    canvas.height = 64;

    // Configure text style
    context.font = font; // Re-apply font after resize
    context.fillStyle = options.color ? `#${options.color.toString(16).padStart(6, '0')}` : '#ffff00'; // Default yellow
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Add text stroke for better visibility
    context.strokeStyle = '#000000';
    context.lineWidth = 4;
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create sprite material
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false, // Draw on top
      depthWrite: false,
      sizeAttenuation: true // Scale with distance
    });

    // Create and return the sprite
    const sprite = new THREE.Sprite(material);
    // Adjust scale based on canvas aspect ratio and desired world size
    // Base scale set here, animation modifies it later
    sprite.scale.set(1.5, 0.75, 1); // Base scale

    return sprite;
  },

  showDamageNumber(amount, position, options = {}) {
    if (!this.scene) {
      console.error("DamageNumberSystem not initialized with a scene.");
      return;
    }

    const text = amount.toString();
    const sprite = this.createTextSprite(text, options);
    sprite.position.copy(position);

    // Reduce lifespan significantly for quicker disappearance
    const lifespan = options.duration || 0.7; // Default duration 0.7 seconds
    const damageNumber = new DamageNumber(sprite, position, lifespan);

    this.activeNumbers.push(damageNumber);
    this.scene.add(sprite);
  },

  update(deltaTime) {
    if (!this.scene) return;

    for (let i = this.activeNumbers.length - 1; i >= 0; i--) {
      const damageNumber = this.activeNumbers[i];
      const isActive = damageNumber.update(deltaTime);

      if (!isActive) {
        // Remove expired damage number
        this.scene.remove(damageNumber.sprite);
        // Dispose of texture and material to free memory
        if (damageNumber.sprite.material.map) {
            damageNumber.sprite.material.map.dispose();
        }
        damageNumber.sprite.material.dispose();
        this.activeNumbers.splice(i, 1);
      }
    }
  }
};
