import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'; //for metallic reflections
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { weaponSystem } from './weapons';
import { particleEffectSystem } from './systems/ParticleEffectSystem.js';
import { TerrainGenerator } from './terrainGenerator.js'; // Import the terrain generator
import { BuildingPlacer } from './buildingPlacer.js'; // Import the building placer
import { modelManager } from './ModelManager.js'; // Import the model manager
import { WeaponSpawnManager } from './weaponSpawnManager.js'; // Import the weapon spawn manager
import { Network } from './network.js'; // Import Network

const PLATFORM_Y_POSITION = 100; // Define platform height constant (Increased height)

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
  yaw: Math.PI, // Horizontal camera rotation (Set to face opposite direction initially)
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
  platformMesh: null, // Add reference for the platform
  platformBoundingBox: null, // Store platform bounding box for collision checks
  turretMesh: null, // Reference to the loaded turret model
  turretCannonTopMesh: null, // Reference to the rotating part
  isControllingTurret: false, // State flag
  turretCameraOffset: new THREE.Vector3(0, 2.5, 6), // Place camera in front of turret
  originalPlayerCameraState: null, // To restore camera settings
  turretYaw: 0, // Horizontal aim of the turret (relative to turret's base forward)
  turretPitch: 0, // Vertical aim of the turret
  turretMinPitch: -0.4, // Limit turret looking down (radians)
  turretMaxPitch: 0.6, // Limit turret looking up (radians)
  turretMinYaw: -Math.PI / 2.5, // Limit turret rotation left (radians)
  turretMaxYaw: Math.PI / 2.5, // Limit turret rotation right (radians)
  isFollowingProjectile: false, // State flag for follow-cam
  followingProjectileData: null, // Reference to the projectile being followed { mesh, direction, serverId }

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

    // Load the platform and turret models after other initializations
    this.loadPlatformModel();
    this.loadTurretModel(); // Call the new function
  },

  // Function to load the platform model
  async loadPlatformModel() {
    const loader = new GLTFLoader();
    try {
      // User mentioned they set the platform Z to -250, let's assume they updated the model name too if needed.
      // Using Platform2.glb as seen in the last successful file content.
      const gltf = await loader.loadAsync('assets/models/Platform2.glb');
      this.platformMesh = gltf.scene;
      this.platformMesh.scale.set(5, 5, 5); // Scale the platform up
      this.platformMesh.position.set(0, PLATFORM_Y_POSITION, -250); // Position the platform near Z edge

      // Ensure platform casts and receives shadows
      this.platformMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.scene.add(this.platformMesh);
      console.log('[SceneManager] Platform model loaded, scaled, and added to scene.');

      // Calculate and store bounding box for collision *after* scaling and positioning
      this.platformBoundingBox = new THREE.Box3().setFromObject(this.platformMesh);
      // Optional: Add a helper to visualize the bounding box
      // const helper = new THREE.Box3Helper(this.platformBoundingBox, 0xffff00);
      // this.scene.add(helper);

    } catch (error) {
      console.error('[SceneManager] Failed to load platform model:', error);
    }
  },

  // Function to load the turret model
  async loadTurretModel() {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync('assets/models/Turret.glb');
      this.turretMesh = gltf.scene; // Store reference to the whole turret
      // Position the turret on the platform near the positive Z edge (relative to platform center at Z=-250)
      this.turretMesh.position.set(0, PLATFORM_Y_POSITION, -230); // Y=100, Z=-230
      this.turretMesh.scale.set(11, 11, 11);

      // Ensure turret casts and receives shadows and find the cannon top
      this.turretMesh.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          // Find the cannon top mesh by name - **ASSUMING 'Turret_Cannon_Top'**
          if (child.name === 'Turret_Cannon_Top') {
            this.turretCannonTopMesh = child;
            console.log('[SceneManager] Found Turret_Cannon_Top mesh.');
          }
        }
      });

      // Add a check if the cannon top wasn't found
      if (!this.turretCannonTopMesh) {
         console.warn('[SceneManager] Turret_Cannon_Top mesh not found in Turret.glb. Turret rotation might not work.');
      }

      this.scene.add(this.turretMesh);
      console.log('[SceneManager] Turret model loaded, referenced, and added to scene.');

      // --- Add JOIN BATTLE Billboard ---
      try {
        const billboardCanvas = document.createElement('canvas');
        const billboardContext = billboardCanvas.getContext('2d');
        const billboardWidth = 512; // Texture resolution
        const billboardHeight = 64;
        billboardCanvas.width = billboardWidth;
        billboardCanvas.height = billboardHeight;

        // Style the text (using HUD styles)
        billboardContext.fillStyle = 'rgba(0, 20, 40, 0.7)'; // Dark semi-transparent background (similar to HUD bg)
        billboardContext.fillRect(0, 0, billboardWidth, billboardHeight);
        billboardContext.font = 'bold 48px Orbitron, Roboto Mono, monospace'; // HUD font, adjusted size
        billboardContext.fillStyle = '#00aaff'; // HUD primary color
        billboardContext.textAlign = 'center';
        billboardContext.textBaseline = 'middle';
        billboardContext.fillText('JOIN BATTLE', billboardWidth / 2, billboardHeight / 2);

        const billboardTexture = new THREE.CanvasTexture(billboardCanvas);
        billboardTexture.needsUpdate = true;

        // Adjust plane size based on aspect ratio of text/canvas - Made much smaller
        const billboardAspect = billboardWidth / billboardHeight; // 4:1
        const billboardPlaneHeight = 0.5; // Drastically reduced height
        const billboardPlaneWidth = billboardPlaneHeight * billboardAspect; // Drastically reduced width (2)

        const billboardGeometry = new THREE.PlaneGeometry(billboardPlaneWidth, billboardPlaneHeight);
        const billboardMaterial = new THREE.MeshBasicMaterial({
          map: billboardTexture,
          transparent: true, // Needed because of the rgba background
          side: THREE.DoubleSide, // Visible from both sides
          depthTest: false, // Optional: Render on top of other objects slightly easier
        });

        const billboardMesh = new THREE.Mesh(billboardGeometry, billboardMaterial);

        // Counteract parent scale
        const turretScaleFactor = 11;
        billboardMesh.scale.set(1 / turretScaleFactor, 1 / turretScaleFactor, 1 / turretScaleFactor);

        // Position the billboard above the turret's local origin - Lowered
        // The turret scale is 11, so offsets are relative to the unscaled model unless applied after scaling.
        // Adding as a child means the position is relative to the parent's origin.
        const billboardYOffset = 0.75; // Further reduced Y offset
        billboardMesh.position.set(0, billboardYOffset, 0); // Centered above the turret base origin
        billboardMesh.rotation.y = Math.PI; // Rotate 180 degrees to face forward

        // Add billboard as a child of the turret mesh so it moves/rotates with the base
        this.turretMesh.add(billboardMesh);
        console.log('[SceneManager] Added JOIN BATTLE billboard to turret.');

      } catch (billboardError) {
          console.error('[SceneManager] Failed to create billboard:', billboardError);
      }
      // --- End Billboard ---

    } catch (error) {
      console.error('[SceneManager] Failed to load turret model:', error);
    }
  },

  enterTurretControl(playerModel) {
    if (!this.turretMesh) {
      console.error("[SceneManager] Cannot enter turret control: Turret mesh not loaded.");
      return;
    }
    console.log("[SceneManager] Entering turret control.");
    this.isControllingTurret = true;

    // Store original camera state
    this.originalPlayerCameraState = {
      fov: this.camera.fov,
      pitch: this.pitch,
      yaw: this.yaw,
      targetFOV: this.targetFOV,
      isZooming: this.isZooming,
      freeLookActive: this.freeLookActive,
    };

    // Hide player model
    if (playerModel) {
      playerModel.visible = false;
    }

    // Reset turret aim (relative to its base)
    this.turretYaw = 0;
    this.turretPitch = 0;

    // Reset player camera pitch/yaw/zoom for turret view
    this.pitch = 0; // Reset pitch for turret view
    this.yaw = 0; // Reset yaw for turret view (turret rotation handles this now)
    this.targetFOV = this.normalFOV; // Ensure not zoomed
    this.isZooming = false;
    this.freeLookActive = false; // Disable free look

    // Switch HUD elements
    if (window.HUD?.showTurretReticle) window.HUD.showTurretReticle();
    // Interaction prompt is hidden by game.js when entering control
  },

  exitTurretControl(playerModel) {
    console.log("[SceneManager] Exiting turret control.");
    this.isControllingTurret = false;

    // Show player model
    if (playerModel) {
      playerModel.visible = true;
    }

    // Restore original camera state
    if (this.originalPlayerCameraState) {
      this.camera.fov = this.originalPlayerCameraState.fov;
      this.pitch = this.originalPlayerCameraState.pitch;
      this.yaw = this.originalPlayerCameraState.yaw;
      this.targetFOV = this.originalPlayerCameraState.targetFOV;
      this.isZooming = this.originalPlayerCameraState.isZooming;
      this.freeLookActive = this.originalPlayerCameraState.freeLookActive;
      this.originalPlayerCameraState = null;
      this.camera.updateProjectionMatrix(); // Apply FOV change immediately
    }

    // Reset turret aim visuals (optional, could leave as is)
    // if (this.turretCannonTopMesh) {
    //   this.turretCannonTopMesh.rotation.set(0, 0, 0);
    // }

    // Switch HUD elements back
    if (window.HUD?.hideTurretReticle) window.HUD.hideTurretReticle();
    // Interaction prompt visibility is handled by game.js based on proximity check

    // If we were following a projectile when exiting, make sure to stop.
    if (this.isFollowingProjectile) {
        this.stopFollowingProjectile(false); // Pass false to prevent restoring turret view elements
    }
  },

  // Method to start following a projectile
  startFollowingProjectile(projectileData) {
    if (!projectileData || !projectileData.mesh) {
      console.error("[SceneManager] Invalid projectile data for following.");
      return;
    }
    console.log(`[SceneManager] Starting to follow projectile ID: ${projectileData.serverId}`);
    this.isFollowingProjectile = true;
    this.followingProjectileData = projectileData;
    // Optionally, reset lookDelta to prevent accidental turret movement while following
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    // Maybe hide turret reticle?
    if (window.HUD?.hideTurretReticle) window.HUD.hideTurretReticle();
  },

  // Method to stop following a projectile
  // Added restoreTurretViewElements parameter (defaults to true)
  stopFollowingProjectile(restoreTurretViewElements = true) {
    if (!this.isFollowingProjectile) return; // Already stopped

    const projectileId = this.followingProjectileData?.serverId; // Get ID before clearing
    console.log(`[SceneManager] Stopping following projectile ID: ${projectileId}`);
    this.isFollowingProjectile = false;
    this.followingProjectileData = null;

    // Only restore turret elements (like reticle) if requested AND still in turret control
    // This prevents restoring them if we stopped following because we teleported *out* of the turret.
    if (restoreTurretViewElements && this.isControllingTurret) {
        console.log("[SceneManager] Restoring turret view elements after following projectile.");
        // Reset turret aim immediately for consistency when returning control manually (not via teleport)
        this.turretYaw = 0;
        this.turretPitch = 0;
        // Show turret reticle again
        if (window.HUD?.showTurretReticle) window.HUD.showTurretReticle();
    } else if (!restoreTurretViewElements) {
        console.log(`[SceneManager] Stopped following projectile ${projectileId}, but not restoring turret view elements (likely due to teleport).`);
    } else {
        // This case (restoreTurretViewElements=true but not isControllingTurret) shouldn't normally happen
        // if exitTurretControl calls stopFollowingProjectile(false).
        console.warn(`[SceneManager] Stopped following projectile ${projectileId}, but player is no longer in turret control. No view elements restored.`);
    }
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

    // Pointer lock setup & Turret Firing
    document.addEventListener('click', () => {
      // Request pointer lock if not already active
      if (document.pointerLockElement !== document.body) {
        // Don't request pointer lock if the context menu is active (handled elsewhere)
        if (!window.Game?.isContextMenuActive) {
            document.body.requestPointerLock();
        }
      }
      // Handle turret firing if controlling the turret, pointer is locked, AND not currently following a projectile
      else if (this.isControllingTurret && !this.isFollowingProjectile) {
        console.log("[SceneManager] Click detected while controlling turret (and not following)."); // Debug log
        const hitTerrain = this.checkTurretTerrainTarget();
        if (hitTerrain) {
          console.log("[SceneManager] Turret raycast hit terrain.");
          if (window.HUD?.addMessage) {
            window.HUD.addMessage("Turret Target Acquired!", "success"); // Success message
          }
          // --- Fire Projectile ---
          // Use the imported Network object directly
          if (Network?.sendShot) {
            const position = new THREE.Vector3();
            const direction = new THREE.Vector3();
            this.camera.getWorldPosition(position); // Get world position of camera
            this.camera.getWorldDirection(direction); // Get world direction camera is facing

            console.log(`[SceneManager] Sending turret shot. Pos: ${position.toArray().join(',')}, Dir: ${direction.toArray().join(',')}`);

            Network.sendShot({ // Use imported Network
              weaponId: 'turret', // Placeholder ID for the turret
              weaponType: 'turretCannon', // Specific type for the server to handle
              position: { x: position.x, y: position.y, z: position.z },
              direction: { x: direction.x, y: direction.y, z: direction.z }
            });
            // TODO: Add client-side firing effect (muzzle flash, sound)?
          } else {
            console.warn("[SceneManager] Network.sendShot is not available.");
          }
          // --- End Fire Projectile ---
        } else {
          console.log("[SceneManager] Turret raycast missed terrain.");
          if (window.HUD?.addMessage) {
            window.HUD.addMessage("Turret Missed.", "warning"); // Failure message
          }
        }
      }
      // Note: Regular weapon firing is handled by WeaponSystem based on mouse state, not this click event.
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
    // --- Projectile Follow-Cam Logic ---
    if (this.isFollowingProjectile && this.followingProjectileData?.mesh) {
      const projectileMesh = this.followingProjectileData.mesh;
      const projectileDirection = this.followingProjectileData.direction; // Assumes direction is stored

      // Define offset behind and slightly above the projectile
      const followOffset = projectileDirection.clone().multiplyScalar(-8).add(new THREE.Vector3(0, 3, 0)); // 8 units behind, 3 units up
      const targetCameraPosition = projectileMesh.position.clone().add(followOffset);

      // Smoothly move camera towards target position
      this.camera.position.lerp(targetCameraPosition, 0.1); // Adjust lerp factor for smoothness

      // Make camera look slightly ahead of the projectile
      const lookAtTarget = projectileMesh.position.clone().addScaledVector(projectileDirection, 10); // Look 10 units ahead
      this.camera.lookAt(lookAtTarget);

      // Return default vectors as player/turret movement is disabled
      return { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };

    // --- Turret Control Logic (Not Following Projectile) ---
    } else if (this.isControllingTurret) {
      // Delegate all camera and turret model updates to the specific function
      return this.updateTurretCameraLogic(); // Return the result (turret's forward/right)

    // --- Player Camera Logic ---
    } else {
      // Apply accumulated look delta from mouse or touch (only for player control)
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

      // Calculate camera position based on player position, offset, and rotation
      const offset = new THREE.Vector3(0, this.cameraHeight, this.normalDistance) // Use normalDistance
        .applyQuaternion(cameraRotation);
      const targetCameraPosition = playerPosition.clone().add(offset);

      // Apply position and rotation to the camera
      this.camera.position.copy(targetCameraPosition);
      this.camera.quaternion.copy(cameraRotation); // Set camera rotation directly

      // Calculate forward and right vectors based on camera rotation
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
        // Make player model face the camera's forward direction
        const playerLookAt = playerPosition.clone().add(forward);
        playerModel.lookAt(playerLookAt);
        // Apply rotation offset if model's default forward is not Z+
        // playerModel.rotateY(Math.PI); // Uncomment if model faces Z- by default
      }
      // Note: When in free look, the server will use movementRotation instead

      return { forward, right }; // Return player's forward/right
    }
  }, // End of updateCamera method

  updateTurretCameraLogic() { // Define as a method within SceneManager
    // Only require the base turret mesh for camera logic, as cannon rotation is disabled for now.
    if (!this.turretMesh) {
        // console.warn("[SceneManager] updateTurretCameraLogic called but turretMesh is missing."); // Reduce console noise
        // Return default vectors if turret isn't ready
        return { forward: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0) };
    }

    // Apply accumulated look delta to turret aim ONLY if not following a projectile
    if (!this.isFollowingProjectile && (this.lookDelta.x !== 0 || this.lookDelta.y !== 0)) {
        // Note: Adjust sensitivity if needed, separate from player sensitivity?
        this.turretYaw += this.lookDelta.x * this.mouseSensitivity; // Add delta for non-inverted horizontal movement
        this.turretPitch -= this.lookDelta.y * this.mouseSensitivity; // Negate to invert vertical movement

        // Clamp turret pitch and yaw
        this.turretPitch = Math.max(this.turretMinPitch, Math.min(this.turretMaxPitch, this.turretPitch));
        this.turretYaw = Math.max(this.turretMinYaw, Math.min(this.turretMaxYaw, this.turretYaw));

        // Reset delta for the next frame
        this.lookDelta.x = 0;
        this.lookDelta.y = 0;
    }

    // --- Update Camera Position & Orientation ---
    // Calculate rotation based on turret aim (Yaw around Y, Pitch around X)
    // We want the camera to rotate *around* the turret base
    const turretBasePosition = this.turretMesh.position;
    const cameraRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.turretPitch, this.turretYaw, 0, 'YXZ'));

    // Apply offset relative to the turret base, then rotate it
    const rotatedOffset = this.turretCameraOffset.clone().applyQuaternion(cameraRotation);
    const targetCameraPosition = turretBasePosition.clone().add(rotatedOffset);

    this.camera.position.copy(targetCameraPosition);

    // Calculate a point in front of the camera to look at
    const lookDirection = new THREE.Vector3(0, 0, 1); // Camera looks down -Z by default
    lookDirection.applyQuaternion(cameraRotation); // Apply the turret's aim rotation
    const lookAtTarget = targetCameraPosition.clone().add(lookDirection); // Add direction to camera position
    this.camera.lookAt(lookAtTarget); // Make the camera look at the calculated point

    // --- Update Turret Cannon Mesh Rotation (Commented out as requested) ---
    // Apply the calculated pitch and yaw to the cannon mesh
    // Assuming the cannon model's default orientation aligns with the axes correctly.
    // Yaw rotation is typically around the Y-axis.
    // Pitch rotation is typically around the X-axis (or Z if the model is oriented differently).
    // We might need to apply rotations relative to the turret's base orientation if it's not zero.
    // this.turretCannonTopMesh.rotation.set(this.turretPitch, this.turretYaw, 0, 'YXZ'); // Use 'YXZ' order common for FPS controls

    // Ensure FOV is normal (no zoom in turret)
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.normalFOV, this.zoomSpeed);
    this.camera.updateProjectionMatrix();

    // Return forward/right vectors based on the calculated camera rotation for the turret view
    const forward = lookDirection; // Use the already calculated look direction
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraRotation).normalize();
    // Avoid using turretCannonTopMesh as it might be null and rotation is disabled anyway
    return { forward: forward, right: right }; // Return camera's orientation in turret mode
  }, // End of updateTurretCameraLogic method

  // New method to check if the turret is aiming at the terrain
  checkTurretTerrainTarget() {
    if (!this.isControllingTurret || !this.terrainMesh) {
      // Not in turret mode or terrain doesn't exist
      return false;
    }

    // Use the current camera's position and direction for the raycast
    const raycaster = new THREE.Raycaster();
    const cameraPosition = this.camera.position;
    const cameraDirection = new THREE.Vector3();
    this.camera.getWorldDirection(cameraDirection); // Get the direction the camera is looking

    raycaster.set(cameraPosition, cameraDirection);

    // Check for intersection specifically with the terrain mesh
    const intersects = raycaster.intersectObject(this.terrainMesh);

    // Return true if there's an intersection, false otherwise
    return intersects.length > 0;
  },

  // Renamed and updated to check platform first
  getPlatformOrTerrainHeight(x, z) { // Ensure this is the last method before the closing brace '};'
    // 1. Check Platform Collision
    if (this.platformMesh && this.platformBoundingBox) {
      // Simple AABB check for now (assumes player is roughly above the platform's XZ footprint)
      // A more robust check might involve raycasting down onto the platform mesh itself
      if (x >= this.platformBoundingBox.min.x && x <= this.platformBoundingBox.max.x &&
          z >= this.platformBoundingBox.min.z && z <= this.platformBoundingBox.max.z) {
        // If within the platform's horizontal bounds, return the platform's Y position plus the offset
        // This ensures the player stays slightly above the surface
        return PLATFORM_Y_POSITION + 2; // Added +2 offset
      }
    }

    // 2. Check Terrain Height (if not on platform)
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

  // Get the current direction the camera is facing
  getCameraDirection() {
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    return direction;
  },
};
