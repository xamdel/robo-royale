const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Serve static files from the dist directory when in production
// In development, Vite's dev server will handle this
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
  });
} else {
  // For development, just serve the socket.io endpoint
  app.get('/', (req, res) => {
    res.send('Socket.io server running. Connect via Vite dev server at http://localhost:5173');
  });
}

// Game state
let players = {};
const serverTickRate = 30; // Server updates per second
const serverTickInterval = 1000 / serverTickRate;
const clientInputQueues = {}; // Store incoming client inputs to process in fixed update

// Start server-side game loop
setInterval(() => {
  processAllClientInputs();
}, serverTickInterval);

function processAllClientInputs() {
  // Process each client's input queue
  for (const clientId in clientInputQueues) {
    const inputQueue = clientInputQueues[clientId];
    
    if (inputQueue.length > 0) {
      // Process all inputs in queue
      inputQueue.forEach(moveData => {
        processPlayerMovement(clientId, moveData);
      });
      
      // Clear the queue
      clientInputQueues[clientId] = [];
      
      // Broadcast final position to all clients
      io.emit('playerMoved', { 
        id: clientId, 
        position: players[clientId].position,
        rotation: players[clientId].rotation,
        lastProcessedInput: players[clientId].lastProcessedInput
      });
    }
  }
}

function processPlayerMovement(clientId, moveData) {
  if (!players[clientId]) return;
  
  const player = players[clientId];
  const delta = moveData.delta;
  const maxSpeed = 0.2; // Maximum allowed speed per frame
  
  // Update last processed input for reconciliation
  player.lastProcessedInput = moveData.sequence;
  
  // Basic validation: ensure delta doesn't exceed max speed
  if (Math.abs(delta.dx) <= maxSpeed &&
      Math.abs(delta.dy) <= maxSpeed &&
      Math.abs(delta.dz) <= maxSpeed) {
    
    // Apply movement
    player.position.x += delta.dx;
    player.position.y += delta.dy;
    player.position.z += delta.dz;
    
    // Update rotation if provided
    if (delta.rotation !== undefined) {
      player.rotation = delta.rotation;
    }
    
    // Simple collision detection with boundaries (as an example)
    const worldBounds = 25; // Half width/length of the terrain
    player.position.x = Math.max(-worldBounds, Math.min(worldBounds, player.position.x));
    player.position.z = Math.max(-worldBounds, Math.min(worldBounds, player.position.z));
  } else {
    console.log(`Invalid move rejected for ${clientId}:`, delta);
    
    // Send correction to the client
    io.to(clientId).emit('serverCorrection', {
      position: player.position,
      rotation: player.rotation,
      lastProcessedInput: player.lastProcessedInput
    });
  }
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Add new player
  players[socket.id] = {
    id: socket.id,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    lastProcessedInput: 0
  };
  
  // Initialize input queue for this client
  clientInputQueues[socket.id] = [];

  // Tell others about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Send existing players to the new player
  socket.emit('existingPlayers', players);

  // Handle movement with delta and validation
  socket.on('move', (moveData) => {
    // Add the input to the queue for processing in the next server tick
    if (clientInputQueues[socket.id]) {
      clientInputQueues[socket.id].push(moveData);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    delete clientInputQueues[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
});