const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  renderer: new THREE.WebGLRenderer({ antialias: true }),
  defaultOffset: new THREE.Vector3(2, 30, 18), // Right shoulder, default
  aimOffset: new THREE.Vector3(2, 50, 0),      // Right shoulder, aiming
  cameraOffset: null,
  cameraYaw: 0,
  cameraPitch: 0,
  leftShoulder: false,
  isAiming: false,
  freeLook: false,

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // Initialize camera offset
    this.cameraOffset = this.defaultOffset.clone();

    // Lighting (unchanged)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    this.scene.add(directionalLight);

    // Terrain (unchanged)
    const terrainGeometry = new THREE.PlaneGeometry(50, 50);
    const textureLoader = new THREE.TextureLoader();
    const terrainTexture = textureLoader.load('assets/grid.png');
    terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping;
    terrainTexture.repeat.set(10, 10);
    const terrainMaterial = new THREE.MeshStandardMaterial({ 
      map: terrainTexture,
      roughness: 0.8,
      metalness: 0.2
    });
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Initial camera setup
    this.camera.position.set(2, 32, 18);

    // Mouse and input controls
    document.addEventListener('mousemove', (event) => this.onMouseMove(event));
    document.addEventListener('mousedown', (event) => {
      if (event.button === 1) { // Middle mouse for free-look
        this.freeLook = true;
      } else if (event.button === 2) { // Right-click for zoom/aim
        event.preventDefault(); // Stop context menu
        this.isAiming = true;
        this.cameraOffset.copy(this.aimOffset);
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
      }
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 1) { // Middle mouse release
        this.freeLook = false;
      } else if (event.button === 2) { // Right-click release
        event.preventDefault();
        this.isAiming = false;
        this.cameraOffset.copy(this.defaultOffset);
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
      }
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'q') {
        this.leftShoulder = !this.leftShoulder;
        const xOffset = this.leftShoulder ? -2 : 2;
        this.defaultOffset.x = xOffset;
        this.aimOffset.x = xOffset;
        if (!this.isAiming) this.cameraOffset.x = xOffset;
      }
    });
    // Prevent context menu globally on canvas
    this.renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());
    document.body.requestPointerLock();
  },

  onMouseMove(event) {
    const sensitivity = 0.002;
    this.cameraYaw -= event.movementX * sensitivity;
    this.cameraPitch -= event.movementY * sensitivity;
    this.cameraPitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.cameraPitch));
  },

  add(object) {
    this.scene.add(object);
  },

  remove(object) {
    this.scene.remove(object);
  },

  render() {
    this.renderer.render(this.scene, this.camera);
  },

  updateCamera(playerPosition, playerRotation) {
    // Camera rotation
    const targetCameraQuaternion = new THREE.Quaternion();
    targetCameraQuaternion.setFromEuler(new THREE.Euler(this.cameraPitch, this.cameraYaw, 0, 'YXZ'));
    this.camera.quaternion.slerp(targetCameraQuaternion, 0.1);

    // Player rotation (adjusted for reverse-oriented .fbx)
    if (!this.freeLook) {
      const playerYaw = this.cameraYaw + Math.PI;
      const targetPlayerQuaternion = new THREE.Quaternion();
      targetPlayerQuaternion.setFromEuler(new THREE.Euler(0, playerYaw, 0, 'YXZ'));
      playerRotation.slerp(targetPlayerQuaternion, 0.1);
    }

    // Calculate ideal camera position
    const offset = this.cameraOffset.clone();
    offset.applyQuaternion(targetCameraQuaternion);
    let targetCameraPosition = playerPosition.clone().add(offset);

    // Collision detection
    const raycaster = new THREE.Raycaster(playerPosition, offset.clone().normalize(), 0, offset.length());
    const intersects = raycaster.intersectObjects(this.scene.children, true);
    if (intersects.length > 0 && intersects[0].distance < offset.length()) {
      targetCameraPosition = playerPosition.clone().add(
        offset.normalize().multiplyScalar(Math.max(intersects[0].distance * 0.9, 2))
      );
    }

    // Smoothly move camera with height clamp
    this.camera.position.lerp(targetCameraPosition, 0.1);
    if (this.camera.position.y < playerPosition.y + 2) {
      this.camera.position.y = playerPosition.y + 2;
    }

    // Look at a point above the player
    const lookAtPosition = playerPosition.clone();
    lookAtPosition.y += 2.5;
    this.camera.lookAt(lookAtPosition);

    // Return forward direction
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return forward;
  }
};