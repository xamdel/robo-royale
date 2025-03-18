const socket = io();
let players = {};

socket.on('connect', () => {
  console.log('Connected to server');
});

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const geometry = new THREE.BoxGeometry(1, 1, 1);
const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);
camera.position.z = 5;

function createPlayerMesh(id) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  return mesh;
}

socket.on('existingPlayers', (serverPlayers) => {
  for (let id in serverPlayers) {
    if (id !== socket.id) {
      players[id] = createPlayerMesh(id);
      players[id].position.set(
        serverPlayers[id].position.x,
        serverPlayers[id].position.y,
        serverPlayers[id].position.z
      );
    }
  }
});

socket.on('newPlayer', (player) => {
  players[player.id] = createPlayerMesh(player.id);
  players[player.id].position.set(
    player.position.x,
    player.position.y,
    player.position.z
  );
});

socket.on('playerMoved', (data) => {
  if (players[data.id]) {
    players[data.id].position.set(
      data.position.x,
      data.position.y,
      data.position.z
    );
  }
});

socket.on('playerDisconnected', (id) => {
  if (players[id]) {
    scene.remove(players[id]);
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

function animate() {
  requestAnimationFrame(animate);

  const speed = 0.1;
  if (moveForward) cube.position.z -= speed;
  if (moveBackward) cube.position.z += speed;
  if (moveLeft) cube.position.x -= speed;
  if (moveRight) cube.position.x += speed;

  socket.emit('move', { position: cube.position });

  renderer.render(scene, camera);
}
animate();