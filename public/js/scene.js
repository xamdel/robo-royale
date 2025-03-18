const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  renderer: new THREE.WebGLRenderer(),

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(this.renderer.domElement);

    // Terrain
    const terrainGeometry = new THREE.PlaneGeometry(50, 50);
    const textureLoader = new THREE.TextureLoader();
    const terrainTexture = textureLoader.load('assets/grid.png');
    terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping;
    terrainTexture.repeat.set(10, 10); // Repeat texture for larger area
    const terrainMaterial = new THREE.MeshBasicMaterial({ map: terrainTexture });
    const terrain = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrain.rotation.x = -Math.PI / 2; // Lay flat
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