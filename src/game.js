import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SceneManager } from './scene.js';
import { weaponSystem } from './weapons/index.js';
import { PlayerAnimations } from './player-animations.js';
import { NameTagSystem } from './systems/NameTagSystem.js'; // Import NameTagSystem
import { DebugTools } from './debug-tools.js';
import { WeaponOrientationDebugger } from './debug-tools/weapon-orientation-debugger.js';
import { Network } from './network.js';
import { WeaponSpawnManager } from './weaponSpawnManager.js'; // Import WeaponSpawnManager
import { TerrainGenerator } from './terrainGenerator.js';
import { HUD } from './hud/index.js';
import { MobileControlsManager } from './mobileControls/MobileControlsManager.js'; // Import MobileControlsManager

const PLATFORM_Y_POSITION = 100; // Match scene.js and server/models/player.js (Increased height)
const TURRET_INTERACTION_RANGE = 8.0; // Increased Max distance to interact with the turret

export const Game = {
  player: null,
  otherPlayers: {},
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  // isRunning: false, // Removed sprint
  mechModel: null,
  mixer: null,
  actions: {},
  currentAction: null,
  previousPosition: null,
  weaponOrientationDebugger: null,
  weaponSpawnManager: null, // Add property for the manager
  killLog: [], // Added kill log array

  // Player stats for HUD
  health: 200, // Initialize to maxHealth
  maxHealth: 200, // Updated to match the intended max health
  isDead: false,
  respawnPosition: new THREE.Vector3(0, PLATFORM_Y_POSITION + 2, -250), // Set respawn Z to match platform edge

  // Network and prediction properties
  inputBuffer: [],
  stateHistory: [],
  lastProcessedInputId: 0,
  inputSequence: 0,
  networkUpdateRate: 60, // Updates per second
  lastNetworkUpdate: 0,

  // Pickup state
  pickupTarget: null, // Stores info about the pickup item being targeted { id, type, weaponType?, model, distance, config? }
  isContextMenuActive: false, // Flag to disable camera controls (still needed, set by MobileControlsManager)
  isEKeyDown: false, // Track E key state for hold detection
  eKeyHoldTimeout: null, // Timer for E key hold
  eKeyHoldTriggered: false, // Flag if hold action was triggered
  eKeyHoldDuration: 500, // ms hold time (match mobile)
  contextMenuClickListener: null, // Store reference to the click listener
  isNearTurret: false, // Flag if player is close enough to interact

  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new GLTFLoader();
      loader.load('assets/models/Mech-norootmotion.glb', (gltf) => {
        const model = gltf.scene;
        console.log('Loaded mech model with animations:', gltf.animations);


        // Set up animations
        this.mixer = new THREE.AnimationMixer(model);
        this.actions = {};

        gltf.animations.forEach((clip) => {
          const action = this.mixer.clipAction(clip);
          this.actions[clip.name] = action;
          console.log(`Registered animation action: ${clip.name}`);
        });

        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        this.mechModel = model;
        resolve(model);
      });
    });
  },

  async init(socket, userData) { // Accept userData object { primary, name }
    await this.loadMechModel();

    // Create player using the same system as remote players, but specify it's the local player
    const playerData = PlayerAnimations.createPlayerMesh(this.mechModel, this.actions, true);
    this.player = playerData.mesh;
    // In Game.init() after creating player:
    this.player.userData = { id: socket.id };

    // Apply chosen color and name from userData
    const playerName = userData?.name || 'MechPilot'; // Default name if missing
    const playerPrimaryColor = userData?.primary || '#00ffff'; // Default color if missing

    console.log(`[GAME] Initializing local player. Name: "${playerName}", Color: ${playerPrimaryColor}`);
    this.applyPlayerColor(this.player, playerPrimaryColor);
    this.localPlayerPrimaryColor = playerPrimaryColor; // Store local player's color

    // Initialize weapon system first
    console.log('[GAME] Initializing weapon system...');
    await weaponSystem.init(this.player);

    // NOW initialize the debugger, ensuring mountManager exists
    // this.weaponOrientationDebugger = new WeaponOrientationDebugger();

    // Preload all weapon models
    console.log('[GAME] Preloading weapon models...');
    await weaponSystem.weaponFactory.preloadWeaponModels();
    console.log('[GAME] Weapon models preloaded successfully');

    // Add colliders to the local player's mesh
    this.player.colliders = {
        body: new Collider('capsule', {
            height: 4.0,
            radius: 1,
            offset: new THREE.Vector3(0, 2, 0)
        }),
        cabin: new Collider('sphere', {
            radius: 0.7,
            offset: new THREE.Vector3(0, 4, 0)
        })
    };
    this.mixer = playerData.mixer;
    this.actions = playerData.actions;
    this.currentAction = null;

    // Initialize weapon system first (redundant call removed)
    // console.log('[GAME] Initializing weapon system...');
    // await weaponSystem.init(this.player);

    // Preload all weapon models (redundant call removed)
    // console.log('[GAME] Preloading weapon models...');
    // await weaponSystem.weaponFactory.preloadWeaponModels();
    // console.log('[GAME] Weapon models preloaded successfully');

    // Set initial player position slightly above platform height at the new location
    this.player.position.set(0, PLATFORM_Y_POSITION + 2, -250); // Updated Z, kept +2 offset
    this.previousPosition = this.player.position.clone();

    // Add identifying properties to help with weapon parent checks
    this.player.isPlayerModel = true;
    this.player.name = "PlayerMech"; // Internal name, not display name

    // Add player to scene after weapon system is initialized
    SceneManager.add(this.player);

    // Add name tag for the local player using the chosen name
    console.log(`[GAME] Adding name tag for local player (${socket.id}) with name "${playerName}"`);
    NameTagSystem.addTag(socket.id, playerName);
    // Update the local player's name tag position immediately
    NameTagSystem.updateTagPosition(socket.id, this.player);


    // Initialize and use WeaponSpawnManager
    console.log('[GAME] Initializing WeaponSpawnManager...');
    // Ensure TerrainGenerator is initialized before passing it
    if (!TerrainGenerator.isInitialized) {
        console.error("[GAME] TerrainGenerator not initialized before creating WeaponSpawnManager!");
        // Handle error appropriately, maybe wait or throw
    } else {
        this.weaponSpawnManager = new WeaponSpawnManager(SceneManager, TerrainGenerator);
        console.log('[GAME] WeaponSpawnManager initialized.');

        // Check if initial pickup state arrived before manager was ready
        if (Network.pendingInitialPickups) {
            console.log('[GAME] Processing pending initial pickup state...');
            this.weaponSpawnManager.spawnAllPickups(Network.pendingInitialPickups);
            Network.pendingInitialPickups = null; // Clear pending data
        } else {
            console.log('[GAME] Waiting for initial pickup state from server...');
        }
    }

    // Initialize player stats for HUD
    this.health = this.maxHealth;

    // Initialize HUD
    HUD.init();

    // Show welcome messages after a short delay
    setTimeout(() => {
      if (window.HUD) {
        window.HUD.showAlert("MECH SYSTEMS ONLINE", "info");
        setTimeout(() => {
          window.HUD.addMessage("Welcome to Robo Royale. Controls: WASD to move."); // Removed SHIFT mention
          setTimeout(() => {
            window.HUD.addMessage("Left-click to fire when weapon is equipped.");
            setTimeout(() => {
              window.HUD.addMessage("Find the cannon on the battlefield to arm your mech.");
            }, 1500);
          }, 1500);
        }, 1000);
      }
    }, 1000);

    // Input handling (Keyboard - WASD, Shift)
    document.addEventListener('keydown', (event) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyA': this.moveLeft = true; break;
        case 'KeyD': this.moveRight = true; break;
        // case 'ShiftLeft': // Removed sprint
        // case 'ShiftRight': this.isRunning = true; break; // Removed sprint
        case 'KeyE':
          if (!this.isEKeyDown) { // Prevent multiple triggers if key is held down
            this.isEKeyDown = true;
            this.eKeyHoldTriggered = false; // Reset hold trigger flag
            clearTimeout(this.eKeyHoldTimeout); // Clear any existing timer

            // Start the hold timer ONLY if not near the turret and a weapon pickup is targeted
            if (!this.isNearTurret && this.pickupTarget?.type === 'weapon') {
                this.eKeyHoldTimeout = setTimeout(() => {
                  if (this.isEKeyDown) { // Check if key is still held
                    console.log("[GAME] E key hold detected for weapon context menu.");
                    this.eKeyHoldTriggered = true; // Mark hold as triggered
                    this.triggerKeyboardContextMenu(); // Call the context menu function
                  }
                }, this.eKeyHoldDuration);
            } else if (this.isNearTurret) {
                console.log("[GAME] E key down near turret, hold disabled.");
            } else {
                 console.log("[GAME] E key down, but no weapon target for hold menu.");
            }
          }
          break;
      }
    });
    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'KeyW': this.moveForward = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyA': this.moveLeft = false; break;
        case 'KeyD': this.moveRight = false; break;
        // case 'ShiftLeft': // Removed sprint
        // case 'ShiftRight': this.isRunning = false; break; // Removed sprint
        case 'KeyE':
          this.isEKeyDown = false; // Mark key as up
          clearTimeout(this.eKeyHoldTimeout); // Clear the hold timer

          // If the hold action *wasn't* triggered (i.e., it was a tap)
          if (!this.eKeyHoldTriggered) {
            // --- Turret Interaction Logic (takes precedence) ---
            if (this.isNearTurret) {
                console.log("[GAME] 'E' key tap detected near turret.");
                if (SceneManager.isControllingTurret) {
                    SceneManager.exitTurretControl(this.player);
                    // Interaction prompt will be shown again by the proximity check next frame if still in range
                } else {
                    SceneManager.enterTurretControl(this.player);
                    // Hide interaction prompt immediately when entering
                    if (window.HUD?.hideInteractionPrompt) window.HUD.hideInteractionPrompt();
                }
            // --- Weapon Pickup Logic (fallback if not near turret) ---
            } else if (this.pickupTarget && !this.isContextMenuActive && !SceneManager.isControllingTurret) { // Ensure not controlling turret
                console.log(`[GAME] 'E' key tap detected for target: ${this.pickupTarget.type} (ID: ${this.pickupTarget.id})`);
                const pickupType = this.pickupTarget.type;

                if (pickupType === 'weapon') {
                    // Trigger Quick Attach
                    weaponSystem.tryPickupAndAttach(this.pickupTarget).then(success => {
                        if (success) {
                            console.log(`[GAME] Keyboard quick weapon pickup successful.`);
                            this.pickupTarget = null; // Clear target after successful pickup
                            if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge(); // Hide badge
                        } else {
                            console.log(`[GAME] Keyboard quick weapon pickup failed.`);
                        }
                    }).catch(error => {
                       console.error(`[GAME] Error during keyboard quick weapon pickup:`, error);
                    });
                }
                // Note: Ammo pickup is handled by collision, so 'E' tap only handles weapons.
            }
          }
          // If the hold action *was* triggered (weapon context menu), releasing E now dismisses without selection
          else if (this.eKeyHoldTriggered) {
              console.log("[GAME] Context menu dismissed via E key release.");
              // Ensure listener is removed if key is released before click
              if (this.contextMenuClickListener) {
                  document.removeEventListener('click', this.contextMenuClickListener, { capture: true });
                  this.contextMenuClickListener = null;
                  console.log("[GAME] Removed context menu click listener on E key release.");
              }
              window.HUD.hideWeaponContextMenu();
              this.isContextMenuActive = false;
              if (document.pointerLockElement !== document.body) {
                  document.body.requestPointerLock(); // Re-acquire pointer lock
              }
          }
          // Reset the hold trigger flag (always reset)
          this.eKeyHoldTriggered = false;
          break;
      }
    });
  },

  // Removed handlePickupKeyDown and handlePickupKeyUp - logic moved to update loop and MobileControlsManager

  handleDeath(killerPlayerId) {
    this.isDead = true;

    // Store current position as respawn position
    this.respawnPosition.copy(this.player.position);

    // Clear movement states
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    // this.isRunning = false; // Removed sprint

    // Notify the server about the death. The server should handle weapon dropping & removal.
    console.log("[GAME] Player died. Notifying server...");
    Network.sendPlayerDeath({ killerId: killerPlayerId }); // Assuming Network has this method

    // Client-side cleanup (might be redundant if server confirms removal, but good for immediate feedback)
    // We keep this for now, but the authoritative removal happens server-side.
    if (weaponSystem) {
         console.log("[GAME] Performing client-side weapon removal after death notification.");
         weaponSystem.removeAllPlayerWeapons();
    } else {
        console.warn("[GAME] WeaponSystem not available during handleDeath for client-side cleanup.");
    }

    // NOTE: Spawning dropped weapons is now handled by receiving messages from the server
    // based on the server's authoritative action after processing the death event.

    // Hide player model (actual hiding is done in the network handler
    // since we need to sync it with the explosion effect)
  },

  handleRespawn() {
    console.log('Player respawning!');
    this.isDead = false;
    this.health = this.maxHealth;

    // Reset position slightly above the platform respawn point at the new location
    this.player.position.set(0, PLATFORM_Y_POSITION + 2, -250); // Updated Z, kept +2 offset
    this.respawnPosition.set(0, PLATFORM_Y_POSITION + 2, -250); // Ensure respawnPosition is also updated with offset and new Z

    // Make player visible again (actual showing is done in the network handler
    // to ensure proper synchronization)

    // Clear any pending inputs
    this.inputBuffer = [];
    this.stateHistory = [];

    // Ensure local weapons are cleared on respawn
    if (weaponSystem) {
        console.log("[GAME] Clearing local weapons on respawn.");
        weaponSystem.removeAllPlayerWeapons();
    } else {
        console.warn("[GAME] WeaponSystem not available during handleRespawn.");
    }

    // Add visual effect
    if (window.HUD) {
      window.HUD.showAlert("SYSTEMS REBOOT COMPLETE", "success");
    }
  },

  update(deltaTime) {
    if (!this.mixer || !this.player) {
      console.warn('Update called before initialization completed');
      return null;
    }

    // Update local player's animation mixer
    this.mixer.update(deltaTime);

    // --- Turret Proximity Check & Interaction Prompt ---
    this.isNearTurret = false; // Reset flag each frame
    if (SceneManager.turretMesh && this.player && !this.isDead) {
        const playerPos = this.player.position;
        const turretPos = SceneManager.turretMesh.position;
        const distanceToTurret = playerPos.distanceTo(turretPos);

        if (distanceToTurret <= TURRET_INTERACTION_RANGE) {
            this.isNearTurret = true;
            // Show prompt only if *not* currently controlling the turret
            if (!SceneManager.isControllingTurret && window.HUD?.showInteractionPrompt) {
                // Check if it's already visible to avoid unnecessary calls
                // Accessing elements via the exported HUD object
                if (HUD.elements?.interactionPrompt?.style.display !== 'block') {
                    window.HUD.showInteractionPrompt("Press E to use Turret");
                }
            }
        } else {
            // If we were near the turret last frame but aren't now, hide the prompt
            // Also hide if we *are* controlling the turret (prompt shouldn't show then)
            if (window.HUD?.hideInteractionPrompt && HUD.elements?.interactionPrompt?.style.display === 'block') {
                 window.HUD.hideInteractionPrompt();
            }
        }
    }
    // --- End Turret Proximity Check ---


    // --- Pickup Target Detection & Badge (Only if not near turret or controlling turret) ---
    // We don't want weapon pickup prompts/badges if near the turret interaction zone
    if (this.weaponSpawnManager && !this.isDead && !this.isContextMenuActive && !this.isNearTurret && !SceneManager.isControllingTurret) {
        const playerWorldPos = new THREE.Vector3();
        this.player.getWorldPosition(playerWorldPos);
        const pickupRange = 4.0; // Keep original weapon pickup range
        const nearestPickup = this.weaponSpawnManager.findNearestPickup(playerWorldPos, pickupRange);

        if (nearestPickup) {
            // If we weren't targeting this before, or weren't targeting anything
            if (!this.pickupTarget || this.pickupTarget.id !== nearestPickup.id) {
                this.pickupTarget = nearestPickup; // Store as current target
                // Attempt to get config data for the badge
                const pickupDataWithConfig = this.weaponSpawnManager.getPickupById(this.pickupTarget.id);
                this.pickupTarget.config = pickupDataWithConfig?.config || {}; // Add config to target

                // Show badge
                if (this.pickupTarget.model && SceneManager.camera && window.HUD?.showItemBadge) {
                    const screenPos = this.worldToScreen(this.pickupTarget.model.position, SceneManager.camera);
                    if (screenPos) {
                        const badgeInfo = {
                            type: this.pickupTarget.weaponType || this.pickupTarget.type,
                            config: this.pickupTarget.config,
                        };
                        window.HUD.showItemBadge(badgeInfo, screenPos);
                    } else {
                        window.HUD.hideItemBadge(); // Hide if off-screen
                    }
                }
            } else {
                // Already targeting this pickup, just update badge position
                 if (this.pickupTarget.model && SceneManager.camera && window.HUD?.showItemBadge) {
                    const screenPos = this.worldToScreen(this.pickupTarget.model.position, SceneManager.camera);
                     if (screenPos) {
                         // Re-show/update position (showItemBadge handles positioning)
                         const badgeInfo = { type: this.pickupTarget.weaponType || this.pickupTarget.type, config: this.pickupTarget.config };
                         window.HUD.showItemBadge(badgeInfo, screenPos);
                     } else {
                         window.HUD.hideItemBadge();
                     }
                 }
            }
        } else {
            // No pickup nearby
            if (this.pickupTarget) {
                // If we were targeting something, hide the badge and clear target
                if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();
                this.pickupTarget = null;
            }
        }
    } else if (this.pickupTarget) {
        // If dead or context menu is active, ensure badge is hidden
        if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();
        // Don't clear pickupTarget here, context menu might need it
    }
    // --- End Pickup Target Detection & Badge ---


    // Update weapon spawn manager (for animations like rotation)
    if (this.weaponSpawnManager) {
      this.weaponSpawnManager.update(deltaTime);
    }

    // Update other player animations
    Object.values(this.otherPlayers).forEach(player => {
      if (player.mixer) {
        player.mixer.update(deltaTime);

        // Check if the player position has changed
        const movementThreshold = 0.02; // Use a single threshold now
        const positionChanged = player.previousPosition &&
          player.mesh.position.distanceTo(player.previousPosition) > movementThreshold;

        // Track the time of the last detected movement
        if (positionChanged) {
          player.lastMovementTime = Date.now();
        }

        // Consider a player definitively stopped if no movement for 250ms
        const movementTimeout = 250; // ms
        const hasStoppedMoving = !player.lastMovementTime ||
          (Date.now() - player.lastMovementTime > movementTimeout);

        // Updated logic
        let isMoving;

        if (player.isMoving) {
          // If server says they're moving, consider them moving until timeout
          isMoving = !hasStoppedMoving || positionChanged;
        } else {
          // If server says they're not moving, still allow local detection of movement
          isMoving = positionChanged && !hasStoppedMoving;
        }

        // Update animation using unified system
        PlayerAnimations.updateAnimation(player, isMoving);

        // Store position for next frame
        if (player.previousPosition) {
          player.previousPosition.copy(player.mesh.position);
        } else {
          player.previousPosition = player.mesh.position.clone();
        }

        // Update name tag position
        NameTagSystem.updateTagPosition(player.mesh.playerId, player.mesh);
      }
    });

    weaponSystem.update(deltaTime); // Includes handling mobile fire/swap buttons

    // --- Handle Mobile Pickup Button Tap ---
    const mobileInput = MobileControlsManager.getInputState(); // Get fresh state
    if (mobileInput.buttonStates.pickup && this.pickupTarget && !this.isContextMenuActive) {
        console.log(`[GAME] Mobile pickup button tapped for target: ${this.pickupTarget.type} (ID: ${this.pickupTarget.id})`);
        const pickupId = this.pickupTarget.id;
        const pickupType = this.pickupTarget.type;

        if (pickupType === 'weapon') {
            // Trigger Quick Attach
            weaponSystem.tryPickupAndAttach(this.pickupTarget).then(success => {
                if (success) {
                    console.log(`[GAME] Mobile quick weapon pickup successful.`);
                    this.pickupTarget = null; // Clear target after successful pickup
                    if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge(); // Hide badge
                } else {
                    console.log(`[GAME] Mobile quick weapon pickup failed.`);
                }
            }).catch(error => {
                 console.error(`[GAME] Error during mobile quick weapon pickup:`, error);
            });
        }
        // Reset the pickup button state in the manager immediately after processing tap
        // Note: Ammo pickup is now handled by collision, so the button only handles weapons.
        MobileControlsManager.buttonStates.pickup = false;
    }
    // --- End Handle Mobile Pickup Button Tap ---

    // --- Automatic Ammo Pickup on Collision ---
    if (this.weaponSpawnManager && !this.isDead) {
        const playerPos = this.player.position;
        for (const [pickupId, pickup] of this.weaponSpawnManager.activePickups.entries()) {
            if (pickup.type === 'ammo') {
                // Use a slightly smaller radius for collision to feel more like "walking over"
                const collisionRadius = pickup.collider.radius * 0.8;
                if (playerPos.distanceTo(pickup.collider.center) < collisionRadius) {
                    console.log(`[GAME] Player collided with ammo box (ID: ${pickupId}). Refilling ammo.`);

                    // 1. Refill ammo locally
                    if (weaponSystem) {
                        weaponSystem.refillAllAmmo(); // Handles HUD updates
                    }

                    // 2. Notify server
                    Network.sendPickupCollected({ pickupId: pickupId });

                    // 3. Remove pickup locally
                    this.weaponSpawnManager.removePickup(pickupId);

                    // 4. Clear target if it was this ammo box
                    if (this.pickupTarget && this.pickupTarget.id === pickupId) {
                        this.pickupTarget = null;
                        if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();
                    }

                    // Break after collecting one ammo box per frame
                    break;
                }
            }
        }
    }
    // --- End Automatic Ammo Pickup ---


    // Update camera and process input
    // Pass player position and model. If controlling turret, player position might not be relevant for camera logic itself,
    // but SceneManager handles the switch internally.
    const cameraDirections = SceneManager.updateCamera(this.player.position, this.player);

    // Process movement input ONLY if not controlling the turret
    if (!SceneManager.isControllingTurret) {
        return this.processInput(cameraDirections, deltaTime);
    } else {
        // If controlling turret, don't process player movement input.
        // Still need to update animations? Maybe force idle?
        PlayerAnimations.updateAnimation(this, false); // Force idle animation
        // Send minimal network update? Or none? Let's send none for now.
        return null; // Indicate no movement data to send
    }
  },

  createPlayerMesh(id) {
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }

    const playerData = PlayerAnimations.createPlayerMesh(this.mechModel, this.actions);

    // Add compound colliders
    playerData.mesh.colliders = {
      body: new Collider('capsule', {
        height: 4.0,
        radius: 1,
        offset: new THREE.Vector3(0, 2, 0)
      }),
      cabin: new Collider('sphere', {
        radius: 0.7,
        offset: new THREE.Vector3(0, 4, 0)
      })
    };

    // Store player ID on mesh for debugging
    playerData.mesh.playerId = id;
    playerData.mesh.isRemotePlayer = true;

    // Add to scene
    SceneManager.add(playerData.mesh);

    return playerData;
  },

  updateOtherPlayer(playerData) {
    // console.log(`[GAME] updateOtherPlayer called for ID: ${playerData.id}`, playerData); // Removed log
    let player = this.otherPlayers[playerData.id];
    let isNewPlayer = false; // Flag to track if player was just created

    if (!player) {
      isNewPlayer = true;
      // Create new player
      player = this.createPlayerMesh(playerData.id);
      if (!player) return;

      this.otherPlayers[playerData.id] = player;
      // Initialize properties for new player
      player.previousPosition = new THREE.Vector3();
      player.isMoving = false;
      player.lastMovementTime = 0;
      player.appliedPrimaryColor = null; // Initialize applied color
      player.currentName = null; // Initialize current name

      // Create a dedicated mount manager for this remote player
      console.log(`Creating dedicated mount manager for remote player ${playerData.id}`);
      const MountManager = weaponSystem.mountManager.constructor;
      player.mountManager = new MountManager();
      player.mountManager.initMounts(player.mesh);
      // console.log(`Mount initialization for remote player result: ${mountsInitialized}`); // Less verbose log

      // Request weapon data for new player
      if (Network.socket && Network.socket.connected) {
        // console.log(`Requesting weapon data for player ${playerData.id}`); // Less verbose log
        Network.socket.emit('requestPlayerWeapons', { playerId: playerData.id });
      }
    } // End of if (!player) block


    // --- Apply NAME updates (for new and existing players) ---
    const receivedName = playerData.name || `Player_${playerData.id.slice(-4)}`; // Use default if missing
    // Update tag if name is new, different, or wasn't set initially
    if (receivedName && player.currentName !== receivedName) {
        console.log(`[GAME] ${isNewPlayer ? 'Adding' : 'Updating'} name tag for player ${playerData.id} to "${receivedName}"`);
        NameTagSystem.addTag(playerData.id, receivedName); // Add or update tag
        player.currentName = receivedName; // Store/update the current name
    } else if (isNewPlayer && !playerData.name) {
        // Handle case where new player joins but name is missing in first update
        const defaultName = `Player_${playerData.id.slice(-4)}`;
        console.warn(`[GAME] Player data for new player ${playerData.id} missing name. Using default: "${defaultName}"`);
        // Ensure tag is added if it wasn't already (e.g., if receivedName was initially null/empty)
        if (!NameTagSystem.tags.has(playerData.id)) {
             NameTagSystem.addTag(playerData.id, defaultName);
        }
        player.currentName = defaultName; // Store the default name
    }


    // --- Apply color updates (for new and existing players) ---
    const receivedColor = playerData.primaryColor || '#00ffff'; // Use default if missing
    // Update color if it's new, different, or wasn't set initially
    if (receivedColor && player.appliedPrimaryColor !== receivedColor) {
        console.log(`[GAME] ${isNewPlayer ? 'Applying' : 'Updating'} color for player ${playerData.id}: ${receivedColor}`);
        this.applyPlayerColor(player.mesh, receivedColor);
        player.appliedPrimaryColor = receivedColor; // Store/update applied color

        // Also update color of existing weapons if color changed
        if (!isNewPlayer && player.mountManager) {
            console.log(`[GAME] Re-applying updated color ${receivedColor} to weapons of player ${playerData.id}`);
            player.mountManager.getAllMounts().forEach(mount => {
                const weapon = mount.getWeapon();
                if (weapon && typeof weapon.applyColor === 'function') {
                    weapon.applyColor(receivedColor);
                }
            });
        }
    } else if (isNewPlayer && !player.appliedPrimaryColor) {
        // Ensure default color is applied if none received initially
        console.log(`[GAME] Applying default color for new player ${playerData.id}: ${receivedColor}`);
        this.applyPlayerColor(player.mesh, receivedColor);
        player.appliedPrimaryColor = receivedColor;
    }


    // Store previous position for movement detection
    if (player.mesh) {
      if (!player.previousPosition) {
        player.previousPosition = player.mesh.position.clone();
      } else {
        player.previousPosition.copy(player.mesh.position);
      }
    }

    // Update target position/rotation for interpolation
    player.targetPosition = new THREE.Vector3(
      playerData.position.x,
      playerData.position.y,
      playerData.position.z
    );

    player.targetRotation = new THREE.Quaternion(
      playerData.rotation.x,
      playerData.rotation.y,
      playerData.rotation.z,
      playerData.rotation.w
    );

    // Update movement state for animations
    if (playerData.moveState) {
      player.moveForward = playerData.moveState.moveForward;
      player.moveBackward = playerData.moveState.moveBackward;
      player.moveLeft = playerData.moveState.moveLeft;
      player.moveRight = playerData.moveState.moveRight;
      // player.isRunning = playerData.moveState.isRunning; // Removed sprint

      // Track previous movement state
      const wasMoving = player.isMoving;

      // Calculate if player is actually moving based on state
      player.isMoving = (
        playerData.moveState.moveForward ||
        playerData.moveState.moveBackward ||
        playerData.moveState.moveLeft ||
        playerData.moveState.moveRight
      );

      // If movement state changes from moving to stopped, force animation update
      if (wasMoving && !player.isMoving) {
        // Reset last movement time to force idle animation immediately
        player.lastMovementTime = 0;
      }
    }

    return player;
  },

  // Apply input without side effects
  applyInput(input, cameraDirections) {
    const { forward, right } = cameraDirections;
    const baseSpeed = 8.0; // Increased base speed, removed sprint multiplier
    let speed = baseSpeed * input.deltaTime;

    // Calculate movement vector based on input
    const moveVector = new THREE.Vector3();

    if (input.moveForward) moveVector.add(forward.clone().multiplyScalar(speed));
    if (input.moveBackward) moveVector.add(forward.clone().multiplyScalar(-speed));
    if (input.moveLeft) moveVector.add(right.clone().multiplyScalar(-speed));
    if (input.moveRight) moveVector.add(right.clone().multiplyScalar(speed));

    return moveVector;
  },

  processInput(cameraDirections, deltaTime) {
    // Don't process input if player is dead OR controlling turret
    if (this.isDead || SceneManager.isControllingTurret) {
      // Ensure animation is idle if controlling turret
      if (SceneManager.isControllingTurret) {
          PlayerAnimations.updateAnimation(this, false);
      }
      return null;
    }

    // Get mobile input state
    const mobileInput = MobileControlsManager.getInputState();

    // Determine movement based on mobile or keyboard input
    let finalMoveForward = this.moveForward;
    let finalMoveBackward = this.moveBackward;
    let finalMoveLeft = this.moveLeft;
    let finalMoveRight = this.moveRight;
    // let finalIsRunning = this.isRunning; // Removed sprint

    let moveVector = new THREE.Vector3();
    let moved = false;

    if (mobileInput.moveVector.lengthSq() > 0.01) { // Use joystick if active
        const { forward, right } = cameraDirections;
        const baseSpeed = 8.0; // Use new base speed for mobile too
        const speed = baseSpeed * deltaTime;
        // Use joystick vector directly (already normalized)
        moveVector.add(forward.clone().multiplyScalar(mobileInput.moveVector.y * speed));
        moveVector.add(right.clone().multiplyScalar(mobileInput.moveVector.x * speed));
        moved = true;
        // Override keyboard states if joystick is used (optional, prevents conflicts)
        finalMoveForward = mobileInput.moveVector.y > 0.1;
        finalMoveBackward = mobileInput.moveVector.y < -0.1;
        finalMoveLeft = mobileInput.moveVector.x < -0.1;
        finalMoveRight = mobileInput.moveVector.x > 0.1;

    } else { // Fallback to keyboard if joystick is centered
        const keyboardInput = {
            deltaTime: deltaTime,
            moveForward: this.moveForward,
            moveBackward: this.moveBackward,
            moveLeft: this.moveLeft,
            moveRight: this.moveRight,
            // isRunning: this.isRunning, // Removed sprint
        };
        moveVector = this.applyInput(keyboardInput, cameraDirections);
        if (moveVector.lengthSq() > 0) {
            moved = true;
        }
    }

     // Create the input object AFTER determining final movement states
     const input = {
        id: this.inputSequence++,
        deltaTime: deltaTime,
        moveForward: finalMoveForward,
        moveBackward: finalMoveBackward,
        moveLeft: finalMoveLeft,
        moveRight: finalMoveRight,
        // isRunning: finalIsRunning, // Removed sprint
        timestamp: Date.now()
    };
    this.inputBuffer.push(input);


    // Apply the calculated moveVector
    if (moved && !this.isDead) {
      // moved = true; // This line is redundant
      this.player.position.add(moveVector);
      // Adjust player height based on platform or terrain using the renamed function
      const groundHeight = SceneManager.getPlatformOrTerrainHeight(this.player.position.x, this.player.position.z);
      this.player.position.setY(groundHeight);
    } else if (!this.isDead) {
      // Ensure player stays on platform/terrain even when not moving (e.g., after respawn) using the renamed function
      const groundHeight = SceneManager.getPlatformOrTerrainHeight(this.player.position.x, this.player.position.z);
      if (Math.abs(this.player.position.y - groundHeight) > 0.01) { // Add tolerance
        this.player.position.setY(groundHeight);
      }
    }


    this.stateHistory.push({
      inputId: input.id,
      position: this.player.position.clone(),
      rotation: this.player.quaternion.clone(),
      timestamp: Date.now()
    });

    if (this.stateHistory.length > 60) this.stateHistory.shift();

    // Use the unified animation system
    PlayerAnimations.updateAnimation(this, moved);

    const moveData = moved ? {
      inputId: input.id,
      position: this.player.position.clone(),
      rotation: {
        x: this.player.quaternion.x,
        y: this.player.quaternion.y,
        z: this.player.quaternion.z,
        w: this.player.quaternion.w
      },
      timestamp: input.timestamp,
      input: {
        moveForward: finalMoveForward, // Use final states
        moveBackward: finalMoveBackward,
        moveLeft: finalMoveLeft,
        moveRight: finalMoveRight,
        // isRunning: finalIsRunning, // Removed sprint
        deltaTime: input.deltaTime
      }
    } : null;

    // Update previous position
    // if (moved) this.previousPosition.copy(this.player.position); // This seems redundant with the check below

    // --- Hide Item Badge if player moves away ---
    // Check moved *away* from target, not just general movement
    if (this.pickupTarget && window.HUD?.hideItemBadge) {
        const playerWorldPos = new THREE.Vector3();
        this.player.getWorldPosition(playerWorldPos);
        const pickupRange = 4.0;
        if (playerWorldPos.distanceTo(this.pickupTarget.model.position) > pickupRange + 0.5) { // Add buffer
            // console.log("[GAME] Player moved away from pickup target, hiding badge."); // Debug
            window.HUD.hideItemBadge();
            this.pickupTarget = null; // Clear target if moved away
        }
    }
    // ------------------------------------------


    // Update previous position for next frame's comparison
    if (this.previousPosition) {
        this.previousPosition.copy(this.player.position);
    } else {
         this.previousPosition = this.player.position.clone();
    }


    return moveData;
  },

  // Helper function to convert world coordinates to screen coordinates
  worldToScreen(worldPosition, camera) {
      const vector = worldPosition.clone();
      vector.project(camera);

      // Check if the point is behind the camera
      if (vector.z > 1) {
          return null; // Don't display if behind camera
      }

      const widthHalf = window.innerWidth / 2;
      const heightHalf = window.innerHeight / 2;

      const x = (vector.x * widthHalf) + widthHalf;
      const y = -(vector.y * heightHalf) + heightHalf;

      // Optional: Check if it's within screen bounds (e.g., add padding)
      const padding = 20;
      if (x < padding || x > window.innerWidth - padding || y < padding || y > window.innerHeight - padding) {
         // return null; // Optionally hide if too close to edge or off-screen
      }


      return { x, y };
  },

  isRemotePlayer(player) {
    // Check if this player is in our otherPlayers map
    return Object.values(this.otherPlayers).some(p => p.mesh === player);
  },

  // Helper function to apply the primary color to a player model
  applyPlayerColor(mesh, primaryColorStr) {
    if (!mesh || !primaryColorStr) return;

    const primary = new THREE.Color(primaryColorStr);

    mesh.traverse((child) => {
        if (child.isMesh && child.material) {
            // Ensure material is cloneable and suitable
            if (typeof child.material.clone === 'function' &&
                (child.material instanceof THREE.MeshStandardMaterial || child.material instanceof THREE.MeshPhongMaterial)) {

                // Clone material to avoid modifying shared instances
                child.material = child.material.clone();
                // Apply primary color to all materials
                child.material.color.set(primary);
                 // Optional: Mark for update if needed, though cloning usually suffices
                // child.material.needsUpdate = true; // Generally not needed after clone + color set
            }
        }
    });
  },

  // Function to trigger context menu from keyboard hold
  triggerKeyboardContextMenu() {
    if (!this.pickupTarget || this.pickupTarget.type !== 'weapon') {
        console.log("[GAME] E key hold did not target a weapon pickup.");
        return;
    }
    if (!window.HUD || !weaponSystem || !weaponSystem.mountManager) {
        console.warn("[GAME] Cannot trigger keyboard context menu, HUD or weaponSystem not available.");
        return;
    }

    console.log("[GAME] Triggering weapon context menu via E key hold.");
    this.isContextMenuActive = true; // Disable camera controls
    document.exitPointerLock(); // Release pointer lock to show cursor

    // Add temporary click listener to handle selection/dismissal
    // Use bind to ensure 'this' context is correct inside the handler
    this.contextMenuClickListener = this.handleContextMenuClick.bind(this);
    // Use capture phase to catch the click early, 'once' to auto-remove after first click
    document.addEventListener('click', this.contextMenuClickListener, { capture: true, once: true });
    console.log("[GAME] Added context menu click listener.");

    // Hide item badge if it was shown
    if (window.HUD.hideItemBadge) window.HUD.hideItemBadge();

    const allMounts = weaponSystem.mountManager.getAllMounts();

    // Show context menu - for desktop, position based on mouse event (or center screen if no event)
    // Since we don't have the original event here, let's center it for now.
    // We pass null for the event and false for isMobile.
    window.HUD.showWeaponContextMenu(null, allMounts, this.pickupTarget, false);
  },

  // Handles weapon attachment after context menu selection (desktop or mobile)
  handleContextMenuSelection(mountId, pickupInfo) {
    if (!pickupInfo || pickupInfo.type !== 'weapon') {
        console.warn("[GAME] Invalid pickup info for context menu selection.");
        return;
    }
    if (!weaponSystem) {
        console.warn("[GAME] Weapon system not available for context menu selection.");
        return;
    }

    console.log(`[GAME] Attaching ${pickupInfo.config?.displayName || pickupInfo.weaponType} to mount ${mountId}`); // Use weaponType for logging

    // Use the correct weaponSystem function: attachToSpecificMount
    // Pass weaponType from pickupInfo and the selected mountId
    weaponSystem.attachToSpecificMount(pickupInfo.weaponType, mountId).then(success => {
        if (success) {
            console.log(`[GAME] Weapon attached successfully via context menu to ${mountId}.`);

            // --- Remove the pickup item from the world ---
            if (window.Game && window.Game.weaponSpawnManager) {
                const pickupIdToRemove = pickupInfo.id;
                window.Game.weaponSpawnManager.removePickup(pickupIdToRemove); // Remove locally
                console.log(`[GAME] Removed pickup item ${pickupIdToRemove} from world after context menu pickup.`);

                // Notify server only if it's a dropped item (server tracks these)
                if (pickupIdToRemove && pickupIdToRemove.startsWith('pickup_')) {
                    Network.sendPickupCollected({ pickupId: pickupIdToRemove });
                    console.log(`[GAME] Sent pickup collected network message for dropped item ID: ${pickupIdToRemove}`);
                }
            } else {
                 console.error("[GAME] Cannot remove pickup: Game.weaponSpawnManager not found!");
            }
            // --- End pickup removal ---

            // Clear target only after successful attachment and removal
            if (this.pickupTarget && this.pickupTarget.id === pickupInfo.id) {
                this.pickupTarget = null;
            }
        } else {
            console.log(`[GAME] Failed to attach weapon to ${mountId}.`);
            // Optionally show feedback to the user
        }
    }).catch(error => {
        console.error(`[GAME] Error during context menu weapon attachment:`, error);
    });

    // Reset context menu state immediately after initiating action
    this.isContextMenuActive = false;
    // --- HIDE/RESET/RELOCK MOVED HERE ---
    // This function is now called ONLY after a valid selection is made (via click or mobile tap)
    window.HUD.hideWeaponContextMenu(); // Hide the menu
    this.isContextMenuActive = false; // Reset the flag

    // Re-request pointer lock
    if (document.pointerLockElement !== document.body) {
        console.log("[GAME] Re-acquiring pointer lock after context menu selection.");
        document.body.requestPointerLock();
    }
    // --- END MOVE ---
  },

  // Handles clicks while the context menu is active (desktop only)
  handleContextMenuClick(event) {
      // Listener should be removed automatically by {once: true}, but clear reference anyway
      this.contextMenuClickListener = null;
      console.log("[GAME] Context menu click detected.");
      console.log("[GAME] Click Target:", event.target); // Log the element clicked

      // We need to prevent this click from triggering game actions (like firing)
      event.stopPropagation();
      event.preventDefault();

      const selectedMountId = window.HUD.getSelectedMountFromContextMenu();
      console.log("[GAME] Click handler - Selected Mount ID from HUD:", selectedMountId); // Log the selected ID

      if (selectedMountId && this.pickupTarget) {
          console.log(`[GAME] Context menu selection confirmed via click: ${selectedMountId}`);
          // Call selection handler (which will hide menu and re-lock pointer)
          this.handleContextMenuSelection(selectedMountId, this.pickupTarget);
      } else {
          console.log("[GAME] Context menu dismissed via click (no valid selection).");
          // Manually hide, reset flag, and re-lock pointer if no selection was made
          window.HUD.hideWeaponContextMenu();
          this.isContextMenuActive = false;
          if (document.pointerLockElement !== document.body) {
              document.body.requestPointerLock();
          }
      }
  },

  // Called by Network handler when server confirms turret teleport
  handleTurretTeleportComplete(finalPosition) {
    console.log(`[GAME] Handling turret teleport complete. Final position:`, finalPosition);
    if (!this.player || !SceneManager) {
      console.error("[GAME] Cannot handle turret teleport: Player or SceneManager missing.");
      return;
    }

    // 1. Update local player position immediately
    this.player.position.copy(finalPosition);
    // Ensure player is visible (might have been hidden during turret control)
    this.player.visible = true;

    // 2. Exit turret control mode in SceneManager
    // Pass the player model so SceneManager can make it visible again
    SceneManager.exitTurretControl(this.player);

    // 3. Reset any relevant local player state if needed
    // (e.g., clear movement flags, reset camera pitch/yaw if not handled by exitTurretControl)
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;

    // The SceneManager.updateCamera logic should now take over and position
    // the camera correctly relative to the player's new position in the next frame.
    console.log("[GAME] Player position updated and turret control exited.");
  },
};

class Collider {
  constructor(type, params) {
    this.type = type; // 'capsule' or 'sphere'
    this.params = params;
    // For capsule: height, radius, offset
    // For sphere: radius, offset
  }
}
