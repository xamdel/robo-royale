import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import { weaponSystem } from './weapons/index.js';
import { MountManager } from './weapons/MountManager.js';
import { particleEffectSystem } from './systems/ParticleEffectSystem.js';
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
  jitterBuffer: [], // For measuring network quality
  smoothedRTT: 0, // Running average of round-trip time
  adaptiveBufferSize: 3, // Dynamic buffer size based on network conditions
  adaptiveInterpolationSpeed: 5, // Dynamic interpolation speed
  
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

    // Handle game state updates for player positions
    this.socket.on('gameState', (state) => {
      // Process player updates
      state.players.forEach(playerData => {
        if (playerData.id !== this.socket.id) {
          // Handle other players
          let buffer = this.interpolationBuffer.get(playerData.id) || [];
          
          buffer.push({
            position: playerData.position,
            rotation: playerData.rotation,
            timestamp: state.timestamp,
            moveState: playerData.moveState
          });
          
          while (buffer.length > this.BUFFER_SIZE) {
            buffer.shift();
          }
          
          this.interpolationBuffer.set(playerData.id, buffer);
          Game.updateOtherPlayer(playerData);
        } else if (Game.lastProcessedInputId < playerData.lastProcessedInput) {
          // Server reconciliation for local player
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
          this.isMovingMap.delete(playerId);
          this.playerVelocities.delete(playerId);
        }
      });
    });

    // NEW: Handle projectile position updates from server
    this.socket.on('projectilesUpdate', (data) => {
      if (data.projectiles && data.projectiles.length > 0) {
        data.projectiles.forEach(projectileData => {
          const projectile = weaponSystem.getWeaponById(projectileData.weaponId)?.projectiles?.get(projectileData.id);
          
          if (projectile) {
            // For all projectiles, update from server authority
            projectile.serverPosition = new THREE.Vector3(
              projectileData.position.x,
              projectileData.position.y,
              projectileData.position.z
            );
          }
        });
      }
    });

    // Handle new projectile creation
    this.socket.on('projectileCreated', (data) => {
      // Only spawn projectiles for other players - our own are created when we shoot
      if (data.ownerId !== this.socket.id) {
        const weapon = weaponSystem.getWeaponById(data.weaponId);
        if (weapon) {
          const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
          const direction = new THREE.Vector3(data.direction.x, data.direction.y, data.direction.z);
          weapon.createProjectile(position, direction);
        }
      }
      
    });

    // Handle projectile destruction
    this.socket.on('projectileDestroyed', (data) => {
      const weapon = weaponSystem.getWeaponById(data.weaponId);
      
      // Show hit effect if projectile was destroyed due to hit
      if (data.reason === 'hit' && data.position) {
        const hitPosition = new THREE.Vector3(
          data.position.x,
          data.position.y,
          data.position.z
        );
        
        console.log('Server confirmed hit at position:', hitPosition);
        
        if (weapon) {
          weapon.handleHit(hitPosition);
        }
      }
    });

    // Handle player left events
    this.socket.on('playerLeft', (playerId) => {
      if (Game.otherPlayers[playerId]?.mesh) {
        SceneManager.remove(Game.otherPlayers[playerId].mesh);
      }
      delete Game.otherPlayers[playerId];
      this.interpolationBuffer.delete(playerId);
      this.playerVelocities.delete(playerId);
    });

    // Handle player hit events
    this.socket.on('playerHit', (data) => {
      // Update local player health if we were hit
      if (data.hitPlayerId === this.socket.id) {
        Game.health = data.currentHealth;
        
        console.log('Player hit! Current health:', data.currentHealth, 'Was killed:', data.wasKilled);
        
        if (window.HUD) {
          window.HUD.updateHealth();
          
          // Show damage alert
          if (data.damage > 0) {
            window.HUD.showAlert(`Damage taken: ${data.damage}`, "warning");
          }
        }
        
        // Handle death 
        if (data.wasKilled) {
          Game.handleDeath(data.sourcePlayerId);
          if (window.HUD) {
            window.HUD.showAlert("YOU WERE DESTROYED", "danger");
          }
        }
      }
      
      // If we're the shooter, show hit confirmation
      if (data.sourcePlayerId === this.socket.id) {
        if (window.HUD) {
          window.HUD.showAlert(`Hit! Damage: ${data.damage}`, "success");
          
          if (data.wasKilled) {
            window.HUD.showAlert("Enemy destroyed!", "success");
          }
        }
      }
    });

    // Handle player killed and respawn events
    this.socket.on('playerKilled', (data) => {
      // Convert position to THREE.Vector3
      const position = new THREE.Vector3(
        data.position.x,
        data.position.y,
        data.position.z
      );
      
      // If it's the local player who died
      if (data.playerId === this.socket.id) {
        Game.handleDeath(data.killerPlayerId);
        if (window.HUD) {
          window.HUD.showAlert("YOU WERE DESTROYED", "danger");
        }
        
        // Hide the player model during death state
        Game.player.visible = false;
      } else {
        // Find and hide the remote player
        const remotePlayer = Game.otherPlayers[data.playerId];
        if (remotePlayer && remotePlayer.mesh) {
          remotePlayer.mesh.visible = false;
        }
      }
      
      // Create explosion at player position using the particle effect system
      if (window.particleEffectSystem) {
        window.particleEffectSystem.createPlayerExplosion(position);
      }
      
      // Play explosion sound
      if (window.AudioManager) {
        window.AudioManager.playSound('explosion', position);
      }
    });

    this.socket.on('playerRespawned', (data) => {
      if (data.playerId === this.socket.id) {
        console.log('Local player respawning!');
        Game.handleRespawn();
        
        // Make player visible again
        Game.player.visible = true;
        
        if (window.HUD) {
          window.HUD.showAlert("SYSTEMS REBOOT COMPLETE", "success");
        }
        
        // When local player respawns, clear all other players and request updates
        // This ensures we can see all other players after respawning with proper mounts
        console.log('Refreshing all other players after local respawn');
        
        // Clean up existing other players
        Object.keys(Game.otherPlayers).forEach(playerId => {
          const player = Game.otherPlayers[playerId];
          if (player && player.mesh) {
            console.log(`Cleaning up player ${playerId} after local respawn`);
            
            // Remove player's mesh from scene
            if (player.mesh.parent) {
              player.mesh.parent.remove(player.mesh);
            }
            
            // Clear any weapon references
            if (player.mountManager) {
              player.mountManager.detachAllWeapons();
            }
          }
          
          // Remove player from our memory
          delete Game.otherPlayers[playerId];
          
          // Clear interpolation buffers for this player
          this.interpolationBuffer.delete(playerId);
          this.playerVelocities.delete(playerId);
        });
        
        // Request a fresh gameState update from the server
        // This will trigger creation of new players with proper mount managers
        console.log('Requesting fresh game state after respawn');
        this.socket.emit('requestGameState');
      } else {
        // Make remote player visible again
        const remotePlayer = Game.otherPlayers[data.playerId];
        if (remotePlayer && remotePlayer.mesh) {
          remotePlayer.mesh.visible = true;
          
          // Update position if provided
          if (data.position) {
            remotePlayer.mesh.position.set(
              data.position.x, 
              data.position.y, 
              data.position.z
            );
          }
        }
      }
    });

    // Handle ammo updates
    this.socket.on('ammoUpdate', (data) => {
      Game.ammo = data.ammo;
      
      if (window.HUD) {
        // No need for separate method since updateWeaponStatus already reads Game.ammo
        window.HUD.updateWeaponStatus();
      }
    });

    // Handle weapon pickups
    this.socket.on('weaponPickedUp', async (data) => {
      // Always remove the original weapon from the scene
      if (SceneManager.cannon) {
        SceneManager.scene.remove(SceneManager.cannon);
        SceneManager.cannon = null;
        SceneManager.cannonCollider = null;
      }
      
      // If we're the one who picked up the weapon, we've already attached it locally
      if (data.playerId === this.socket.id) {
        return;
      }
      
      // Validate required weapon data
      if (!data.weaponType || !data.socketName) {
        console.error('Missing weapon data in pickup event:', data);
        return;
      }
      
      // For other players picking up weapons, attach to their model
      const remotePlayer = Game.otherPlayers[data.playerId];
      if (!remotePlayer) {
        console.warn('Remote player not found for weapon pickup:', data.playerId);
        return;
      }
      
      console.log(`Attaching ${data.weaponType} to remote player ${data.playerId}`);
      
      // Make sure the remote player's mesh is visible
      if (remotePlayer.mesh) {
        remotePlayer.mesh.visible = true;
      } else {
        console.error('Remote player has no mesh for weapon attachment');
        return;
      }
      
      const weaponClone = await SceneManager.cloneWeapon(data.weaponType);
      if (!weaponClone) {
        console.error('Failed to clone weapon of type:', data.weaponType);
        return;
      }
      
      // Create a separate mount manager for each remote player
      if (!remotePlayer.mountManager) {
        console.log('Creating dedicated mount manager for remote player');
        remotePlayer.mountManager = new MountManager();
        const mountsInitialized = remotePlayer.mountManager.initMounts(remotePlayer.mesh);
        console.log(`Remote player mount initialization result: ${mountsInitialized}`);
      }
      
      // Create a weapon and attach it to the remote player
      weaponSystem.weaponFactory.createWeapon(data.weaponType, weaponClone).then(weapon => {
        if (weapon) {
          // Assign the weapon ID from server
          weapon.id = data.weaponId;
          
          // Find the right mount point on the remote player using player's dedicated mount manager
          const mountPoint = remotePlayer.mountManager.getAllMounts().find(m => m.socketName === data.socketName);
          if (mountPoint) {
            console.log(`Attaching ${data.weaponType} to socket ${data.socketName}`);
            const success = mountPoint.attachWeapon(weapon);
            console.log(`Weapon attachment result: ${success}`);
          } else {
            console.error(`Mount point with socket ${data.socketName} not found on remote player ${data.playerId}`);
            
                  // Debug: log all available mount points for this remote player
            const allMounts = remotePlayer.mountManager.getAllMounts();
            console.log(`Available mounts for remote player ${data.playerId}:`, allMounts.map(m => ({
              id: m.id,
              socketName: m.socketName
            })));
            
            // Try reinitializing this player's mount points as a fallback
            console.log('Attempting to reinitialize mount points for remote player');
            
            // Create a new mount manager if needed
            if (!remotePlayer.mountManager) {
              console.log('Creating new mount manager for remote player');
              remotePlayer.mountManager = new MountManager();
            }
            
            // Reinitialize the mount points
            const success = remotePlayer.mountManager.initMounts(remotePlayer.mesh);
            console.log(`Mount reinitialization result: ${success}`);
          }
        }
      });
    });

    // Handle position corrections
    this.socket.on('positionCorrection', (data) => {
      if (Game.player) {
        Game.player.position.set(data.position.x, data.position.y, data.position.z);
        Game.player.quaternion.set(
          data.rotation.x,
          data.rotation.y,
          data.rotation.z,
          data.rotation.w
        );
        Game.inputBuffer = [];
      }
    });
  },

  sendMove(moveData) {
    if (this.socket?.connected) {
      this.socket.emit('move', moveData);
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
      console.log('Sending shot to server:', data);
      this.socket.emit('shootProjectile', {
        weaponId: data.weaponId,
        weaponType: data.weaponType || data.type,
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
