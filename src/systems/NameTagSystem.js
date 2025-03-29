import * as THREE from 'three';
import { SceneManager } from '../scene.js'; // Import SceneManager

export const NameTagSystem = {
  tags: new Map(), // playerId -> nameTagSprite

  init() {
    // Initialization logic if needed
  },

  createNameTagSprite(playerName, color = '#00aaff') {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = 256;
    canvas.height = 64;

    context.font = '32px "Orbitron", "Roboto Mono", monospace';

    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    const isValidColor = ctx.fillStyle !== '#000000';
    color = isValidColor ? color : '#00aaff';

    context.fillStyle = color;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = 'rgba(0, 0, 0, 0.7)';
    context.shadowBlur = 2;
    context.shadowOffsetX = 1;
    context.shadowOffsetY = 1;

    context.clearRect(0, 0, canvas.width, canvas.height);

    context.strokeStyle = '#000000'; // Black outline
    context.lineWidth = 4; // Outline thickness
    context.strokeText(playerName, canvas.width / 2, canvas.height / 2);
    context.fillText(playerName, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
    const sprite = new THREE.Sprite(material);

    sprite.scale.set(1, 0.25, 1);
    sprite.renderOrder = 999;
    return sprite;
  },

  addTag(playerId, playerName) {
    const sprite = this.createNameTagSprite(playerName, '#00aaff');
    this.tags.set(playerId, sprite);
    SceneManager.add(sprite);
  },

  updateTagPosition(playerId, playerMesh) {
    const sprite = this.tags.get(playerId);
    if (sprite) {
      const worldPos = new THREE.Vector3();
      playerMesh.getWorldPosition(worldPos);
      // CORRECTED: Calculate offset position correctly
      const tagPosition = worldPos.clone(); 
      tagPosition.y += 3.5; // Reduced Y offset
      sprite.position.copy(tagPosition); // Copy the full Vector3
    }
  },

  removeTag(playerId) {
    const sprite = this.tags.get(playerId);
    if (sprite) {
      SceneManager.remove(sprite);
      this.tags.delete(playerId);
    }
  },
};
