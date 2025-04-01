import { io } from 'socket.io-client';
import { Game } from './game.js';
import { SceneManager } from './scene.js';
import { weaponSystem } from './weapons/index.js';
import { NameTagSystem } from './systems/NameTagSystem.js'; // Import NameTagSystem
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
  pendingInitialPickups: null, // Store initial pickups if manager isn't ready

  init() {
    this.socket = io('', {
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
      // Clear pickups on disconnect? Or wait for new initial state?
      if (Game.weaponSpawnManager) {
        Game.weaponSpawnManager.clearExistingPickups();
      }
    });

    // Handle initial state of all pickup items (weapons and ammo boxes)
    this.socket.on('initialPickupState', (pickupDataList) => {
        console.log(`[Network] Received initial pickup state with ${pickupDataList.length} items.`);
        if (window.Game && window.Game.weaponSpawnManager) {
            // Spawn manager is ready, process immediately
            console.log("[Network] WeaponSpawnManager ready, spawning initial pickups.");
            window.Game.weaponSpawnManager.spawnAllPickups(pickupDataList);
        } else {
            // Spawn manager not ready, store data for later processing in Game.init
            console.warn("[Network] WeaponSpawnManager not ready yet. Storing initial pickup state.");
            this.pendingInitialPickups = pickupDataList;
        }
    });

    // Handle game state updates (includes player positions, maybe pickups later?)
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
          NameTagSystem.removeTag(playerId); // Remove name tag
          delete Game.otherPlayers[playerId];
          this.interpolationBuffer.delete(playerId);
          this.isMovingMap.delete(playerId);
          this.playerVelocities.delete(playerId);
        }
      });

      // Process pickup item updates (if included in gameState later)
      // if (state.pickupItems && Game.weaponSpawnManager) {
      //   // Compare state.pickupItems with Game.weaponSpawnManager.activePickups
      //   // Add new ones, remove missing ones
      // }
    });

    // Handle projectile position updates from server
    this.socket.on('projectilesUpdate', (data) => {
      if (data.projectiles && data.projectiles.length > 0) {
        data.projectiles.forEach(projectileData => {
          // Try to find projectile in any weapon's projectiles
          for (const weapon of weaponSystem.activeWeapons.values()) {
            const projectile = weapon.projectiles?.get(projectileData.id);
            if (projectile) {
              // Update projectile position from server authority
              projectile.serverPosition = new THREE.Vector3(
                projectileData.position.x,
                projectileData.position.y,
                projectileData.position.z
              );
              break;
            }
          }
        });
      }
    });

    // Handle new projectile creation
    this.socket.on('projectileCreated', (data) => {
      // Special handling for turret projectiles (visible to everyone, including shooter)
      if (data.weaponType === 'turretCannon') {
        console.log(`[Network] Received turretCannon created event: ID=${data.id}`);
        if (weaponSystem?.handleTurretShot) {
           weaponSystem.handleTurretShot(data); // Pass all data (id, ownerId, position, direction, radius, speed)
        } else {
           console.warn('[Network] weaponSystem.handleTurretShot not found!');
        }
      // Handle standard weapon projectiles (only for other players)
      } else if (data.ownerId !== this.socket.id) {
        // Use weapon system to handle the remote shot for standard weapons
        const projectile = weaponSystem.handleRemoteShot({
          weaponType: data.weaponType,
          position: data.position,
          direction: data.direction,
          id: data.id  // Pass the server-assigned ID
        });

        // Store the server ID in the projectile for tracking
        if (projectile && projectile.userData) {
          projectile.userData.serverId = data.id;
        }
      } else {
        // For our own projectiles, we need to find them and assign the server ID
        // This will allow us to remove them correctly when the server says they hit something
        for (const weapon of weaponSystem.activeWeapons.values()) {
          for (const projectile of weapon.projectiles) {
            // If the projectile was just created, it's likely the one the server is confirming
            // We can match by approximate position
            const serverPos = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            if (projectile.position.distanceTo(serverPos) < 2.0) {
              projectile.userData = projectile.userData || {};
              projectile.userData.serverId = data.id;
              break;
            }
          }
        }
      }
    });

    // Handle projectile destruction
    this.socket.on('projectileDestroyed', async (data) => {
      if (!data.id) return; // Exit if no ID provided

      let projectileFoundAndRemoved = false;

      // 1. Check active weapons (local player's weapons)
      for (const weapon of weaponSystem.activeWeapons.values()) {
        // Assuming weapon.projectiles is iterable (e.g., a Set or Map)
        if (weapon.projectiles && typeof weapon.projectiles[Symbol.iterator] === 'function') {
          for (const projectile of weapon.projectiles) { // Iterate directly if Set, or use .values() if Map
            if (projectile.userData && projectile.userData.serverId === data.id) {
              weapon.removeProjectile(projectile); // Call remove method on the weapon instance
              projectileFoundAndRemoved = true;
              // console.log(`[Network] Removed active weapon projectile ${data.id}`);
              break; // Stop searching this weapon
            }
          }
        }
        if (projectileFoundAndRemoved) break; // Stop searching other weapons
      }

      // 2. Check template weapons (remote player projectiles)
      // Templates manage their own projectiles visually, but we might need to clean up if server confirms destruction early
      if (!projectileFoundAndRemoved) {
          for (const weaponTemplate of weaponSystem.weaponTemplates.values()) {
              // Assuming weaponTemplate.projectiles is iterable
              if (weaponTemplate.projectiles && typeof weaponTemplate.projectiles[Symbol.iterator] === 'function') {
                  for (const projectile of weaponTemplate.projectiles) { // Iterate directly if Set, or use .values() if Map
                      if (projectile.userData && projectile.userData.serverId === data.id) {
                          // Templates don't have a public removeProjectile method tied to network events
                          // Instead, remove the mesh directly from the scene
                          if (projectile.parent) { // Check if it's added to the scene
                              projectile.parent.remove(projectile);
                          }
                          // And remove from the template's internal tracking
                          weaponTemplate.projectiles.delete(projectile); // Assuming it's a Set, adjust if Map
                          projectileFoundAndRemoved = true;
                          // console.log(`[Network] Removed template weapon projectile ${data.id}`);
                          break; // Stop searching this template
                      }
                  }
              }
              if (projectileFoundAndRemoved) break; // Stop searching other templates
          }
      }


      // 3. Check turret projectiles
      if (!projectileFoundAndRemoved && weaponSystem.turretProjectiles?.has(data.id)) {
        const turretProjectileData = weaponSystem.turretProjectiles.get(data.id);
        if (turretProjectileData?.mesh && SceneManager) {
          SceneManager.remove(turretProjectileData.mesh); // Remove mesh from scene
        }
        weaponSystem.turretProjectiles.delete(data.id); // Remove from tracking map
        projectileFoundAndRemoved = true;
        console.log(`[Network] Removed turret projectile ${data.id} based on server destruction.`);

        // --- Stop Following Camera ---
        if (SceneManager?.isFollowingProjectile && SceneManager.followingProjectileData?.serverId === data.id) {
          console.log(`[Network] Projectile ${data.id} destroyed, stopping follow cam.`);
          SceneManager.stopFollowingProjectile();
        }
        // --- End Stop Following Camera ---
      }

      // If not found anywhere, log a warning (optional)
      // if (!projectileFoundAndRemoved) {
      //    console.warn(`[Network] projectileDestroyed event received for unknown/already removed projectile ID: ${data.id}`);
      // }

      // Show hit effect if projectile was destroyed due to hit
      if (data.reason === 'hit' && data.position) {
        const hitPosition = new THREE.Vector3(
          data.position.x,
          data.position.y,
          data.position.z
        );

        console.log('Server confirmed hit at position:', hitPosition);

        // Get weapon config to determine projectile color
        const { getWeaponConfig } = await import('./weapons/configs/weapon-configs.js');
        const config = getWeaponConfig(data.weaponType);
        const color = config?.projectileConfig?.color || 0xffff00; // Fallback to yellow

        // Create appropriate effect based on projectile type
        if (window.particleEffectSystem) {
          // Rockets should create explosions rather than simple collision effects
          if (data.isRocket || data.weaponType === 'rocket' || data.weaponType === 'rocketLauncher') {
            // Create a more dramatic explosion for rockets
            window.particleEffectSystem.createExplosion(hitPosition, color);

            // Play explosion sound if audio manager exists
            if (window.AudioManager) {
              window.AudioManager.playSound('explosion', hitPosition);
            }
          } else {
            // Check weapon type for specific impact effects
            if (data.weaponType === 'gatling') {
              // Use the new single-particle effect for gatling
              window.particleEffectSystem.addGatlingImpactEffect(hitPosition, color);
            } else {
              // Other projectiles get the standard collision effect
              window.particleEffectSystem.addCollisionEffect(hitPosition, color);
            }
          }
        }
      }
    });

    // Handle player left events
    this.socket.on('playerLeft', (playerId) => {
      if (Game.otherPlayers[playerId]?.mesh) {
        SceneManager.remove(Game.otherPlayers[playerId].mesh);
      }
      NameTagSystem.removeTag(playerId); // Remove name tag
      delete Game.otherPlayers[playerId];
      this.interpolationBuffer.delete(playerId);
      this.playerVelocities.delete(playerId);
    });

    // Handle player hit events
    this.socket.on('playerHit', (data) => {
      const hitPosition = new THREE.Vector3(
        data.position.x,
        data.position.y + 2, // Offset slightly above hit point for visibility
        data.position.z
      );

      // Update local player health if we were hit (INCOMING DAMAGE)
      if (data.hitPlayerId === this.socket.id) {
        Game.health = data.currentHealth;

        console.log('Player hit! Current health:', data.currentHealth, 'Was killed:', data.wasKilled);

        if (window.HUD) {
          window.HUD.updateHealth();
          // Show damage alert (optional, maybe remove if world numbers are sufficient)
          if (data.damage > 0) {
            // window.HUD.showAlert(`Damage taken: ${data.damage}`, "warning"); // Removed damage taken alert
          }
        }

        // Show RED damage number in world
        if (window.damageNumberSystem && data.damage > 0) {
          window.damageNumberSystem.showDamageNumber(
            data.damage,
            hitPosition,
            {
              color: 0xff0000 // Red for incoming (use default duration & font size)
            }
          );
        }

        // Handle death
        if (data.wasKilled) {
          Game.handleDeath(data.sourcePlayerId);
          if (window.HUD) {
            window.HUD.showAlert("YOU WERE DESTROYED", "danger");
          }
        }
      }

      // If we're the shooter, show hit confirmation (OUTGOING DAMAGE)
      if (data.sourcePlayerId === this.socket.id) {
        if (window.HUD) {
          // Show HUD alert (optional)
          // window.HUD.showAlert(`Hit! Damage: ${data.damage}`, "success"); // Removed hit damage alert

          if (data.wasKilled) {
            window.HUD.showAlert("Enemy destroyed!", "success");
          }
        }

        // Show YELLOW damage number in world
        if (window.damageNumberSystem && data.damage > 0) {
          window.damageNumberSystem.showDamageNumber(
            data.damage,
            hitPosition,
            {
              color: 0xffff00 // Yellow for outgoing (use default duration & font size)
            }
          );
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
        window.AudioManager.playGlobalEffect('explosion.wav', position);
      }
    });

    this.socket.on('playerRespawned', (data) => {
      // Find the player object (local or remote)
      let targetPlayer;
      let targetMesh;

      if (data.playerId === this.socket.id) {
        console.log('Local player respawning!');
        Game.handleRespawn(); // Handles local state reset
        targetPlayer = Game; // Local player data is directly on Game object
        targetMesh = Game.player; // Local player mesh

        if (targetMesh) {
          targetMesh.visible = true; // Make local player visible
        }

        if (window.HUD) {
          window.HUD.showAlert("SYSTEMS REBOOT COMPLETE", "success");
        }

        // Apply color to local player after respawn
        if (targetMesh && data.primaryColor) {
           console.log(`[Network] Applying color to local player after respawn: P=${data.primaryColor}`);
           Game.applyPlayerColor(targetMesh, data.primaryColor);
        } else {
           console.warn(`[Network] Missing primary color data in local player respawn event.`);
        }

        // When local player respawns, clear all other players and request updates
        // This ensures we can see all other players after respawning with proper mounts
        console.log('Refreshing all other players after local respawn');

        // Clean up existing other players (This part seems correct, keep as is)
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
        // Handle remote player respawn
        const remotePlayer = Game.otherPlayers[data.playerId];
        if (remotePlayer && remotePlayer.mesh) {
          targetPlayer = remotePlayer; // Remote player data object
          targetMesh = remotePlayer.mesh; // Remote player mesh
          targetMesh.visible = true; // Make remote player visible

          // Update position if provided
          if (data.position) {
            targetMesh.position.set(
              data.position.x,
              data.position.y,
              data.position.z
            );
          }

          // Apply color to remote player after respawn
          if (data.primaryColor) {
             console.log(`[Network] Applying color to remote player ${data.playerId} after respawn: P=${data.primaryColor}`);
             Game.applyPlayerColor(targetMesh, data.primaryColor);
             // Update stored applied color
             targetPlayer.appliedPrimaryColor = data.primaryColor;
             // targetPlayer.appliedSecondaryColor = data.secondaryColor; // Removed secondary
          } else {
             console.warn(`[Network] Missing primary color data in remote player respawn event for ${data.playerId}.`);
          }

          // If the server indicates weapons should be cleared (e.g., on respawn)
          if (data.clearWeapons && remotePlayer.mountManager) {
             console.log(`[Network] Clearing weapons for remote player ${data.playerId} due to respawn.`);
             remotePlayer.mountManager.detachAllWeapons();
          } else if (data.clearWeapons && !remotePlayer.mountManager) {
             console.warn(`[Network] Cannot clear weapons for remote player ${data.playerId}: MountManager not found.`);
          }
        }
      }
    });

    // Handle ammo updates
    this.socket.on('ammoUpdate', (data) => {
      // Find the weapon and update its ammo count
      const weapon = weaponSystem.activeWeapons.get(data.weaponId);
      if (weapon) {
        weapon.ammo = data.ammo;
        // Update HUD if the weapon is currently selected or relevant
        if (window.HUD && window.HUD.updateWeaponDisplay) {
          // Determine mount type based on weapon's mount point
          const mount = weaponSystem.mountManager.getAllMounts().find(m => m.getWeapon()?.id === data.weaponId);
          if (mount) {
            window.HUD.updateWeaponDisplay(mount.config.mountType);
          }
        }
      } else {
        console.warn(`[Network] Received ammoUpdate for unknown weapon ID: ${data.weaponId}`);
      }
    });

    // Handle weapon pickups (both initial and dropped)
    this.socket.on('weaponPickedUp', async (data) => {
      // If we're the one who picked up the weapon, we've already attached it locally
      // UNLESS the socketName is null, which means it was a dropped item collected by us
      // and the server is confirming, telling us the new weapon instance ID.
      if (data.playerId === this.socket.id && data.socketName !== null) {
        console.log(`[Network] Ignoring self-pickup confirmation for weapon ${data.weaponId} on mount ${data.socketName}`);
        return;
      }
      if (data.playerId === this.socket.id && data.socketName === null) {
        console.log(`[Network] Received confirmation for collecting dropped weapon ${data.weaponType}, new instance ID: ${data.weaponId}`);
        // We need to find the weapon we *just* attached locally (which won't have an ID yet)
        // and assign this ID. This is tricky. Maybe WeaponSystem.tryPickupAndAttach needs to return the weapon?
        // For now, we'll assume the HUD updates correctly via ammoUpdate.
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

      // Create a weapon instance (don't need to clone, factory handles it)
      const weapon = await weaponSystem.weaponFactory.createWeapon(data.weaponType);
      if (!weapon) {
        console.error('Failed to create weapon instance of type:', data.weaponType);
        return;
      }

      // Assign the weapon ID from server
      weapon.id = data.weaponId;

      // Ensure remote player has a mount manager
      if (!remotePlayer.mountManager) {
        console.log(`Creating dedicated mount manager for remote player ${data.playerId}`);
        remotePlayer.mountManager = new MountManager();
        remotePlayer.mountManager.initMounts(remotePlayer.mesh);
      }

      // Find the right mount point on the remote player using player's dedicated mount manager
      const mountPoint = remotePlayer.mountManager.getAllMounts().find(m => m.socketName === data.socketName);
      if (mountPoint) {
        console.log(`Attaching ${data.weaponType} (ID: ${weapon.id}) to remote player ${data.playerId} socket ${data.socketName}`);
        const success = mountPoint.attachWeapon(weapon); // Attach the created weapon instance
        console.log(`Remote weapon attachment result: ${success}`);

        // Apply the remote player's color to the weapon
        const remotePlayerColor = remotePlayer.appliedPrimaryColor || '#00ffff'; // Get remote player's stored color
        if (typeof weapon.applyColor === 'function') {
           // console.log(`[Network] Applying color ${remotePlayerColor} to remote player ${data.playerId}'s weapon ${weapon.type}`); // Less verbose log
           weapon.applyColor(remotePlayerColor);
        }

      } else {
        console.error(`Mount point with socket ${data.socketName} not found on remote player ${data.playerId}`);
        // Debug: log available mount points
        const allMounts = remotePlayer.mountManager?.getAllMounts() || [];
        console.log(`Available mounts for remote player ${data.playerId}:`, allMounts.map(m => ({ id: m.id, socketName: m.socketName })));
      }
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

    // Handle creation of dropped weapon pickups
    this.socket.on('droppedWeaponCreated', (data) => {
        console.log(`[Network] Received droppedWeaponCreated: ID=${data.pickupId}, Type=${data.weaponType}`);
        if (Game.weaponSpawnManager && data.pickupId && data.weaponType && data.position) {
            // Convert position data if necessary (assuming it's {x, y, z})
            const position = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
            // Call the existing spawnWeaponPickup function with the server data
            // It expects an object matching the structure { id, weaponType, position }
            Game.weaponSpawnManager.spawnWeaponPickup({
                id: data.pickupId,
                weaponType: data.weaponType,
                position: position // Pass the Vector3 object
            });
        } else {
            console.warn('[Network] Invalid data or WeaponSpawnManager not ready for droppedWeaponCreated event.');
        }
    });

    // Handle removal of ANY pickup item (initial spawn or dropped)
    this.socket.on('pickupRemoved', (data) => {
        console.log(`[Network] Received pickupRemoved: ID=${data.pickupId}, Type=${data.type}`);
        if (Game.weaponSpawnManager && data.pickupId) {
            Game.weaponSpawnManager.removePickup(data.pickupId);
        } else {
            console.warn('[Network] Invalid data or WeaponSpawnManager not ready for pickupRemoved event.');
        }
    });

    // Handle ammo refill confirmation from server
    this.socket.on('ammoRefillResult', (data) => {
        console.log(`[Network] Received ammoRefillResult: Success=${data.success}, Message=${data.message}`);
        if (data.success) {
            // Trigger the local ammo refill logic in WeaponSystem
            if (weaponSystem) {
                weaponSystem.refillAllAmmo(); // This handles HUD updates internally
            } else {
                console.error("[Network] WeaponSystem not available to handle ammoRefillResult.");
            }
        } else {
            // Show error message?
            if (window.HUD) window.HUD.showAlert("AMMO REFILL FAILED", "error");
        }
    });


    // Handle kill feed notifications
    this.socket.on('killNotification', (data) => {
      console.log('[Network] Received kill notification:', data);
      if (data.killerName && data.victimName) {
        // Add to game kill log
        if (Game.killLog) {
          Game.killLog.push({ killerName: data.killerName, victimName: data.victimName });
          // Optional: Limit log size if needed
          // if (Game.killLog.length > 50) Game.killLog.shift();
        } else {
          console.warn('[Network] Game.killLog not initialized.');
        }

        // Display in HUD comms window
        if (window.HUD) {
          window.HUD.showKillFeed(data.killerName, data.victimName);
        } else {
          console.warn('[Network] HUD not available for kill notification display.');
        }
      } else {
         console.warn('[Network] Missing data for kill notification.');
      }
    });

    // Handle confirmation that turret teleport is complete
    this.socket.on('turretTeleportComplete', (data) => {
      console.log('[Network] Received turretTeleportComplete:', data);
      if (data.position && Game?.handleTurretTeleportComplete) {
        // Convert position data to THREE.Vector3
        const finalPosition = new THREE.Vector3(
          data.position.x,
          data.position.y,
          data.position.z
        );
        Game.handleTurretTeleportComplete(finalPosition);
      } else {
        console.warn('[Network] Invalid data or Game.handleTurretTeleportComplete not found.');
      }
    });
  },

  sendMove(moveData) {
    if (this.socket?.connected) {
      this.socket.emit('move', moveData);
    }
  },

  sendPlayerCustomization(userData) { // Changed parameter name
    if (!this.socket) {
      console.error("Network: Cannot send customization, socket not initialized.");
      return;
    }
    // Validate userData structure (optional but good practice)
    if (!userData || typeof userData.primary !== 'string' || typeof userData.name !== 'string') {
        console.error("[Network] Invalid userData format for sendPlayerCustomization:", userData);
        // Send default data or handle error appropriately
        const defaultData = { primary: '#00ffff', name: 'MechPilot' };
        console.warn("[Network] Sending default customization data due to invalid input.");
        this.socket.emit('playerCustomization', defaultData);
        return;
    }
    console.log("[Network] Sending player customization:", userData);
    this.socket.emit('playerCustomization', userData); // Send the full object
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

  // Send notification that the local player has died
  sendPlayerDeath(data) {
    if (this.socket?.connected) {
      console.log('Sending player death notification to server:', data);
      // Ensure data includes necessary info, e.g., killerId
      this.socket.emit('playerDeath', data);
    } else {
      console.warn('Cannot send player death notification, socket not connected.');
    }
  },

  // Send notification that a weapon was dropped
  sendWeaponDrop(data) {
    if (this.socket?.connected) {
      console.log('Sending weapon drop notification to server:', data);
      // Ensure data includes mountId, weaponType, position
      this.socket.emit('weaponDrop', data);
    } else {
      console.warn('Cannot send weapon drop notification, socket not connected.');
    }
  },

  // Send notification that the local player collected a pickup (weapon or ammo)
  sendPickupCollected(data) {
    if (this.socket?.connected) {
      console.log('Sending pickup collected notification to server:', data);
      // Ensure data includes pickupId
      this.socket.emit('pickupCollected', data);
    } else {
      console.warn('Cannot send pickup collected notification, socket not connected.');
    }
  },

  // Send request to teleport player after turret shot hits terrain
  sendTurretTeleportRequest(targetPosition) {
    if (this.socket?.connected) {
      console.log('[Network] Sending turret teleport request to:', targetPosition);
      this.socket.emit('turretTeleportRequest', { position: targetPosition });
    } else {
      console.warn('[Network] Cannot send turret teleport request, socket not connected.');
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
