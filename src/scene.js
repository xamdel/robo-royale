import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
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
  debugHelpers: {}, // Store debug helpers

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    document.body.appendChild(this.renderer.domElement);
    
    // Setup mouse controls
    this.setupMouseControls();

    // Set scene background color to sky blue
    this.scene.background = new THREE.Color('#87CEEB');

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 4096; // Increased resolution
    directionalLight.shadow.camera.near = 1; // Adjusted near plane
    directionalLight.shadow.camera.far = 200; // Adjusted far plane
    directionalLight.shadow.camera.left = -100; // Added left plane
    directionalLight.shadow.camera.right = 100; // Added right plane
    directionalLight.shadow.camera.top = 100; // Added top plane
    directionalLight.shadow.camera.bottom = -100; // Added bottom plane
    directionalLight.shadow.bias = -0.001; // Reduce shadow acne
    this.scene.add(directionalLight);

    // Add shadow camera helper for debugging
    this.debugHelpers.shadowCamera = new THREE.CameraHelper(directionalLight.shadow.camera);
    this.scene.add(this.debugHelpers.shadowCamera);
    this.debugHelpers.shadowCamera.visible = false;

    // Add a simple terrain
    const terrainGeometry = new THREE.PlaneGeometry(200, 200);
    const textureLoader = new THREE.TextureLoader();
    // const terrainTexture = textureLoader.load('/assets/grid.png');
    // terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping;
    // terrainTexture.repeat.set(10, 10);
    const terrainMaterial = new THREE.MeshPhongMaterial({
      color: '#008000', // Green color
    });
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Load cannon model
    const loader = new GLTFLoader();
    loader.load('/assets/models/Cannon.glb', (gltf) => {
      this.cannon = gltf.scene;
      this.cannon.position.set(0, 0, 0);
      this.cannon.castShadow = true;
      this.scene.add(this.cannon);
      
      // Set up collision sphere for pickup
      this.cannonCollider = new THREE.Sphere(
        this.cannon.position.clone(),
        2.5 // Pickup radius
      );
    });

    // Set initial camera position
    this.camera.position.set(0, 10, 10);
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

  render(playerPosition) {
    const now = performance.now();
    const deltaTime = this.lastRenderTime ? (now - this.lastRenderTime)/1000 : 0;
    this.lastRenderTime = now;

    if (this.cannon) {
      // Only rotate the cannon if it's not attached to the player
      if (!this.cannonAttached) {
        this.cannon.rotation.y += deltaTime * 0.5; // 0.5 radians/sec rotation
      }
      
      // Update collider position to match cannon (only if not attached)
      if (this.cannonCollider) {
        const worldPos = new THREE.Vector3();
        this.cannon.getWorldPosition(worldPos);
        this.cannonCollider.center.copy(worldPos);
        
        // Only log in debug mode to avoid flooding the console
        if (playerPosition && window.Debug && window.Debug.state && window.Debug.state.enabled) {
          console.log('Cannon collider updated:', {
            worldPosition: worldPos, 
            radius: this.cannonCollider.radius,
            playerPosition: playerPosition,
            distance: playerPosition ? worldPos.distanceTo(playerPosition) : null
          });
        }
      }
    }
    
    this.renderer.render(this.scene, this.camera);
  },

  setupMouseControls() {
    // Mouse movement handler
    document.addEventListener('mousemove', (event) => {
      if (document.pointerLockElement === document.body) {
        // Apply mouse movement to camera rotation
        this.yaw -= event.movementX * this.mouseSensitivity;
        this.pitch -= event.movementY * this.mouseSensitivity;
        
        // Clamp pitch to prevent camera flipping
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
      }
    });
    
    // Pointer lock setup
    document.addEventListener('click', () => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock();
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
  },

  updateCamera(playerPosition, playerModel) {
    // Apply camera rotation based on yaw and pitch
    const qx = new THREE.Quaternion();
    qx.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    
    // Calculate camera position based on the player and rotation
    const offset = new THREE.Vector3(0, this.cameraHeight, this.cameraDistance);
    offset.applyQuaternion(qx); // Rotate offset by yaw
    
    // Set camera position
    const targetCameraPosition = playerPosition.clone().add(offset);
    this.camera.position.copy(targetCameraPosition);
    
    // Apply pitch to camera (looking up/down)
    this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    
    // Return camera forward direction (flattened) for movement calculations
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    forward.normalize();
    
    // Rotate the player model to match camera direction unless in free look mode
    if (playerModel && !this.freeLookActive) {
      playerModel.rotation.y = this.yaw + Math.PI; // Add PI to rotate 180 degrees
    }
    
    return {
      forward: forward,
      right: new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).normalize()
    };
  }
};