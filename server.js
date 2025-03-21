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

// World configuration
const WORLD_BOUNDS = {
  minX: -100, maxX: 100,
  minY: 0, maxY: 50,
  minZ: -100, maxZ: 100
};

const COLLISION_OBJECTS = [
  { type: 'sphere', position: {x: 10, y: 0, z: 10}, radius: 5 }
];

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

// Server-side movement validation
function validatePlayerMovement(currentPos, newPos, input) {
  const current = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
  const deltaTime = input.deltaTime || 0.016;
  let maxSpeed = 5.0;
  if (input.isRunning) maxSpeed *= 2;
  const maxDistance = maxSpeed * deltaTime * 1.2;

  const dx = newPos.x - current.x;
  const dy = newPos.y - current.y;
  const dz = newPos.z - current.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

  let validatedPos;
  if (distance > maxDistance) {
    const scale = maxDistance / distance;
    validatedPos = {
      x: current.x + dx * scale,
      y: current.y + dy * scale,
      z: current.z + dz * scale
    };
  } else {
    validatedPos = { x: newPos.x, y: newPos.y, z: newPos.z };
  }

  validatedPos.x = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, validatedPos.x));
  validatedPos.y = Math.max(WORLD_BOUNDS.minY, Math.min(WORLD_BOUNDS.maxY, validatedPos.y));
  validatedPos.z = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, validatedPos.z));

  for (const obj of COLLISION_OBJECTS) {
    if (obj.type === 'sphere') {
      const dx = validatedPos.x - obj.position.x;
      const dy = validatedPos.y - obj.position.y;
      const dz = validatedPos.z - obj.position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const minDistance = 2 + obj.radius;

      if (distance < minDistance) {
        const pushFactor = minDistance / Math.max(0.1, distance);
        validatedPos.x = obj.position.x + dx * pushFactor;
        validatedPos.z = obj.position.z + dz * pushFactor;
      }
    }
  }

  return validatedPos;
}

// Server-side rotation validation
function validatePlayerRotation(currentRot, newRot) {
  const len = Math.sqrt(
    newRot.x * newRot.x +
    newRot.y * newRot.y +
    newRot.z * newRot.z +
    newRot.w * newRot.w
  );
  if (Math.abs(len - 1) > 0.01) {
    console.warn(`Invalid quaternion from client: length = ${len}`);
    return {
      x: currentRot.x,
      y: currentRot.y,
      z: currentRot.z,
      w: currentRot.w
    };
  }
  return {
    x: newRot.x / len,
    y: newRot.y / len,
    z: newRot.z / len,
    w: newRot.w / len
  };
}

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
    },
    moveRateLimit: {
      lastMoveTime: Date.now(),
      moveCount: 0,
      warningCount: 0
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
  // Enhanced move handling with all suggestions combined
  socket.on('move', (moveData) => {
    const now = Date.now();
    const player = players[socket.id];
    const playerStats = networkStats.players[socket.id];

    // Rate limiting
    const moveRateLimit = player.moveRateLimit;
    moveRateLimit.moveCount++;
    if (now - moveRateLimit.lastMoveTime < 1000) {
      if (moveRateLimit.moveCount > 30) {
        moveRateLimit.warningCount++;
        console.warn(`Rate limit warning for player ${socket.id}: ${moveRateLimit.moveCount} moves/sec`);
        if (moveRateLimit.warningCount > 5) {
          console.error(`Kicking player ${socket.id} for exceeding rate limit`);
          socket.disconnect(true);
          return;
        }
        return;
      }
    } else {
      moveRateLimit.moveCount = 1;
      moveRateLimit.lastMoveTime = now;
      if (moveRateLimit.warningCount > 0) moveRateLimit.warningCount--;
    }

    // Validate move data
    if (!moveData || !moveData.position || !moveData.rotation || !moveData.input) {
      playerStats.lostPackets++;
      console.warn(`Invalid move data from player ${socket.id}:`, moveData);
      return;
    }

    // Validate and update player position
    const validatedPosition = validatePlayerMovement(
      player.transform.position,
      moveData.position,
      moveData.input
    );

    // Determine authoritative rotation (Suggestions 2 and 6)
    const dx = validatedPosition.x - player.transform.position.x;
    const dz = validatedPosition.z - player.transform.position.z;
    let validatedRotation;
    if (moveData.movementRotation && (dx !== 0 || dz !== 0)) {
      // Use client-provided movement rotation if available (Suggestion 6)
      validatedRotation = validatePlayerRotation(
        player.transform.rotation,
        moveData.movementRotation
      );
    } else if (dx !== 0 || dz !== 0) {
      // Derive rotation from movement direction (Suggestion 2)
      const angle = Math.atan2(dx, dz);
      validatedRotation = {
        x: 0,
        y: Math.sin(angle / 2),
        z: 0,
        w: Math.cos(angle / 2)
      };
    } else {
      // Fall back to client-reported rotation, validated (Suggestion 1)
      validatedRotation = validatePlayerRotation(
        player.transform.rotation,
        moveData.rotation
      );
    }

    // Update player transform with validated data
    player.transform = {
      position: validatedPosition,
      rotation: validatedRotation,
      scale: { x: 1, y: 1, z: 1 }
    };

    // Update player state
    player.state.isRunning = moveData.input.isRunning;

    // Calculate network metrics
    const lastUpdate = player.state.lastUpdateTimestamp;
    player.networkMetrics.updateRate = now - lastUpdate;
    player.networkMetrics.latency = moveData.timestamp ? now - moveData.timestamp : 0;
    player.state.lastUpdateTimestamp = now;

    // Update network stats
    playerStats.sentPackets++;
    playerStats.receivedPackets++;

    // Send authoritative state back to the sender
    socket.emit('moveValidated', {
      inputId: moveData.inputId,
      position: validatedPosition,
      rotation: validatedRotation,
      serverTime: now
    });

    // Broadcast validated move to other players
    socket.broadcast.emit('playerMoved', {
      id: socket.id,
      position: validatedPosition,
      rotation: validatedRotation,
      isRunning: moveData.input.isRunning,
      sequence: moveData.inputId,
      timestamp: now
    });

    // Optional detailed logging
    if (moveData.debug) {
      console.log(`[${now}] Player ${socket.id} Move:`, {
        position: validatedPosition,
        rotation: validatedRotation,
        isRunning: moveData.input.isRunning,
        sequence: moveData.inputId,
        latency: player.networkMetrics.latency
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
