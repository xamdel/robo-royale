import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const SceneManager = {
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000),
  renderer: new THREE.WebGLRenderer({ antialias: true }),
  defaultOffset: new THREE.Vector3(2, 2, 2),
  aimOffset: new THREE.Vector3(2, 12, 0),
  cameraOffset: null,
  cameraYaw: 0,
  cameraPitch: 0,
  leftShoulder: false,
  isAiming: false,
  freeLook: false,

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    document.body.appendChild(this.renderer.domElement);

    this.cameraOffset = this.defaultOffset.clone();

    const environment = new RoomEnvironment();
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    this.scene.environment = pmremGenerator.fromScene(environment).texture;
    environment.dispose();

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 100;
    this.scene.add(directionalLight);

    const lightHelper = new THREE.DirectionalLightHelper(directionalLight, 5);
    this.scene.add(lightHelper);

    const terrainGeometry = new THREE.PlaneGeometry(50, 50);
    const textureLoader = new THREE.TextureLoader();
    const terrainTexture = textureLoader.load('/assets/grid.png');
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

    const cubeGeometry = new THREE.BoxGeometry(2, 2, 2);
    const cubeMaterial = new THREE.MeshStandardMaterial({
      color: 0x00ff00,
      roughness: 0.5,
      metalness: 0.0
    });
    const testCube = new THREE.Mesh(cubeGeometry, cubeMaterial);
    testCube.position.set(5, 1, 5);
    testCube.castShadow = true;
    testCube.receiveShadow = true;
    this.scene.add(testCube);

    this.camera.position.set(2, 32, 18);

    document.addEventListener('mousemove', (event) => this.onMouseMove(event));
    document.addEventListener('mousedown', (event) => {
      if (event.button === 1) {
        this.freeLook = true;
      } else if (event.button === 2) {
        event.preventDefault();
        this.isAiming = true;
        this.cameraOffset.copy(this.aimOffset);
        this.camera.fov = 50;
        this.camera.updateProjectionMatrix();
      }
    });
    document.addEventListener('mouseup', (event) => {
      if (event.button === 1) {
        this.freeLook = false;
      } else if (event.button === 2) {
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
    const targetCameraQuaternion = new THREE.Quaternion();
    targetCameraQuaternion.setFromEuler(new THREE.Euler(this.cameraPitch, this.cameraYaw, 0, 'YXZ'));
    this.camera.quaternion.slerp(targetCameraQuaternion, 0.1);

    if (!this.freeLook) {
      const playerYaw = this.cameraYaw;
      const targetPlayerQuaternion = new THREE.Quaternion();
      targetPlayerQuaternion.setFromEuler(new THREE.Euler(0, playerYaw, 0, 'YXZ'));
      playerRotation.slerp(targetPlayerQuaternion, 0.1);
    }

    const offset = this.cameraOffset.clone();
    offset.applyQuaternion(targetCameraQuaternion);
    let targetCameraPosition = playerPosition.clone().add(offset);

    const raycaster = new THREE.Raycaster(playerPosition, offset.clone().normalize(), 0, offset.length());
    const intersects = raycaster.intersectObjects(this.scene.children, true);
    if (intersects.length > 0 && intersects[0].distance < offset.length()) {
      targetCameraPosition = playerPosition.clone().add(
        offset.normalize().multiplyScalar(Math.max(intersects[0].distance * 0.9, 2))
      );
    }

    this.camera.position.lerp(targetCameraPosition, 0.1);
    if (this.camera.position.y < playerPosition.y + 2) {
      this.camera.position.y = playerPosition.y + 2;
    }

    const lookAtPosition = playerPosition.clone();
    lookAtPosition.y += 2.5;
    this.camera.lookAt(lookAtPosition);

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    return forward;
  }
};