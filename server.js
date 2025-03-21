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

// Game state - store player positions
let players = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // --- Network Diagnostics ---
  let lastUpdateTimestamp = Date.now();
  let sentPackets = 0;
  let lostPackets = 0; // Placeholder - requires more sophisticated tracking

  // Periodically send network statistics to the client
  const networkStatsInterval = setInterval(() => {
    const now = Date.now();
    const latency = now - lastUpdateTimestamp; // Simple latency estimate
    const packetLoss = lostPackets / (sentPackets + lostPackets) * 100 || 0; // Calculate packet loss
    // Reset packet counts (in a real implementation, you'd use sequence numbers)
    sentPackets = 0;
    lostPackets = 0;

    socket.emit('networkStats', {
      latency: latency,
      packetLoss: packetLoss,
      updateRate: 0, // Placeholder for now, will calculate on move
    });
  }, 1000); // Send every second

  // Add new player with default position
  players[socket.id] = {
    id: socket.id,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0,
    isRunning: false
  };

  // Tell others about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Send existing players to the new player
  socket.emit('existingPlayers', players);

  // Handle movement - simple position update
  socket.on('move', (moveData) => {
    if (!players[socket.id]) {
      lostPackets++;
      return;
    }

    if (!moveData || !moveData.position) {
      console.warn(`Invalid move data received from player ${socket.id}:`, moveData);
      lostPackets++;
      return;
    }

    // Update player position
    players[socket.id].position = moveData.position;
    players[socket.id].rotation = moveData.rotation;
    players[socket.id].isRunning = moveData.isRunning;

    // --- Server-Side Movement Logging ---
    // Only log if debug flag is set in the move data
    if (moveData.debug) {
      console.log(`[${Date.now()}] Movement - Player ${socket.id}:`, {
        position: moveData.position,
        rotation: moveData.rotation,
        isRunning: moveData.isRunning,
        sequence: moveData.sequence
      });
    }

    // Broadcast to all other clients
    const now = Date.now();
    const updateRate = now - lastUpdateTimestamp;
    lastUpdateTimestamp = now;
    sentPackets++;

    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position: players[socket.id].position,
      rotation: players[socket.id].rotation,
      isRunning: players[socket.id].isRunning,
      updateRate: updateRate,
      sequence: moveData.sequence
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    socket.broadcast.emit('playerDisconnected', socket.id);
    delete players[socket.id];
  });

  socket.on('projectileHit', (data) => {
    // Broadcast hit to all clients except sender
    socket.broadcast.emit('projectileHit', data);
  });
});

const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
});
