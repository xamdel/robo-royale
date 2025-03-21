import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import { Debug } from './main.js';
import { WeaponManager } from './weapons.js';
import * as THREE from 'three';

export const Network = {
  socket: null,
  
  // Add interpolation settings
  interpolationSpeed: 10, // Adjust for smoothness
  
  // Sequence tracking
  sequenceNumber: 0,
  lastReceivedSequence: {},

  init() {
    this.socket = io();
    
    this.socket.on('connect', () => {
      console.log('Connected to server with ID:', this.socket.id);
    });

    this.socket.on('projectileHit', (data) => {
      // Create explosion effect at hit position
      WeaponManager.createExplosion(new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      ));
    });

    this.socket.on('existingPlayers', (serverPlayers) => {
      console.log('Received existing players:', serverPlayers);
      for (let id in serverPlayers) {
        if (id !== this.socket.id) {
          this.addOtherPlayer(id, serverPlayers[id]);
        }
      }
    });

    this.socket.on('newPlayer', (player) => {
      console.log('New player joined:', player.id);
      if (player.id !== this.socket.id) {
        this.addOtherPlayer(player.id, player);
      }
    });

    this.socket.on('playerMoved', (data) => {
      if (Game.otherPlayers[data.id]) {
        const player = Game.otherPlayers[data.id];
        
        // Check sequence number if available
        if (data.sequence !== undefined) {
          // Track last received sequence for this player
          this.lastReceivedSequence[data.id] = this.lastReceivedSequence[data.id] || 0;
          
          // Log out-of-order packets if debug is enabled
          if (Debug.state.enabled && data.sequence < this.lastReceivedSequence[data.id]) {
            console.warn(`[${Date.now()}] Out-of-order packet received for player ${data.id}:`, {
              received: data.sequence,
              expected: this.lastReceivedSequence[data.id] + 1
            });
          }
          
          // Update last received sequence
          this.lastReceivedSequence[data.id] = data.sequence;
        }
        
        // Store target position instead of immediately setting it
        player.targetPosition = new THREE.Vector3(
          data.position.x,
          data.position.y,
          data.position.z
        );
        
        // Store original rotation - offset will be applied during interpolation
        player.targetRotation = data.rotation;
        
        // Store if the player is running
        player.isRunning = data.isRunning;
      }
    });

    this.socket.on('playerDisconnected', (id) => {
      console.log('Player disconnected:', id);
      if (Game.otherPlayers[id]) {
        SceneManager.remove(Game.otherPlayers[id].mesh);
        delete Game.otherPlayers[id];
      }
    });
  },

  addOtherPlayer(id, playerData) {
    Game.otherPlayers[id] = Game.createPlayerMesh(id);
    
    if (Game.otherPlayers[id]) {
      SceneManager.add(Game.otherPlayers[id].mesh);
      Game.otherPlayers[id].mesh.position.set(
        playerData.position.x, 
        playerData.position.y, 
        playerData.position.z
      );
      
      // Initialize target position to current position
      Game.otherPlayers[id].targetPosition = new THREE.Vector3(
        playerData.position.x,
        playerData.position.y,
        playerData.position.z
      );
      
      // Initialize rotation and running state
      Game.otherPlayers[id].targetRotation = playerData.rotation || 0;
      Game.otherPlayers[id].isRunning = playerData.isRunning || false;
      Game.otherPlayers[id].previousPosition = Game.otherPlayers[id].mesh.position.clone();
    }
  },

  update(deltaTime) {
    for (const id in Game.otherPlayers) {
      const player = Game.otherPlayers[id];
      
      if (player.targetPosition && player.mesh) {
        // Store previous position for distance calculation
        const prevPosition = player.mesh.position.clone();
        
        // Interpolate position
        const lerpFactor = Math.min(this.interpolationSpeed * deltaTime, 1);
        player.mesh.position.lerp(player.targetPosition, lerpFactor);

        // --- Client-Side Interpolation Diagnostics ---
        // Only log when there's a significant change in position
        const distanceToTarget = player.mesh.position.distanceTo(player.targetPosition);
        const distanceMoved = player.mesh.position.distanceTo(prevPosition);
        
        // Store these values for debugging
        player.debugInfo = player.debugInfo || {};
        player.debugInfo.distanceToTarget = distanceToTarget;
        player.debugInfo.distanceMoved = distanceMoved;
        player.debugInfo.lerpFactor = lerpFactor;
        
        // Update visual debug helper if debug mode is enabled
        if (Debug.state.enabled && Debug.state.showVisualHelpers && distanceToTarget > 0.1) {
          SceneManager.updateDebugHelper(player.mesh, player.targetPosition);
        }
        
        // Log only when debug is enabled and there's a significant change or every 30 frames
        if (Debug.state.enabled && (distanceToTarget > 0.5 || player.debugInfo.frameCount % 30 === 0)) {
          console.log(`[${Date.now()}] Interpolation - Player ${id}:`, {
            distanceToTarget: distanceToTarget.toFixed(2),
            distanceMoved: distanceMoved.toFixed(2),
            lerpFactor: lerpFactor.toFixed(2)
          });
        }
        
        // Increment frame counter
        player.debugInfo.frameCount = (player.debugInfo.frameCount || 0) + 1;

        // Interpolate rotation (with proper angle interpolation)
        if (player.targetRotation !== undefined) {
          // Simple rotation interpolation
          const currentY = player.mesh.rotation.y;
          const targetY = player.targetRotation;
          
          // Apply 180-degree offset for remote perspective
          const adjustedTargetY = targetY + Math.PI;
          
          // Handle angle wrapping
          let delta = adjustedTargetY - currentY;
          if (delta > Math.PI) delta -= Math.PI * 2;
          if (delta < -Math.PI) delta += Math.PI * 2;
          
          player.mesh.rotation.y += delta * lerpFactor;
        }
      }
    }
  },

  sendMove(moveData) {
    if (!moveData || !moveData.position) {
      console.warn('Invalid moveData received:', moveData);
      return;
    }
    
    // Add running state to move data
    moveData.isRunning = Game.isRunning;
    
    // Add debug flag if debug mode is enabled
    if (Debug.state.enabled) {
      moveData.debug = true;
      
      // Log movement data in debug mode
      console.log('Sending move data:', {
        position: moveData.position.toArray(),
        rotation: moveData.rotation,
        isRunning: moveData.isRunning,
        sequence: this.sequenceNumber
      });
    }
    
    // Add sequence number
    moveData.sequence = this.sequenceNumber++;
    
    this.socket.emit('move', moveData);
  },

  sendProjectileHit(position) {
    this.socket.emit('projectileHit', {
      position: {
        x: position.x,
        y: position.y,
        z: position.z
      }
    });
  }
};
