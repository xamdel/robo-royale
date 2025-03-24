import * as THREE from 'three';
import { Game } from '../game.js';

export class WeaponOrientationDebugger {
  constructor() {
    this.active = false;
    this.targetWeapon = null;
    this.originalRotation = new THREE.Euler();
    this.adjustmentValues = {
      x: 0,
      y: 0,
      z: 0
    };
    this.adjustmentStep = Math.PI / 24; // 7.5 degrees
    
    this.createUI();
    this.setupKeyControls();
  }
  
  createUI() {
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    container.style.color = 'white';
    container.style.padding = '10px';
    container.style.borderRadius = '5px';
    container.style.display = 'none';
    container.style.zIndex = '1000';
    container.id = 'weapon-debug-ui';
    
    container.innerHTML = `
      <h3>Weapon Orientation Debugger</h3>
      <div>
        <p>Current Rotation (radians):</p>
        <p>X: <span id="rot-x">0</span> (Keys: Q/A)</p>
        <p>Y: <span id="rot-y">0</span> (Keys: W/S)</p>
        <p>Z: <span id="rot-z">0</span> (Keys: E/D)</p>
      </div>
      <div>
        <p>Press SHIFT+1-4 to select weapon in mount slots</p>
        <p>Press SHIFT+0 to toggle this UI</p>
        <p>Press SHIFT+R to reset rotation</p>
        <p>Press SHIFT+P to print current values to console</p>
      </div>
      <div id="selected-weapon-info">No weapon selected</div>
    `;
    
    document.body.appendChild(container);
    this.uiContainer = container;
  }
  
  setupKeyControls() {
    window.addEventListener('keydown', (e) => {
      // Only process if Shift is held
      if (!e.shiftKey) return;
      
      // Prevent default to stop potential input conflicts
      e.preventDefault();
      e.stopPropagation();
      
      // Toggle UI with Shift+0
      if (e.key === '0') {
        this.toggleUI();
        return;
      }
      
      if (!this.active) return;
      
      // Select weapons with Shift+1 through Shift+4
      if ('1234'.includes(e.key)) {
        const mountIndex = parseInt(e.key) - 1;
        const mounts = Game.player.mountManager.getAllMounts();
        if (mounts[mountIndex] && mounts[mountIndex].hasWeapon()) {
          this.selectWeapon(mounts[mountIndex].getWeapon());
        }
        return;
      }
      
      // Rotation controls
      if (this.targetWeapon) {
        switch (e.key.toLowerCase()) {
          case 'q': this.adjustRotation('x', this.adjustmentStep); break;
          case 'a': this.adjustRotation('x', -this.adjustmentStep); break;
          case 'w': this.adjustRotation('y', this.adjustmentStep); break;
          case 's': this.adjustRotation('y', -this.adjustmentStep); break;
          case 'e': this.adjustRotation('z', this.adjustmentStep); break;
          case 'd': this.adjustRotation('z', -this.adjustmentStep); break;
          case 'r': this.resetRotation(); break;
          case 'p': this.printCurrentRotation(); break;
        }
      }
    }, { capture: true });
  }
  
  toggleUI() {
    this.active = !this.active;
    this.uiContainer.style.display = this.active ? 'block' : 'none';
    console.log(`Weapon orientation debugger ${this.active ? 'activated' : 'deactivated'}`);
    
    // Prevent scene from freezing
    if (this.active) {
      // Ensure event listeners don't block game input
      setTimeout(() => {
        if (this.active) {
          this.uiContainer.style.display = 'block';
        }
      }, 100);
    }
  }
  
  selectWeapon(weapon) {
    this.targetWeapon = weapon;
    this.originalRotation.copy(weapon.model.rotation);
    this.adjustmentValues = { x: 0, y: 0, z: 0 };
    this.updateUI();
    console.log(`Selected weapon for debugging: ${weapon.type}`);
    
    document.getElementById('selected-weapon-info').textContent = 
      `Selected: ${weapon.type} (Mounted on ${weapon.model.parent?.parent?.name || 'unknown'})`;
  }
  
  adjustRotation(axis, amount) {
    if (!this.targetWeapon) return;
    
    this.adjustmentValues[axis] += amount;
    this.targetWeapon.model.rotation[axis] = this.originalRotation[axis] + this.adjustmentValues[axis];
    this.updateUI();
  }
  
  resetRotation() {
    if (!this.targetWeapon) return;
    
    this.targetWeapon.model.rotation.copy(this.originalRotation);
    this.adjustmentValues = { x: 0, y: 0, z: 0 };
    this.updateUI();
    console.log('Reset weapon rotation to original values');
  }
  
  printCurrentRotation() {
    if (!this.targetWeapon) return;
    
    const finalRotation = this.targetWeapon.model.rotation;
    console.log(`[ORIENTATION DEBUG] Current rotation for ${this.targetWeapon.type}:`, {
      eulerRadians: {
        x: finalRotation.x,
        y: finalRotation.y, 
        z: finalRotation.z
      },
      eulerDegrees: {
        x: THREE.MathUtils.radToDeg(finalRotation.x),
        y: THREE.MathUtils.radToDeg(finalRotation.y),
        z: THREE.MathUtils.radToDeg(finalRotation.z)
      },
      adjustmentFromOriginal: {
        x: this.adjustmentValues.x,
        y: this.adjustmentValues.y,
        z: this.adjustmentValues.z
      },
      suggestedMountConfig: {
        defaultRotation: `new THREE.Euler(${finalRotation.x}, ${finalRotation.y}, ${finalRotation.z})`
      }
    });
  }
  
  updateUI() {
    document.getElementById('rot-x').textContent = this.adjustmentValues.x.toFixed(4);
    document.getElementById('rot-y').textContent = this.adjustmentValues.y.toFixed(4);
    document.getElementById('rot-z').textContent = this.adjustmentValues.z.toFixed(4);
  }
}
