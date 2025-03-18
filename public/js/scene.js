const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  renderer: new THREE.WebGLRenderer({ antialias: true }),
  cameraOffset: new THREE.Vector3(0, 12, 12), // Behind and above
  cameraYaw: 0, // Horizontal rotation (mouse X)
  cameraPitch: 0, // Vertical rotation (mouse Y)
  freeLook: false,

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    this.scene.add(directionalLight);

    // Terrain
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
    this.camera.position.set(0, 2, 5);

    // Mouse controls
    document.addEventListener('mousemove', (event) => this.onMouseMove(event));
    document.body.requestPointerLock(); // Lock mouse for smooth control

    document.addEventListener('mousedown', (event) => {
      if (event.button === 2) this.freeLook = true; // Right-click
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 2) this.freeLook = false;
    });
  },

  onMouseMove(event) {
    const sensitivity = 0.002;
    this.cameraYaw -= event.movementX * sensitivity;
    this.cameraPitch -= event.movementY * sensitivity;
    this.cameraPitch = Math.max(-Math.PI / 4, Math.min(Math.PI / 4, this.cameraPitch)); // Limit pitch
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
    const cameraQuaternion = new THREE.Quaternion();
    cameraQuaternion.setFromEuler(new THREE.Euler(this.cameraPitch, this.cameraYaw, 0, 'YXZ'));

    if (!this.freeLook) {
    const playerYaw = this.cameraYaw + Math.PI;
    const playerYawQuaternion = new THREE.Quaternion();
    playerYawQuaternion.setFromEuler(new THREE.Euler(0, playerYaw, 0, 'YXZ'));
    playerRotation.slerp(playerYawQuaternion, 0.1); // Smooth rotation
    }

    const offset = this.cameraOffset.clone();
    offset.applyQuaternion(cameraQuaternion);
    const targetPosition = playerPosition.clone().add(offset);
    this.camera.position.lerp(targetPosition, 0.1); // Smooth position

    const lookAtPosition = playerPosition.clone();
    lookAtPosition.y += 2.5;
    this.camera.lookAt(lookAtPosition);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cameraQuaternion);
    return forward;
  },
};