const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  renderer: new THREE.WebGLRenderer({ antialias: true }),

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    document.body.appendChild(this.renderer.domElement);

    // Add lighting
    // Ambient light for overall scene illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);
    
    // Directional light for shadows and directional illumination
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
    terrainTexture.repeat.set(10, 10); // Repeat texture for larger area
    const terrainMaterial = new THREE.MeshStandardMaterial({ 
      map: terrainTexture,
      roughness: 0.8,
      metalness: 0.2
    });
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2; // Lay flat
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Camera position
    this.camera.position.set(0, 5, 10);
    this.camera.lookAt(0, 0, 0);
  },

  add(object) {
    this.scene.add(object);
  },

  remove(object) {
    this.scene.remove(object);
  },

  render() {
    this.renderer.render(this.scene, this.camera);
  }
};
