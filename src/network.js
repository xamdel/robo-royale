import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import { Debug } from './main.js';
import { WeaponManager } from './weapons.js';
import * as THREE from 'three';

export const Network = {
  socket: null,
  interpolationBuffer: new Map(),
  BUFFER_SIZE: 8, // Increased buffer size for smoother interpolation
  interpolationSpeed: 1,
  lastUpdateTime: new Map(), // Track last update time per player
  velocities: new Map(), // Track velocities for prediction
  
  init() {
    this.socket = io('http://localhost:3000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });
    
    this.setupHandlers();
  },

  setupHandlers() {
    this.socket.on('connect', () => {
      console.log('Connected to server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from server');
      // Clear other players on disconnect
      Game.otherPlayers = {};
      this.interpolationBuffer.clear();
    });

    this.socket.on('gameState', (state) => {
      state.players.forEach(playerData => {
        if (playerData.id !== this.socket.id) {
          // Calculate velocity if we have previous data
          const lastUpdate = this.lastUpdateTime.get(playerData.id);
          if (lastUpdate) {
            const deltaTime = (state.timestamp - lastUpdate.timestamp) / 1000;
            if (deltaTime > 0) {
              const velocity = new THREE.Vector3(
                (playerData.position.x - lastUpdate.position.x) / deltaTime,
                (playerData.position.y - lastUpdate.position.y) / deltaTime,
                (playerData.position.z - lastUpdate.position.z) / deltaTime
              );
              this.velocities.set(playerData.id, velocity);
            }
          }
          
          // Buffer positions for interpolation
          let buffer = this.interpolationBuffer.get(playerData.id) || [];
          buffer.push({
            position: playerData.position,
            rotation: playerData.rotation,
            timestamp: state.timestamp,
            moveState: playerData.moveState // Add movement state
          });
          
          // Keep buffer size manageable
          while (buffer.length > this.BUFFER_SIZE) {
            buffer.shift();
          }
          
          this.interpolationBuffer.set(playerData.id, buffer);
          this.lastUpdateTime.set(playerData.id, {
            position: playerData.position,
            timestamp: state.timestamp
          });
          Game.updateOtherPlayer(playerData);
        } else if (Game.lastProcessedInputId < playerData.lastProcessedInput) {
          // Server reconciliation
          Game.lastProcessedInputId = playerData.lastProcessedInput;
          Game.inputBuffer = Game.inputBuffer.filter(input => 
            input.id > playerData.lastProcessedInput
          );
        }
      });

      // Remove players that are no longer in the game state
      Object.keys(Game.otherPlayers).forEach(playerId => {
        if (!state.players.find(p => p.id === playerId)) {
          if (Game.otherPlayers[playerId]?.mesh) {
            SceneManager.remove(Game.otherPlayers[playerId].mesh);
          }
          delete Game.otherPlayers[playerId];
          this.interpolationBuffer.delete(playerId);
        }
      });
    });

    this.socket.on('playerLeft', (playerId) => {
      if (Game.otherPlayers[playerId]?.mesh) {
        SceneManager.remove(Game.otherPlayers[playerId].mesh);
      }
      delete Game.otherPlayers[playerId];
      this.interpolationBuffer.delete(playerId);
    });

    this.socket.on('playerShot', (data) => {
      if (data.playerId !== this.socket.id) {
        WeaponManager.handleRemoteShot(data);
      }
    });

    this.socket.on('playerHit', (data) => {
      // Handle player being hit by projectile
      WeaponManager.createExplosion(new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      ));

      // If this client was hit, could trigger damage effects here
      if (data.hitPlayerId === this.socket.id) {
        console.log('You were hit by player:', data.sourcePlayerId);
        // TODO: Implement damage/health system
      }
    });

    this.socket.on('weaponPickedUp', (data) => {
      // Remove weapon from scene if another player picked it up
      if (data.playerId !== this.socket.id && SceneManager.cannon) {
        SceneManager.scene.remove(SceneManager.cannon);
        SceneManager.cannon = null;
        SceneManager.cannonCollider = null;
      }
    });

    this.socket.on('positionCorrection', (data) => {
      // Handle server correction
      if (Game.player) {
        Game.player.position.set(data.position.x, data.position.y, data.position.z);
        Game.player.quaternion.set(
          data.rotation.x,
          data.rotation.y,
          data.rotation.z,
          data.rotation.w
        );
        // Clear input buffer on correction
        Game.inputBuffer = [];
      }
    });
  },

  sendMove(moveData) {
    if (this.socket?.connected) {
      this.socket.emit('move', moveData);
    }
  },

  sendShot(position, direction) {
    if (this.socket?.connected) {
      this.socket.emit('shoot', { position, direction });
    }
  },

  sendProjectileHit(position, hitPlayerId) {
    if (this.socket?.connected) {
      this.socket.emit('projectileHit', { 
        position,
        hitPlayerId
      });
    }
  },

  sendWeaponPickup(weaponId) {
    if (this.socket?.connected) {
      this.socket.emit('weaponPickup', { weaponId });
    }
  },

  update(deltaTime) {
    const now = Date.now();
    // Interpolate other players
    for (const [playerId, buffer] of this.interpolationBuffer) {
      if (buffer.length >= 2) {
        const player = Game.otherPlayers[playerId];
        if (player?.mesh) {
          // Find the two buffer states to interpolate between
          let currentIndex = 0;
          while (currentIndex < buffer.length - 2 && 
                 buffer[currentIndex + 1].timestamp < now) {
            currentIndex++;
          }
          
          const current = buffer[currentIndex];
          const target = buffer[currentIndex + 1];
          const next = buffer[currentIndex + 2];
          
          // Calculate interpolation alpha
          const alpha = Math.min(
            (now - current.timestamp) / 
            (target.timestamp - current.timestamp),
            1
          );
          
          // Apply velocity-based prediction
          const velocity = this.velocities.get(playerId);
          const predictedPosition = velocity ? new THREE.Vector3(
            target.position.x + velocity.x * deltaTime,
            target.position.y + velocity.y * deltaTime,
            target.position.z + velocity.z * deltaTime
          ) : new THREE.Vector3(target.position.x, target.position.y, target.position.z);
          
          // Cubic interpolation for position
          if (next && alpha > 0.5) {
            // Use cubic interpolation when we have enough points
            const p0 = new THREE.Vector3(current.position.x, current.position.y, current.position.z);
            const p1 = new THREE.Vector3(target.position.x, target.position.y, target.position.z);
            const p2 = new THREE.Vector3(next.position.x, next.position.y, next.position.z);
            
            const t = (alpha - 0.5) * 2; // Remap alpha for the second half
            player.mesh.position.copy(p0)
              .multiplyScalar((1 - t) * (1 - t))
              .add(p1.multiplyScalar(2 * (1 - t) * t))
              .add(p2.multiplyScalar(t * t));
          } else {
            // Fall back to linear interpolation with prediction
            player.mesh.position.lerpVectors(
              new THREE.Vector3(current.position.x, current.position.y, current.position.z),
              predictedPosition,
              alpha * this.interpolationSpeed
            );
          }

          // Interpolate rotation with adaptive speed
          const rotationSpeed = alpha > 0.8 ? this.interpolationSpeed * 1.5 : this.interpolationSpeed;
          player.mesh.quaternion.slerpQuaternions(
            new THREE.Quaternion(
              current.rotation.x,
              current.rotation.y,
              current.rotation.z,
              current.rotation.w
            ),
            new THREE.Quaternion(
              target.rotation.x,
              target.rotation.y,
              target.rotation.z,
              target.rotation.w
            ),
            alpha * rotationSpeed
          );
          
          // Update movement state for animations
          if (target.moveState) {
            player.moveForward = target.moveState.moveForward;
            player.moveBackward = target.moveState.moveBackward;
            player.moveLeft = target.moveState.moveLeft;
            player.moveRight = target.moveState.moveRight;
            player.isRunning = target.moveState.isRunning;
          }
        }
      }
    }
  }
};
