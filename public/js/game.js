const Game = {
  player: null,
  otherPlayers: {},
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,

  init(socket) {
    // Local player (cylinder as robot placeholder)
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.player = new THREE.Mesh(geometry, material);
    SceneManager.add(this.player);

    // Input handling
    document.addEventListener('keydown', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = true; break;
        case 's': this.moveBackward = true; break;
        case 'a': this.moveLeft = true; break;
        case 'd': this.moveRight = true; break;
      }
    });
    document.addEventListener('keyup', (event) => {
      switch (event.key) {
        case 'w': this.moveForward = false; break;
        case 's': this.moveBackward = false; break;
        case 'a': this.moveLeft = false; break;
        case 'd': this.moveRight = false; break;
      }
    });
  },

  createPlayerMesh(id) {
    const geometry = new THREE.CylinderGeometry(0.5, 0.5, 2, 16);
    const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 1, 0); // Raise slightly above terrain
    return {
      mesh: mesh,
      targetPosition: new THREE.Vector3(0, 1, 0),
      lastPosition: new THREE.Vector3(0, 1, 0)
    };
  },

  processInput() {
    const speed = 0.1;
    let delta = { dx: 0, dy: 0, dz: 0 };
    let moved = false;

    if (this.moveForward) {
      this.player.position.z -= speed;
      delta.dz = -speed;
      moved = true;
    }
    if (this.moveBackward) {
      this.player.position.z += speed;
      delta.dz = speed;
      moved = true;
    }
    if (this.moveLeft) {
      this.player.position.x -= speed;
      delta.dx = -speed;
      moved = true;
    }
    if (this.moveRight) {
      this.player.position.x += speed;
      delta.dx = speed;
      moved = true;
    }

    if (moved) {
      return delta;
    }
    return null;
  },

  interpolatePlayers() {
    for (let id in this.otherPlayers) {
      const player = this.otherPlayers[id];
      player.mesh.position.lerp(player.targetPosition, 0.1);
    }
  }
};