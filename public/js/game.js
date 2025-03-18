const Game = {
  player: null,
  otherPlayers: {},
  moveForward: false,
  moveBackward: false,
  moveLeft: false,
  moveRight: false,
  mechModel: null,

  loadMechModel() {
    return new Promise((resolve) => {
      const loader = new THREE.FBXLoader();
      loader.load('assets/models/mech.fbx', (fbx) => {
        // Scale down the model to appropriate size
        fbx.scale.set(0.005, 0.005, 0.005);
        
        // Center the model and raise it slightly above the ground
        fbx.position.y = 0.1;
        
        // Enable shadows for all meshes in the model
        fbx.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // Ensure materials are set to properly interact with lighting
            if (child.material) {
              // If the material is an array, process each one
              if (Array.isArray(child.material)) {
                child.material.forEach(material => {
                  material.needsUpdate = true;
                });
              } else {
                // Convert BasicMaterial to StandardMaterial if needed
                if (child.material.isMeshBasicMaterial) {
                  const color = child.material.color;
                  child.material = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.7,
                    metalness: 0.3
                  });
                }
                child.material.needsUpdate = true;
              }
            }
          }
        });
        
        // Store the model for cloning
        this.mechModel = fbx;
        resolve(fbx);
      });
    });
  },

  async init(socket) {
    // Load the mech model first
    const playerModel = await this.loadMechModel();
    this.player = playerModel.clone();
    
    // Set initial position
    this.player.position.set(0, 0, 0);
    
    // Add to scene
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
    // Clone the mech model for other players
    if (!this.mechModel) {
      console.error("Mech model not loaded yet");
      return null;
    }
    
    const mesh = this.mechModel.clone();
    mesh.position.set(0, 0, 0);
    
    // Use a different color material to distinguish from the player
    mesh.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        
        if (child.material) {
          child.material = child.material.clone();
          
          // If it's a MeshStandardMaterial, just change the color
          if (child.material.isMeshStandardMaterial) {
            child.material.color.setHex(0xff0000); // Red color for other players
          } 
          // Otherwise, convert to MeshStandardMaterial
          else {
            const color = child.material.color ? child.material.color : new THREE.Color(0xff0000);
            child.material = new THREE.MeshStandardMaterial({
              color: color,
              roughness: 0.7,
              metalness: 0.3
            });
          }
          
          child.material.needsUpdate = true;
        }
      }
    });
    
    return {
      mesh: mesh,
      targetPosition: new THREE.Vector3(0, 0, 0),
      lastPosition: new THREE.Vector3(0, 0, 0)
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
