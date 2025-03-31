import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'; //for metallic reflections
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { weaponSystem } from './weapons';
import { particleEffectSystem } from './systems/ParticleEffectSystem.js';
import { TerrainGenerator } from './terrainGenerator.js'; // Import the terrain generator
import { BuildingPlacer } from './buildingPlacer.js'; // Import the building placer
import { modelManager } from './ModelManager.js'; // Import the model manager
import { WeaponSpawnManager } from './weaponSpawnManager.js'; // Import the weapon spawn manager

export const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  normalFOV: 75, // Default FOV
  zoomFOV: 30, // Zoomed FOV
  targetFOV: 75, // Target FOV (for smooth transitions)
  renderer: new THREE.WebGLRenderer({ antialias: true }),
  cameraOffset: new THREE.Vector3(0, 3, 7), // Third-person camera offset
  cameraDistance: 5, // Distance from player
  cameraHeight: 4, // Height offset
  freeLookActive: false, // Free look mode toggle
  mouseSensitivity: 0.002, // Mouse sensitivity
  yaw: 0, // Horizontal camera rotation
  pitch: -0.3, // Vertical camera rotation (slightly looking down)
  minPitch: -0.8, // Limit looking down
  maxPitch: 0.8, // Limit looking up
  lookDelta: { x: 0, y: 0 }, // Store look input delta for the frame
  debugHelpers: {}, // Store debug helpers
  terrainMesh: null, // Add reference to store the terrain mesh
  isZooming: false, // Zoom state
  normalDistance: 5, // Default camera distance
  zoomDistance: 2, // Distance when zoomed in
  targetCameraDistance: 5, // Target camera distance
  zoomSpeed: 0.1, // Zoom transition speed
  // weaponSpawnManager reference removed, Game object will manage it

  init(mapSeed = 'default_seed_from_scene') { // Accept mapSeed, provide default for safety
    console.log(`[SceneManager] Initializing with map seed: ${mapSeed}`);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    document.body.appendChild(this.renderer.domElement);
    
    // Setup input controls (mouse and touch)
    this.setupInputControls();

    // Set scene background color to sky blue
    this.scene.background = new THREE.Color('#87CEEB');

    // Add lights
    // const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Can reduce or remove if HemisphereLight is strong enough
    // this.scene.add(ambientLight);

    const hemisphereLight = new THREE.HemisphereLight(0xADD8E6, 0x556B2F, 1.5); // Sky blue, ground green, intensity
    this.scene.add(hemisphereLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Slightly reduced intensity
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 4096;
    directionalLight.shadow.mapSize.height = 4096; // Increased resolution
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 600; // Increased far plane for larger map
    directionalLight.shadow.camera.left = -350; // Increased bounds for 600x600 map
    directionalLight.shadow.camera.right = 350;
    directionalLight.shadow.camera.top = 350;
    directionalLight.shadow.camera.bottom = -350;
    directionalLight.shadow.bias = -0.001; // Reduce shadow acne
    this.scene.add(directionalLight);
    // IMPORTANT: Update the shadow camera helper after changing bounds
    directionalLight.shadow.camera.updateProjectionMatrix();

    // Add shadow camera helper for debugging
    this.debugHelpers.shadowCamera = new THREE.CameraHelper(directionalLight.shadow.camera);
    this.scene.add(this.debugHelpers.shadowCamera);
    this.debugHelpers.shadowCamera.visible = false; // Keep hidden by default

    // Initialize TerrainGenerator first with the seed
    TerrainGenerator.initialize(mapSeed); // Use the provided seed

    // Generate and add the terrain using the new generator function
    this.terrainMesh = TerrainGenerator.generateTerrainMesh(); // Removed debug flag
    if (this.terrainMesh) {
        this.scene.add(this.terrainMesh);
        console.log(`[SceneManager] Terrain mesh added to scene.`); // Removed debug message part
    } else {
        console.error("[SceneManager] Failed to generate terrain mesh.");
    }

    // WeaponSpawnManager is now initialized in Game.init()

    // Place buildings after terrain is generated and models are loaded
    if (this.terrainMesh && TerrainGenerator.isInitialized && modelManager.isLoaded) {
        console.log("[SceneManager] Placing buildings...");
        BuildingPlacer.placeBuildings(this.scene, TerrainGenerator, modelManager); // Pass modelManager

        // Weapon spawning is now handled via network event 'initialPickupState'
        console.log("[SceneManager] Buildings placed.");

    } else {
        console.warn("[SceneManager] Skipping building placement because terrain and/or models are not ready.");
        if (!this.terrainMesh || !TerrainGenerator.isInitialized) console.warn(" - Terrain not ready.");
        if (!modelManager.isLoaded) console.warn(" - Models not loaded.");
    }

    // Set initial camera position (adjust Y based on terrain height if needed later)
    this.camera.position.set(0, 20, 10); // Increased Y slightly for better view
    this.camera.lookAt(0, 0, 0);

    // Handle window resize
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  },

  add(object) {
    this.scene.add(object);
  },

  remove(object) {
    this.scene.remove(object);
    // Also remove any debug helpers associated with this object
    if (this.debugHelpers[object.uuid]) {
      this.scene.remove(this.debugHelpers[object.uuid]);
      delete this.debugHelpers[object.uuid];
    }
  },
  
  async cloneWeapon(weaponType) {
    console.log(`[SceneManager] Attempting to clone weapon: ${weaponType}`);
    
    try {
      if (!weaponSystem?.weaponFactory) {
        throw new Error('Weapon system not initialized');
      }
      
      const model = await weaponSystem.weaponFactory.loadWeaponModel(weaponType);
      if (!model) {
        throw new Error(`Failed to load model for ${weaponType}`);
      }
      
      return model.clone();
    } catch (error) {
      console.error(`[SceneManager] Failed to clone weapon ${weaponType}:`, error);
      return null;
    }
  },
  
  // Add debug visualization for interpolation
  addDebugHelper(playerId, mesh, targetPosition) {
    // Create a line between current position and target position
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    const geometry = new THREE.BufferGeometry().setFromPoints([
      mesh.position,
      targetPosition
    ]);
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);
    
    // Store the helper
    this.debugHelpers[mesh.uuid] = line;
    
    return line;
  },
  
  // Update debug visualization
  updateDebugHelper(mesh, targetPosition) {
    if (this.debugHelpers[mesh.uuid]) {
      // Update the line geometry
      const points = [mesh.position.clone(), targetPosition.clone()];
      this.debugHelpers[mesh.uuid].geometry.setFromPoints(points);
      this.debugHelpers[mesh.uuid].geometry.attributes.position.needsUpdate = true;
    } else {
      // Create a new helper if it doesn't exist
      this.addDebugHelper(mesh.uuid, mesh, targetPosition);
    }
  },

  getPlayerFacingYaw() {
    // This is the raw yaw without the camera-specific adjustment
    return this.yaw;
  },

  render(playerPosition) {
    const now = performance.now();
    const deltaTime = this.lastRenderTime ? (now - this.lastRenderTime) / 1000 : 0;
    this.lastRenderTime = now;

    // Update weapon spawn manager (now accessed via Game.weaponSpawnManager)
    if (window.Game && window.Game.weaponSpawnManager) {
        window.Game.weaponSpawnManager.update(deltaTime);
    }

    // Collision check for weapon pickups (handled by 'E' key interaction in game.js)
    // const collidedPickup = this.weaponSpawnManager?.checkCollisions(playerPosition);
    // if (collidedPickup) {
    //   // Handle pickup logic here or in game.js
    //   console.log(`Player collided with ${collidedPickup.type}`);
    //   // Example: weaponSystem.pickupWeapon(playerModel, collidedPickup.model, collidedPickup.type);
    //   // Example: this.weaponSpawnManager.removePickup(collidedPickup.id);
    // }

    this.renderer.render(this.scene, this.camera);
  },

  // Touch state variables
  touchStartTime: 0,
  touchStartPosition: { x: 0, y: 0 },
  touchCurrentPosition: { x: 0, y: 0 },
  touchHoldTimeout: null,
  isHoldingTouch: false,
  touchHoldDuration: 500, // ms for hold gesture

  setupInputControls() {
    const canvas = this.renderer.domElement;

    // --- Mouse Controls ---
    document.addEventListener('mousemove', (event) => {
      // Ensure Game object exists before checking its state
      if (!window.Game) return; 

      // Check if context menu is active in Game object
      const isContextMenuActive = window.Game.isContextMenuActive || false; 
      // Store mouse delta instead of applying directly
      if (document.pointerLockElement === document.body && !isContextMenuActive) {
        this.lookDelta.x -= event.movementX; // Accumulate delta
        this.lookDelta.y -= event.movementY;
      }
    });
    
    // Pointer lock setup
    document.addEventListener('click', () => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
      }
    });
    
    // Right mouse for zoom
    document.addEventListener('mousedown', (event) => {
      if (event.button === 2) { // Right mouse button
        this.isZooming = true;
        this.targetFOV = this.zoomFOV; // Set target FOV to zoom FOV
      }
    });
    
    document.addEventListener('mouseup', (event) => {
      if (event.button === 2) { // Right mouse button
        this.isZooming = false;
        this.targetFOV = this.normalFOV; // Set target FOV to normal FOV
      }
    });
    
    // Middle mouse for free look
    document.addEventListener('mousedown', (event) => {
      if (event.button === 1) { // Middle mouse button
        this.freeLookActive = true;
      }
    });
    
    document.addEventListener('mouseup', (event) => {
      if (event.button === 1) { // Middle mouse button
        this.freeLookActive = false;
      }
    });
    
    // Handle pointer lock change
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement !== document.body) {
        // Reset free look when pointer lock is exited
        this.freeLookActive = false;
      }
    });

    // --- Touch Controls ---
    canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
    canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
    canvas.addEventListener('touchcancel', this.handleTouchEnd.bind(this), { passive: false }); // Treat cancel like end
  },

  handleTouchStart(event) {
    // Prevent default browser actions like scrolling/zooming on the canvas
    event.preventDefault();

    if (event.touches.length === 1) { // Handle single touch for now
      const touch = event.touches[0];
      this.isHoldingTouch = true;
      this.touchStartTime = Date.now();
      this.touchStartPosition.x = touch.clientX;
      this.touchStartPosition.y = touch.clientY;
      this.touchCurrentPosition.x = touch.clientX;
      this.touchCurrentPosition.y = touch.clientY;

      // Clear any previous hold timeout
      clearTimeout(this.touchHoldTimeout);

      // Set timeout for hold gesture
      this.touchHoldTimeout = setTimeout(() => {
        if (this.isHoldingTouch) {
          // Check if touch hasn't moved much (threshold for hold)
          const dx = this.touchCurrentPosition.x - this.touchStartPosition.x;
          const dy = this.touchCurrentPosition.y - this.touchStartPosition.y;
          const moveThreshold = 10; // Pixels
          if (Math.sqrt(dx * dx + dy * dy) < moveThreshold) {
            console.log("[SceneManager] Touch Hold Detected at:", this.touchStartPosition);
            this.triggerContextMenuAtTouch(this.touchStartPosition);
            // Prevent tap/drag after hold triggers menu
            this.isHoldingTouch = false; // End the hold state so touchend doesn't trigger tap
          }
        }
      }, this.touchHoldDuration);

      // TODO: Add logic for touch-based camera movement start if needed
    }
  },

  handleTouchMove(event) {
    event.preventDefault();

    if (event.touches.length === 1 && this.isHoldingTouch) {
      const touch = event.touches[0];
      const prevX = this.touchCurrentPosition.x;
      const prevY = this.touchCurrentPosition.y;
      this.touchCurrentPosition.x = touch.clientX;
      this.touchCurrentPosition.y = touch.clientY;

      const deltaX = this.touchCurrentPosition.x - prevX;
      const deltaY = this.touchCurrentPosition.y - prevY;

      // If touch moves significantly, cancel the hold timeout
      const dx = this.touchCurrentPosition.x - this.touchStartPosition.x;
      const dy = this.touchCurrentPosition.y - this.touchStartPosition.y;
      const moveThreshold = 10;
       if (Math.sqrt(dx*dx + dy*dy) >= moveThreshold) {
           clearTimeout(this.touchHoldTimeout);
           // console.log("[SceneManager] Touch moved, hold cancelled."); // Debug
       }


      // Accumulate touch delta for look
       if (!window.Game?.isContextMenuActive) { // Only rotate if context menu isn't up
           this.lookDelta.x -= deltaX * 1.5; // Apply sensitivity adjustment for touch
           this.lookDelta.y -= deltaY * 1.5;
       }
    }
  },

  handleTouchEnd(event) {
     event.preventDefault();
     clearTimeout(this.touchHoldTimeout); // Always clear timeout on touch end

     if (this.isHoldingTouch) {
         const touchEndTime = Date.now();
         const duration = touchEndTime - this.touchStartTime;
         const dx = this.touchCurrentPosition.x - this.touchStartPosition.x;
         const dy = this.touchCurrentPosition.y - this.touchStartPosition.y;
         const moveThreshold = 10; // Pixels

         // Check for a tap (short duration, minimal movement)
         if (duration < this.touchHoldDuration && Math.sqrt(dx * dx + dy * dy) < moveThreshold) {
             console.log("[SceneManager] Tap Detected at:", this.touchStartPosition);
             // TODO: Handle tap action (e.g., fire weapon if tapping on right side?)
             // this.handleTap(this.touchStartPosition);
         }
     }

     this.isHoldingTouch = false; // Reset hold state
     // TODO: Add logic for touch-based camera movement end if needed
  },

  triggerContextMenuAtTouch(touchPosition) {
      // This function needs access to Game state to find the pickup target
      if (!window.Game || !window.Game.player || !window.Game.weaponSpawnManager || !weaponSystem) {
          console.warn("[SceneManager] Cannot trigger context menu, Game state not available.");
          return;
      }

      // Use raycasting from touch position to find potential pickup target
      const raycaster = new THREE.Raycaster();
      const mouseNDC = new THREE.Vector2(
          (touchPosition.x / window.innerWidth) * 2 - 1,
          -(touchPosition.y / window.innerHeight) * 2 + 1
      );
      raycaster.setFromCamera(mouseNDC, this.camera);

      // Check intersection with pickup items (assuming they are in a specific group or have userData)
      const pickupMeshes = window.Game.weaponSpawnManager.getAllPickupModels(); // Need a way to get all pickup meshes
      const intersects = raycaster.intersectObjects(pickupMeshes, true); // Recursive check

      let targetPickupInfo = null;
      if (intersects.length > 0) {
          // Find the closest intersected pickup mesh that has associated pickup data
          for (const intersect of intersects) {
              let currentObj = intersect.object;
              while (currentObj && !currentObj.userData?.pickupId) {
                  currentObj = currentObj.parent; // Traverse up to find the object with pickupId
              }
              if (currentObj && currentObj.userData.pickupId) {
                  const pickupId = currentObj.userData.pickupId;
                  const pickupData = window.Game.weaponSpawnManager.getPickupById(pickupId); // Need this function in WeaponSpawnManager
                  if (pickupData) {
                      // Check distance (optional, but good practice)
                      const playerPos = new THREE.Vector3();
                      window.Game.player.getWorldPosition(playerPos);
                      const pickupPos = new THREE.Vector3();
                      currentObj.getWorldPosition(pickupPos);
                      const pickupRange = 4.0; // Match game logic range
                      if (playerPos.distanceTo(pickupPos) <= pickupRange) {
                          targetPickupInfo = pickupData; // Found a valid target
                          console.log(`[SceneManager] Raycast hit pickup: ${targetPickupInfo.type} (ID: ${targetPickupInfo.id})`);
                          break; // Use the first valid hit
                      }
                  }
              }
          }
      }

      if (targetPickupInfo && targetPickupInfo.type === 'weapon') {
          console.log("[SceneManager] Triggering weapon context menu via touch hold.");
          window.Game.isContextMenuActive = true; // Disable camera controls in Game

          // Hide item badge if it was shown
          if (window.HUD?.hideItemBadge) window.HUD.hideItemBadge();

          const allMounts = weaponSystem.mountManager.getAllMounts();
          // Show context menu centered at touch position
          window.HUD.showWeaponContextMenu(touchPosition, allMounts, targetPickupInfo);
      } else {
          console.log("[SceneManager] Touch hold did not target a weapon pickup.");
          // Optionally hide context menu if it was somehow still visible
          if (window.HUD?.hideWeaponContextMenu) window.HUD.hideWeaponContextMenu();
          window.Game.isContextMenuActive = false;
      }
  },

  // Removed addWeaponPickups method as it's now handled by WeaponSpawnManager

  updateCamera(playerPosition, playerModel) {
    // Apply accumulated look delta from mouse or touch
    if (this.lookDelta.x !== 0 || this.lookDelta.y !== 0) {
        this.yaw += this.lookDelta.x * this.mouseSensitivity;
        this.pitch += this.lookDelta.y * this.mouseSensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch)); // Clamp pitch

        // Reset delta for the next frame
        this.lookDelta.x = 0;
        this.lookDelta.y = 0;
    }

    // Calculate camera rotation based on updated yaw and pitch
    const cameraRotation = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));

    // Smoothly interpolate FOV
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.targetFOV, this.zoomSpeed);
    this.camera.updateProjectionMatrix();

    const offset = new THREE.Vector3(0, this.cameraHeight, this.normalDistance) // Use normalDistance
      .applyQuaternion(cameraRotation);

    const targetCameraPosition = playerPosition.clone().add(offset);
    this.camera.position.copy(targetCameraPosition);
    this.camera.quaternion.copy(cameraRotation);

    const forward = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(cameraRotation)
      .setY(0)
      .normalize();

    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(cameraRotation)
      .setY(0)
      .normalize();

    // Only update player model orientation if not in free look mode
    if (playerModel && !this.freeLookActive) {
      const playerRotation = cameraRotation.clone().multiply(
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0), Math.PI)
      );
      playerModel.quaternion.copy(playerRotation);
    }
    // Note: When in free look, the server will use movementRotation instead

    return { forward, right };
  },

  getTerrainHeight(x, z) {
    if (!this.terrainMesh) {
      console.warn("Terrain mesh not available for height check.");
      return 0; // Default height if terrain isn't ready
    }

    const raycaster = new THREE.Raycaster();
    // Cast ray downwards from a point high above the target x, z
    const origin = new THREE.Vector3(x, 100, z); // Start ray high up
    const direction = new THREE.Vector3(0, -1, 0); // Point straight down
    raycaster.set(origin, direction);

    const intersects = raycaster.intersectObject(this.terrainMesh);

    if (intersects.length > 0) {
      return intersects[0].point.y; // Return the Y coordinate of the intersection point
    }

    // console.warn(`No terrain intersection found at (${x}, ${z}). Returning default height 0.`);
    return 0; // Default height if no intersection (e.g., outside terrain bounds)
  },
};
