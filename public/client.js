const socket = io();
let players = {};

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Local player cube
const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Green for local player
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
camera.position.z = 5;

// Create other player meshes
function createPlayerMesh(id) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Red for others
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  scene.add(mesh);
  return {
    mesh: mesh,
    targetPosition: new THREE.Vector3(0, 0, 0),
    lastPosition: new THREE.Vector3(0, 0, 0)
  };
}

// Socket events
socket.on('connect', () => {
  console.log('Connected to server');
});

socket.on('existingPlayers', (serverPlayers) => {
  for (let id in serverPlayers) {
    if (id !== socket.id) {
      players[id] = createPlayerMesh(id);
      players[id].targetPosition.set(
        serverPlayers[id].position.x,
        serverPlayers[id].position.y,
        serverPlayers[id].position.z
      );
      players[id].lastPosition.copy(players[id].targetPosition);
    } else {
      cube.position.set(
        serverPlayers[id].position.x,
        serverPlayers[id].position.y,
        serverPlayers[id].position.z
      );
    }
  }
});

socket.on('newPlayer', (player) => {
  if (player.id !== socket.id) {
    players[player.id] = createPlayerMesh(player.id);
    players[player.id].targetPosition.set(
      player.position.x,
      player.position.y,
      player.position.z
    );
    players[player.id].lastPosition.copy(players[player.id].targetPosition);
  }
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].lastPosition.copy(players[data.id].mesh.position);
    players[data.id].targetPosition.set(
      data.position.x,
      data.position.y,
      data.position.z
    );
  }
});

socket.on('playerDisconnected', (id) => {
  if (players[id]) {
    scene.remove(players[id].mesh);
    delete players[id];
  }
});

// Movement controls
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

document.addEventListener('keydown', (event) => {
  switch (event.key) {
    case 'w': moveForward = true; break;
    case 's': moveBackward = true; break;
    case 'a': moveLeft = true; break;
    case 'd': moveRight = true; break;
  }
});

document.addEventListener('keyup', (event) => {
  switch (event.key) {
    case 'w': moveForward = false; break;
    case 's': moveBackward = false; break;
    case 'a': moveLeft = false; break;
    case 'd': moveRight = false; break;
  }
});

// Apply movement locally and send delta to server
function processInput() {
  const speed = 0.1;
  let delta = { dx: 0, dy: 0, dz: 0 };
  let moved = false;

  if (moveForward) {
    cube.position.z -= speed;
    delta.dz = -speed;
    moved = true;
  }
  if (moveBackward) {
    cube.position.z += speed;
    delta.dz = speed;
    moved = true;
  }
  if (moveLeft) {
    cube.position.x -= speed;
    delta.dx = -speed;
    moved = true;
  }
  if (moveRight) {
    cube.position.x += speed;
    delta.dx = speed;
    moved = true;
  }

  if (moved) {
    socket.emit('move', { delta: delta });
  }
}

// Interpolate other players
function interpolatePlayers() {
  for (let id in players) {
    const player = players[id];
    player.mesh.position.lerp(player.targetPosition, 0.1);
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  processInput(); // Client-side prediction with deltas
  interpolatePlayers(); // Basic interpolation
  renderer.render(scene, camera);
}

animate();