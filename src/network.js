import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import { Debug } from './main.js';
import { WeaponManager } from './weapons.js';
import * as THREE from 'three';

export const Network = {
  socket: null,
  interpolationBuffer: new Map(),
  BUFFER_SIZE: 8, // Increased buffer size for smoother movement
  interpolationSpeed: 5, // Reduced speed for smoother interpolation
  lastUpdateTime: new Map(),
  playerStates: new Map(), // Store current and target states
  playerStateBuffer: new Map(), // Buffer for smoother transitions
  isMovingMap: new Map(), // Track if players are currently moving
  playerVelocities: new Map(), // Track velocities for prediction
  
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

    // In network.js, update the existing gameState handler
    this.socket.on('gameState', (state) => {
      // Process player updates (existing code)
      state.players.forEach(playerData => {
        if (playerData.id !== this.socket.id) {
          // Get or create buffer for this player
          let buffer = this.interpolationBuffer.get(playerData.id) || [];
          
          // Add the state to the buffer
          buffer.push({
            position: playerData.position,
            rotation: playerData.rotation,
            timestamp: state.timestamp,
            moveState: playerData.moveState
          });
          
          // Keep buffer size consistent with our BUFFER_SIZE setting
          while (buffer.length > this.BUFFER_SIZE) {
            buffer.shift();
          }
          
          // Store the buffer
          this.interpolationBuffer.set(playerData.id, buffer);
          
          // Update the player in the game
          Game.updateOtherPlayer(playerData);
        } else if (Game.lastProcessedInputId < playerData.lastProcessedInput) {
          // Server reconciliation for local player
          Game.lastProcessedInputId = playerData.lastProcessedInput;
          Game.inputBuffer = Game.inputBuffer.filter(input => 
            input.id > playerData.lastProcessedInput
          );
        }
      });

      // Process projectile updates (new code)
      if (state.projectiles && state.projectiles.length > 0) {
        state.projectiles.forEach(projectileData => {
          const projectile = WeaponManager.networkProjectiles.get(projectileData.id);
          
          if (projectile) {
            // For projectiles from the local player, use reconciliation
            const isLocalProjectile = projectile.sourcePlayer === Game.player;
            
            // For all projectiles, update from server authority
            projectile.serverPosition = new THREE.Vector3(
              projectileData.position.x,
              projectileData.position.y,
              projectileData.position.z
            );
            
            // Only override local prediction if discrepancy is too large
            if (projectile.position.distanceTo(projectile.serverPosition) > 1.0) {
              projectile.position.copy(projectile.serverPosition);
            }
          }
        });
      }

      // Remove players that are no longer in the game state
      Object.keys(Game.otherPlayers).forEach(playerId => {
        if (!state.players.find(p => p.id === playerId)) {
          if (Game.otherPlayers[playerId]?.mesh) {
            SceneManager.remove(Game.otherPlayers[playerId].mesh);
          }
          delete Game.otherPlayers[playerId];
          this.interpolationBuffer.delete(playerId);
          this.isMovingMap.delete(playerId);
          this.playerVelocities.delete(playerId);
        }
      });
    });

    this.socket.on('projectileCreated', (data) => {
      if (data.sourcePlayerId !== this.socket.id) {
        const projectile = WeaponManager.projectileManager.spawn(
          data.weaponType,
          new THREE.Vector3(data.position.x, data.position.y, data.position.z),
          new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z),
          Game.otherPlayers[data.sourcePlayerId]?.mesh
        );
        if (projectile) {
          projectile.serverId = data.id;
          WeaponManager.networkProjectiles.set(data.id, projectile);
        }
      } else {
        const tempProjectile = WeaponManager.networkProjectiles.get(data.tempId);
        if (tempProjectile) {
          WeaponManager.networkProjectiles.delete(data.tempId);
          tempProjectile.serverId = data.id;
          WeaponManager.networkProjectiles.set(data.id, tempProjectile);
        }
      }
    });

    // Add handler for projectile destroyed
    this.socket.on('projectileDestroyed', (data) => {
      const projectile = WeaponManager.networkProjectiles.get(data.id);
      
      // Show hit effect if projectile was destroyed due to hit, regardless of whether
      // we have the projectile object locally - this ensures observers see hits
      if (data.reason === 'hit' && data.position) {
        const hitPosition = new THREE.Vector3(
          data.position.x,
          data.position.y,
          data.position.z
        );
        
        // Always show the explosion for server-confirmed hits
        // This ensures all clients see the hit effect
        if (data.serverConfirmed) {
          console.log('Server confirmed hit at position:', hitPosition);
          WeaponManager.createExplosion(hitPosition);
        }
          
        // Handle player hit logic
        if (data.hitPlayerId === this.socket.id) {
          console.log('You were hit by player:', data.sourcePlayerId);
          // TODO: Implement damage/health system
        }
      }
      
      // If we have the projectile locally, deactivate it
      if (projectile) {
        // Deactivate and remove projectile
        projectile.deactivate();
        WeaponManager.networkProjectiles.delete(data.id);
      }
    });

    this.socket.on('playerLeft', (playerId) => {
      if (Game.otherPlayers[playerId]?.mesh) {
        SceneManager.remove(Game.otherPlayers[playerId].mesh);
      }
    delete Game.otherPlayers[playerId];
    this.interpolationBuffer.delete(playerId);
    this.playerVelocities.delete(playerId);
    });

    this.socket.on('playerShot', (data) => {
      if (data.playerId !== this.socket.id) {
        WeaponManager.handleRemoteShot(data);
      }
    });

    this.socket.on('playerHit', (data) => {
      // Update local player health if we were hit
      if (data.hitPlayerId === this.socket.id) {
        Game.health = data.currentHealth;
        if (window.HUD) {
          window.HUD.updateHealth(data.currentHealth);
          if (data.damage > 0) {
            window.HUD.showDamageIndicator(data.damage);
          }
        }
      }
      // Handle visual effects for all hits
      WeaponManager.handleServerHit(data);
    });

    this.socket.on('playerKilled', (data) => {
      if (data.playerId === this.socket.id) {
        // Local player was killed
        Game.handleDeath(data.killerPlayerId);
        if (window.HUD) {
          window.HUD.showDeathScreen(data.killerPlayerId);
        }
      }
    });

    this.socket.on('playerRespawned', (data) => {
      if (data.playerId === this.socket.id) {
        // Local player respawned
        Game.handleRespawn();
        if (window.HUD) {
          window.HUD.hideDeathScreen();
          window.HUD.updateHealth(Game.health);
        }
      }
    });

    this.socket.on('healthUpdate', (data) => {
      if (data.playerId === this.socket.id) {
        Game.health = data.health;
        if (window.HUD) {
          window.HUD.updateHealth(data.health);
          if (data.wasHit) {
            window.HUD.showDamageIndicator(data.damage);
          }
        }
      }
      WeaponManager.handleHealthUpdate(data);
    });

    this.socket.on('ammoUpdate', (data) => {
      WeaponManager.handleAmmoUpdate(data);
    });

    this.socket.on('weaponPickedUp', (data) => {
      // Always remove the original weapon from the scene
      if (SceneManager.cannon) {
        SceneManager.scene.remove(SceneManager.cannon);
        SceneManager.cannon = null;
        SceneManager.cannonCollider = null;
      }
      
      // If we're the one who picked up the weapon, we've already attached it locally
      // so we don't need to do anything else
      if (data.playerId === this.socket.id) {
        return;
      }
      
      // Validate required weapon data
      if (!data.weaponType || !data.socketName) {
        console.error('Missing weapon data in pickup event:', data);
        return;
      }
      
      // For other players picking up weapons, only attach to their model
      const remotePlayer = Game.otherPlayers[data.playerId];
      if (!remotePlayer) {
        console.warn('Remote player not found for weapon pickup:', data.playerId);
        return;
      }
      
      const weaponClone = SceneManager.cloneWeapon(data.weaponType);
      if (!weaponClone) {
        console.error('Failed to clone weapon of type:', data.weaponType);
        return;
      }
      
      WeaponManager.attachWeaponToSocket(
        remotePlayer.mesh,
        weaponClone,
        data.socketName,
        data.weaponType,
        true // Mark as remote pickup to avoid duplicate logs
      );
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

  sendProjectileHitSuggestion(data) {
    if (this.socket?.connected) {
      this.socket.emit('projectileHitSuggestion', data);
    }
  },

  sendWeaponPickup(data) {
    if (this.socket?.connected) {
      this.socket.emit('weaponPickup', {
        weaponId: data.weaponId,
        weaponType: data.weaponType,
        socketName: data.socketName
      });
    }
  },

  sendShot(data) {
    if (this.socket?.connected) {
      this.socket.emit('shootProjectile', {
        weaponId: data.weaponId,
        weaponType: data.type,
        position: data.position,
        direction: data.direction
      });
    }
  },

  update(deltaTime) {
    const now = Date.now();

    // Interpolate other players
    for (const [playerId, buffer] of this.interpolationBuffer) {
      const player = Game.otherPlayers[playerId];
      if (!player || !player.mesh) continue;
      
      // Need at least 2 states to interpolate
      if (buffer.length < 2) continue;
      
      // Use most recent states for interpolation
      const prevState = buffer[buffer.length - 2];
      const nextState = buffer[buffer.length - 1];
      
      // Calculate how far we are between the two states (0 to 1)
      const duration = nextState.timestamp - prevState.timestamp;
      if (duration <= 0) continue; // Skip invalid time data
      
      // Calculate normalized time position between the two states
      let alpha = (now - prevState.timestamp) / duration;
      alpha = Math.max(0, Math.min(1, alpha));
      
      // Create position vectors from state data
      const prevPosition = new THREE.Vector3(
        prevState.position.x,
        prevState.position.y,
        prevState.position.z
      );
      
      const nextPosition = new THREE.Vector3(
        nextState.position.x,
        nextState.position.y,
        nextState.position.z
      );
      
      // Create quaternions from rotation data
      const prevRotation = new THREE.Quaternion(
        prevState.rotation.x,
        prevState.rotation.y,
        prevState.rotation.z,
        prevState.rotation.w
      );
      
      const nextRotation = new THREE.Quaternion(
        nextState.rotation.x,
        nextState.rotation.y,
        nextState.rotation.z,
        nextState.rotation.w
      );
      
      // Calculate velocity
      const velocity = this.playerVelocities.get(playerId) || new THREE.Vector3();
      const newVelocity = nextPosition.clone().sub(prevPosition).multiplyScalar(1 / duration);
      
      // Smooth velocity changes
      velocity.lerp(newVelocity, deltaTime * this.interpolationSpeed);
      this.playerVelocities.set(playerId, velocity);
      
      // Apply velocity-based prediction
      const predictedPosition = new THREE.Vector3();
      predictedPosition.lerpVectors(prevPosition, nextPosition, alpha);
      predictedPosition.add(velocity.clone().multiplyScalar(deltaTime));
      
      // Smooth final position
      player.mesh.position.lerp(predictedPosition, deltaTime * this.interpolationSpeed);
      
      // Interpolate rotation with smoother transitions
      const newRotation = new THREE.Quaternion();
      newRotation.slerpQuaternions(prevRotation, nextRotation, alpha);
      player.mesh.quaternion.slerp(newRotation, deltaTime * this.interpolationSpeed);
      
      // Only remove old states if we have enough buffer and have completed interpolation
      if (alpha >= 0.99 && buffer.length > Math.ceil(this.BUFFER_SIZE / 2)) {
        buffer.shift();
      }
    }
  }
};
