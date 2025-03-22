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

// Game state
const players = new Map();
const TICK_RATE = 60;
const MAX_PLAYERS = 16;
const INACTIVE_TIMEOUT = 300000; // 5 minutes
const moveRateLimit = new Map();
const MIN_MOVE_INTERVAL = 16; // ~60fps max
const projectiles = new Map(); // Map<projectileId, projectileData>
let nextProjectileId = 0;

// Validation functions
function isValidMoveData(data) {
  return data && 
         typeof data.position === 'object' &&
         typeof data.position.x === 'number' &&
         typeof data.position.y === 'number' &&
         typeof data.position.z === 'number' &&
         typeof data.rotation === 'object' &&
         typeof data.inputId === 'number' &&
         typeof data.input === 'object' &&
         typeof data.input.moveForward === 'boolean' &&
         typeof data.input.moveBackward === 'boolean' &&
         typeof data.input.moveLeft === 'boolean' &&
         typeof data.input.moveRight === 'boolean' &&
         typeof data.input.isRunning === 'boolean';
}

function isValidMovement(oldPos, newPos) {
  // Basic distance check to prevent teleporting
  const maxDistance = 1.0; // Maximum distance per update
  const dx = newPos.x - oldPos.x;
  const dy = newPos.y - oldPos.y;
  const dz = newPos.z - oldPos.z;
  const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  return distance <= maxDistance;
}

function isValidShootData(data) {
  return data &&
         typeof data.position === 'object' &&
         typeof data.direction === 'object';
}

function isValidWeaponPickupData(data) {
  return data &&
         typeof data.weaponId === 'string' &&
         typeof data.weaponType === 'string' &&
         typeof data.socketName === 'string';
}

