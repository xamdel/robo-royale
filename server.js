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

// Game state - store player positions with enhanced transform
let players = {};

// Network performance tracking
const networkStats = {
  players: {},
  globalStats: {
    totalLatency: 0,
    packetLossRate: 0,
    updateFrequency: 0
  }
};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Initialize player with comprehensive transform
  players[socket.id] = {
    id: socket.id,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 }, // Identity quaternion
      scale: { x: 1, y: 1, z: 1 }
    },
    state: {
      isRunning: false,
      health: 100,
      lastUpdateTimestamp: Date.now()
    },
    networkMetrics: {
      latency: 0,
      packetLoss: 0,
      updateRate: 0
    }
  };

  // Network performance tracking for this player
  networkStats.players[socket.id] = {
    sentPackets: 0,
    receivedPackets: 0,
    lostPackets: 0
  };

  // Notify other players about new player
  socket.broadcast.emit('newPlayer', {
    id: socket.id,
    position: players[socket.id].transform.position,
    rotation: players[socket.id].transform.rotation,
    isRunning: players[socket.id].state.isRunning
  });

  // Send existing players to new player
  socket.emit('existingPlayers', players);

  // Periodic network stats calculation
  const networkStatsInterval = setInterval(() => {
    const playerStats = networkStats.players[socket.id];
    const packetLoss = playerStats.lostPackets / (playerStats.sentPackets + 1) * 100;

    socket.emit('networkStats', {
      latency: players[socket.id].networkMetrics.latency,
      packetLoss: packetLoss,
      updateRate: players[socket.id].networkMetrics.updateRate
    });
  }, 1000);

  // Enhanced move handling with comprehensive validation
  socket.on('move', (moveData) => {
    const now = Date.now();
    const playerStats = networkStats.players[socket.id];

    // Validate move data
    if (!moveData || !moveData.position || !moveData.rotation) {
      playerStats.lostPackets++;
      console.warn(`Invalid move data from player ${socket.id}:`, moveData);
      return;
    }

    // Update player transform
    players[socket.id].transform = {
      position: moveData.position,
      rotation: moveData.rotation,
      scale: { x: 1, y: 1, z: 1 }
    };

    // Update player state
    players[socket.id].state.isRunning = moveData.isRunning;
    
    // Calculate network metrics
    const lastUpdate = players[socket.id].state.lastUpdateTimestamp;
    players[socket.id].networkMetrics.updateRate = now - lastUpdate;
    players[socket.id].networkMetrics.latency = moveData.timestamp ? now - moveData.timestamp : 0;
    players[socket.id].state.lastUpdateTimestamp = now;

    // Update network stats
    playerStats.sentPackets++;
    playerStats.receivedPackets++;

    // Broadcast move to other players
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position: moveData.position,
      rotation: moveData.rotation,
      isRunning: moveData.isRunning,
      sequence: moveData.sequence,
      timestamp: moveData.timestamp
    });

    // Optional detailed logging
    if (moveData.debug) {
      console.log(`[${now}] Player ${socket.id} Move:`, {
        position: moveData.position,
        rotation: moveData.rotation,
        isRunning: moveData.isRunning,
        sequence: moveData.sequence,
        latency: players[socket.id].networkMetrics.latency
      });
    }
  });

  // Handle player disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    socket.broadcast.emit('playerDisconnected', socket.id);
    
    // Clean up player data
    delete players[socket.id];
    delete networkStats.players[socket.id];
    
    // Clear interval to prevent memory leaks
    clearInterval(networkStatsInterval);
  });

  // Projectile hit handling
  socket.on('projectileHit', (data) => {
    socket.broadcast.emit('projectileHit', data);
  });
});

const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
});
