import * as THREE from 'three';
import { Network } from './network.js';
import { Game } from './game.js';

export const DebugTools = {
  // Existing tools
  findLeftArm(model) {
    let leftArm = null;
    model.traverse((child) => {
      if (child.name.toLowerCase().includes('leftarm') || 
          child.name.toLowerCase().includes('left_arm')) {
        leftArm = child;
      }
    });
    return leftArm;
  },

  // Network debug visualization
  debugMeshes: {},
  debugLines: {},
  debugText: {},

  createNetworkDebugUI() {
    const container = document.createElement('div');
    container.id = 'network-debug';
    container.style.position = 'fixed';
    container.style.top = '10px';
    container.style.right = '10px';
    container.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    container.style.color = 'white';
    container.style.padding = '10px';
    container.style.fontFamily = 'monospace';
    container.style.fontSize = '12px';
    container.style.display = 'none';

    const stats = document.createElement('div');
    stats.id = 'network-stats';
    container.appendChild(stats);

    const reconciliation = document.createElement('div');
    reconciliation.id = 'reconciliation-stats';
    container.appendChild(reconciliation);

    const interpolation = document.createElement('div');
    interpolation.id = 'interpolation-stats';
    container.appendChild(interpolation);

    document.body.appendChild(container);
  },

  updateNetworkDebugUI() {
    if (!document.getElementById('network-debug')) {
      this.createNetworkDebugUI();
    }

    const container = document.getElementById('network-debug');
    const stats = document.getElementById('network-stats');
    const reconciliation = document.getElementById('reconciliation-stats');
    const interpolation = document.getElementById('interpolation-stats');

    // Only update if debug mode is enabled
    if (window.Debug && window.Debug.state.enabled) {
      container.style.display = 'block';

      // Network stats
      stats.innerHTML = `
        RTT: ${Network.smoothedRTT.toFixed(2)}ms<br>
        Jitter: ${this.calculateJitter().toFixed(2)}ms<br>
        Buffer Size: ${Network.adaptiveBufferSize}<br>
        Interp Speed: ${Network.adaptiveInterpolationSpeed.toFixed(2)}
      `;

      // Reconciliation stats
      if (Game.stateHistory.length > 0) {
        const lastState = Game.stateHistory[Game.stateHistory.length - 1];
        reconciliation.innerHTML = `
          Input Buffer: ${Game.inputBuffer.length}<br>
          State History: ${Game.stateHistory.length}<br>
          Last Input ID: ${Game.lastProcessedInputId}<br>
          Pending Inputs: ${Game.inputBuffer.length}
        `;
      }

      // Interpolation stats
      const otherPlayerCount = Object.keys(Game.otherPlayers).length;
      interpolation.innerHTML = `
        Players: ${otherPlayerCount}<br>
        State Buffers: ${Object.keys(Network.playerStateBuffer).length}<br>
        Total States: ${this.getTotalBufferedStates()}<br>
        Avg States/Player: ${this.getAverageStatesPerPlayer().toFixed(1)}
      `;
    } else {
      container.style.display = 'none';
    }
  },

  calculateJitter() {
    if (Network.jitterBuffer.length < 2) return 0;
    const avg = Network.jitterBuffer.reduce((a, b) => a + b) / Network.jitterBuffer.length;
    const variance = Network.jitterBuffer.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / Network.jitterBuffer.length;
    return Math.sqrt(variance);
  },

  getTotalBufferedStates() {
    return Object.values(Network.playerStateBuffer).reduce((total, buffer) => total + buffer.length, 0);
  },

  getAverageStatesPerPlayer() {
    const playerCount = Object.keys(Network.playerStateBuffer).length;
    return playerCount ? this.getTotalBufferedStates() / playerCount : 0;
  },

  // Visual debug helpers
  createDebugVisuals(scene) {
    // Clear existing debug visuals
    this.clearDebugVisuals(scene);

    // Create prediction visualization
    if (Game.player) {
      const predictionHelper = new THREE.ArrowHelper(
        new THREE.Vector3(0, 1, 0),
        Game.player.position,
        2,
        0x00ff00
      );
      scene.add(predictionHelper);
      this.debugMeshes['prediction'] = predictionHelper;
    }

    // Create server reconciliation visualization
    const reconciliationLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xff0000 })
    );
    scene.add(reconciliationLine);
    this.debugLines['reconciliation'] = reconciliationLine;
  },

  updateDebugVisuals() {
    if (!window.Debug || !window.Debug.state.enabled) return;

    // Update prediction visualization
    if (Game.player && this.debugMeshes['prediction']) {
      const lastInput = Game.inputBuffer[Game.inputBuffer.length - 1];
      if (lastInput) {
        const direction = new THREE.Vector3(
          Math.cos(Game.player.rotation.y),
          0,
          Math.sin(Game.player.rotation.y)
        );
        this.debugMeshes['prediction'].position.copy(Game.player.position);
        this.debugMeshes['prediction'].setDirection(direction);
      }
    }

    // Update reconciliation visualization
    if (this.debugLines['reconciliation'] && Game.stateHistory.length > 0) {
      const points = [];
      Game.stateHistory.forEach(state => {
        points.push(state.position);
      });
      
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      this.debugLines['reconciliation'].geometry.dispose();
      this.debugLines['reconciliation'].geometry = geometry;
    }
  },

  clearDebugVisuals(scene) {
    // Remove debug meshes
    Object.values(this.debugMeshes).forEach(mesh => {
      scene.remove(mesh);
    });
    this.debugMeshes = {};

    // Remove debug lines
    Object.values(this.debugLines).forEach(line => {
      scene.remove(line);
    });
    this.debugLines = {};

    // Remove debug text
    Object.values(this.debugText).forEach(text => {
      scene.remove(text);
    });
    this.debugText = {};
  }
};