// Socket connection handling
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Reject if server full
  if (players.size >= MAX_PLAYERS) {
    console.log('Server full, rejecting connection');
    socket.disconnect();
    return;
  }

  // Initialize player
    players.set(socket.id, {
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    lastProcessedInput: 0,
    lastActive: Date.now(),
    lastUpdateTime: Date.now(), // Add this
    moveState: {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      isRunning: false
    }
  });

  // Send initial state to new player
  socket.emit('gameState', {
    timestamp: Date.now(),
    players: Array.from(players.entries()).map(([id, data]) => ({
      id,
      position: data.position,
      rotation: data.rotation,
      lastProcessedInput: data.lastProcessedInput
    }))
  });

  // Handle movement
  socket.on('move', (data) => {
    // Rate limiting
    const now = Date.now();
    const lastMove = moveRateLimit.get(socket.id) || 0;
    if (now - lastMove < MIN_MOVE_INTERVAL) return;
    moveRateLimit.set(socket.id, now);

    // Validate data
    if (!isValidMoveData(data)) {
      console.warn(`Invalid move data from ${socket.id}`);
      return;
    }

    const player = players.get(socket.id);
    if (player) {
      // Validate movement
      if (isValidMovement(player.position, data.position)) {
        player.position = data.position;
        player.rotation = data.rotation;
        player.lastProcessedInput = data.inputId;
        player.lastActive = now;
        player.lastUpdateTime = now; // Add this line
        
        // Update movement state
        player.moveState = {
          moveForward: data.input.moveForward,
          moveBackward: data.input.moveBackward,
          moveLeft: data.input.moveLeft,
          moveRight: data.input.moveRight,
          isRunning: data.input.isRunning
        };
      } else {
        // If invalid movement, force client position reset
        socket.emit('positionCorrection', {
          position: player.position,
          rotation: player.rotation
        });
      }
    }
  });

  // Handle shooting
  socket.on('shootProjectile', (data) => {
    // Validate projectile data
    if (!isValidShootData(data)) {
      console.warn(`Invalid shoot data from ${socket.id}`);
      return;
    }

    // Generate a unique ID for this projectile
    const projectileId = nextProjectileId++;
    
    // Store projectile data on server
    const projectileData = {
      id: projectileId,
      ownerId: socket.id,
      position: data.position,
      direction: data.direction,
      weaponType: data.weaponType,
      velocity: data.velocity,
      createdAt: Date.now(),
      active: true
    };
    
    projectiles.set(projectileId, projectileData);
    
    // Broadcast projectile creation to all clients (including shooter)
    io.emit('projectileCreated', projectileData);
    
    // Automatically remove projectile after maximum lifetime
    // This ensures cleanup even if hit detection fails
    setTimeout(() => {
      if (projectiles.has(projectileId) && projectiles.get(projectileId).active) {
        projectiles.delete(projectileId);
        io.emit('projectileDestroyed', { id: projectileId, reason: 'timeout' });
      }
    }, 5000); // 5 second maximum lifetime
  });

  // Handle projectile hit reports from clients
  socket.on('projectileHit', (data) => {
    // Validate data first
    if (!data || typeof data.projectileId !== 'number' || !data.position) {
      return;
    }
    
    // Check if projectile exists and is still active
    const projectile = projectiles.get(data.projectileId);
    if (!projectile || !projectile.active) {
      return;
    }
    
    // Mark projectile as inactive
    projectile.active = false;
    projectiles.delete(data.projectileId);
    
    // Broadcast hit to all players
    io.emit('projectileDestroyed', {
      id: data.projectileId,
      position: data.position,
      hitPlayerId: data.hitPlayerId,
      sourcePlayerId: projectile.ownerId,
      reason: 'hit'
    });
  });

  // Handle weapon pickups
  socket.on('weaponPickup', (data) => {
    // Validate weapon pickup data
    if (!isValidWeaponPickupData(data)) {
      console.warn(`Invalid weapon pickup data from ${socket.id}`, data);
      return;
    }

    // Broadcast pickup to all players except the one who picked it up
    socket.broadcast.emit('weaponPickedUp', {
      weaponId: data.weaponId,
      weaponType: data.weaponType,
      socketName: data.socketName,
      playerId: socket.id
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    players.delete(socket.id);
    moveRateLimit.delete(socket.id);
    io.emit('playerLeft', socket.id);
  });
});

  // Server update loop - combined player and projectile updates
  setInterval(() => {
    const now = Date.now();
    
    // --- PLAYER UPDATES ---
    // Remove inactive players
    for (const [id, player] of players) {
      if (now - player.lastActive > INACTIVE_TIMEOUT) {
        console.log(`Removing inactive player: ${id}`);
        players.delete(id);
        io.emit('playerLeft', id);
      }
    }

    // --- PROJECTILE UPDATES ---
    const updatedProjectiles = [];
    
    // Update projectile positions
    for (const [id, projectile] of projectiles.entries()) {
      if (!projectile.active) continue;
      
      // Calculate time delta since creation
      const deltaTime = (now - projectile.createdAt) / 1000;
      
      // Update position based on velocity and direction
      const speed = projectile.weaponType === 'cannon' ? 300 : 25;
      const newPosition = {
        x: projectile.position.x + projectile.direction.x * speed * deltaTime,
        y: projectile.position.y + projectile.direction.y * speed * deltaTime,
        z: projectile.position.z + projectile.direction.z * speed * deltaTime
      };
      
      // Update projectile data
      projectile.position = newPosition;
      
      // Check for projectile lifetime
      const maxLifetime = 5000; // 5 seconds
      if (now - projectile.createdAt > maxLifetime) {
        // Mark for removal
        projectile.active = false;
        projectiles.delete(id);
        io.emit('projectileDestroyed', { id: id, reason: 'timeout' });
      } else {
        // Add to updates batch
        updatedProjectiles.push({
          id: projectile.id,
          position: newPosition,
        });
      }
      
      // TODO: Add server-side collision detection here if desired
    }

    // --- SEND GAME STATE TO CLIENTS ---
    // Prepare game state update
    const gameState = {
      timestamp: now,
      players: Array.from(players.entries()).map(([id, data]) => ({
        id,
        position: data.position,
        rotation: data.rotation,
        lastProcessedInput: data.lastProcessedInput,
        moveState: data.moveState,
        timestamp: now,
        timeSinceLastUpdate: now - (data.lastUpdateTime || now),
      }))
    };
    
    // Add projectile updates if any exist
    if (updatedProjectiles.length > 0) {
      gameState.projectiles = updatedProjectiles;
    }
    
    // Send combined game state
    io.emit('gameState', gameState);
    
  }, 1000 / TICK_RATE);

const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Max players: ${MAX_PLAYERS}`);
  console.log(`Tick rate: ${TICK_RATE}Hz`);
});
