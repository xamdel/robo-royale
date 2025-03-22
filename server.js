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

// Function to validate client hit suggestions
function validateProjectileHit(hitData, projectile) {
  // Check if projectile exists and is still active
  if (!projectile || !projectile.active) return false;
  
  // Get hit player
  const hitPlayer = players.get(hitData.hitPlayerId);
  if (!hitPlayer) return false;
  
  // Get ray origin and direction
  const rayOrigin = hitData.prevPosition || projectile.prevPosition || projectile.position;
  const rayDest = hitData.position;
  
  // Calculate ray direction
  const rayDir = {
    x: rayDest.x - rayOrigin.x,
    y: rayDest.y - rayOrigin.y,
    z: rayDest.z - rayOrigin.z
  };
  
  // Calculate ray length
  const rayLength = Math.sqrt(
    rayDir.x * rayDir.x +
    rayDir.y * rayDir.y +
    rayDir.z * rayDir.z
  );
  
  // Normalize ray direction
  if (rayLength > 0.0001) {
    rayDir.x /= rayLength;
    rayDir.y /= rayLength;
    rayDir.z /= rayLength;
    
    // Get player position
    const playerPos = hitPlayer.position;
    
    // Create player compound collider with multiple spheres
    const capsuleHeight = 4.0;
    const capsuleRadius = 1.0;
    
    // Define sphere colliders
    const spheres = [
      // Top sphere (head)
      {
        x: playerPos.x,
        y: playerPos.y + capsuleHeight/2,
        z: playerPos.z,
        radius: capsuleRadius
      },
      // Middle sphere (torso)
      {
        x: playerPos.x,
        y: playerPos.y + capsuleHeight/4,
        z: playerPos.z,
        radius: capsuleRadius
      },
      // Bottom sphere (legs)
      {
        x: playerPos.x,
        y: playerPos.y,
        z: playerPos.z,
        radius: capsuleRadius
      },
      // Cabin/cockpit sphere
      {
        x: playerPos.x,
        y: playerPos.y + 4.0, // cockpit height
        z: playerPos.z,
        radius: 0.7 // smaller radius for cabin
      }
    ];
    
    // Check for intersection with any sphere
    for (const sphere of spheres) {
      // Ray-sphere intersection
      const projectileRadius = projectile.radius || 
        (projectile.weaponType === 'cannon' ? 0.15 : 0.3);
      const combinedRadius = sphere.radius + projectileRadius;
      
      // Vector from ray origin to sphere center
      const oc = {
        x: rayOrigin.x - sphere.x,
        y: rayOrigin.y - sphere.y,
        z: rayOrigin.z - sphere.z
      };
      
      // Quadratic equation coefficients
      const a = 1; // Normalized ray direction
      const b = 2 * (rayDir.x * oc.x + rayDir.y * oc.y + rayDir.z * oc.z);
      const c = (oc.x * oc.x + oc.y * oc.y + oc.z * oc.z) - (combinedRadius * combinedRadius);
      
      // Calculate discriminant
      const discriminant = b * b - 4 * a * c;
      
      // If discriminant >= 0, ray intersects sphere
      if (discriminant >= 0) {
        // Calculate intersection distance
        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        
        // Check if intersection is within ray length and in front of ray
        if (t >= 0 && t <= rayLength) {
          // Calculate hit position
          const hitPosition = {
            x: rayOrigin.x + rayDir.x * t,
            y: rayOrigin.y + rayDir.y * t,
            z: rayOrigin.z + rayDir.z * t
          };
          
          return {
            hit: true,
            position: hitPosition,
            distance: t
          };
        }
      }
    }
  }
  
  return { hit: false };
}

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
    
    // Get weapon configuration
    const weaponType = data.weaponType || 'cannon';
    const projectileConfig = {
      // Default values
      speed: weaponType === 'cannon' ? 300 : 25,
      radius: weaponType === 'cannon' ? 0.15 : 0.3,
      maxDistance: weaponType === 'cannon' ? 100 : 80,
      maxLifetime: 5000 // 5 seconds
    };
    
    // Store projectile data on server
    const projectileData = {
      id: projectileId,
      ownerId: socket.id,
      position: data.position,
      direction: data.direction,
      weaponType: weaponType,
      speed: projectileConfig.speed,
      radius: projectileConfig.radius,
      createdAt: Date.now(),
      active: true,
      distanceTraveled: 0,
      maxDistance: projectileConfig.maxDistance
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
    }, projectileConfig.maxLifetime);
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
  
  // Handle client-side projectile hit suggestions
  socket.on('projectileHitSuggestion', (data) => {
    // Retrieve projectile from server's active projectiles
    const projectile = projectiles.get(data.projectileId);
    
    // If projectile doesn't exist or is already inactive, ignore
    if (!projectile || !projectile.active) return;
    
    // Validate hit using our ray casting function
    const validationResult = validateProjectileHit(data, projectile);
    
    if (validationResult.hit) {
      console.log(`Server validated client hit suggestion: projectile ${data.projectileId} hit player ${data.hitPlayerId} at distance ${validationResult.distance}`);
      
      // Mark projectile as inactive and remove
      projectile.active = false;
      projectiles.delete(data.projectileId);
      
      // Broadcast authoritative hit to all clients
      io.emit('projectileDestroyed', {
        id: data.projectileId,
        position: validationResult.position,
        hitPlayerId: data.hitPlayerId,
        sourcePlayerId: projectile.ownerId,
        reason: 'hit',
        serverConfirmed: true,
        clientLatencyMs: Date.now() - (data.timeMs || Date.now()) // For debugging
      });
    } else {
      console.log(`Server rejected client hit suggestion for projectile ${data.projectileId}, validation failed`);
    }
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
      
      // Calculate time delta since last update
      const prevUpdateTime = projectile.lastUpdateTime || projectile.createdAt;
      const deltaTime = (now - prevUpdateTime) / 1000;
      projectile.lastUpdateTime = now;
      
      // Store previous position for ray casting
      if (!projectile.prevPosition) {
        projectile.prevPosition = { ...projectile.position };
      }
      
      // Update position based on direction and speed
      const speed = projectile.speed || (projectile.weaponType === 'cannon' ? 300 : 25);
      const newPosition = {
        x: projectile.position.x + projectile.direction.x * speed * deltaTime,
        y: projectile.position.y + projectile.direction.y * speed * deltaTime,
        z: projectile.position.z + projectile.direction.z * speed * deltaTime
      };
      
      // Calculate distance traveled in this step
      const distanceStep = Math.sqrt(
        Math.pow(newPosition.x - projectile.position.x, 2) +
        Math.pow(newPosition.y - projectile.position.y, 2) +
        Math.pow(newPosition.z - projectile.position.z, 2)
      );
      
      // Add to total distance
      projectile.distanceTraveled = (projectile.distanceTraveled || 0) + distanceStep;
      
      // Check if projectile has exceeded max distance
      if (projectile.distanceTraveled > (projectile.maxDistance || 100)) {
        // Mark for removal
        projectile.active = false;
        projectiles.delete(id);
        io.emit('projectileDestroyed', { id, reason: 'maxDistance' });
        continue;
      }
      
      // Update projectile data
      projectile.prevPosition = { ...projectile.position };
      projectile.position = newPosition;
      
      // Check for projectile lifetime
      const maxLifetime = 5000; // 5 seconds
      if (now - projectile.createdAt > maxLifetime) {
        // Mark for removal
        projectile.active = false;
        projectiles.delete(id);
        io.emit('projectileDestroyed', { id, reason: 'timeout' });
      } else {
        // Add to updates batch
        updatedProjectiles.push({
          id: projectile.id,
          position: newPosition,
        });
        
        // Server-side ray-cast collision detection
        // Get previous projectile position
        const prevPosition = projectile.prevPosition || {
          x: projectile.position.x - projectile.direction.x * 0.1,
          y: projectile.position.y - projectile.direction.y * 0.1,
          z: projectile.position.z - projectile.direction.z * 0.1
        };
        
        // Store current position for next update
        projectile.prevPosition = { ...projectile.position };
        
        // For each player, check collisions with compound collider
        for (const [playerId, playerData] of players.entries()) {
          // Don't collide with own player
          if (playerId === projectile.ownerId) continue;
          
          // Get player data
          const playerPos = playerData.position;
          
          // COMPOUND COLLIDER APPROACH
          // 1. Body capsule - top, middle, and bottom spheres
          const capsuleHeight = 4.0;
          const capsuleRadius = 1.0;
          
          // Calculate sphere centers for capsule approximation
          const spheres = [
            // Top sphere (head)
            {
              x: playerPos.x,
              y: playerPos.y + capsuleHeight/2,
              z: playerPos.z,
              radius: capsuleRadius
            },
            // Middle sphere (torso)
            {
              x: playerPos.x,
              y: playerPos.y + capsuleHeight/4,
              z: playerPos.z,
              radius: capsuleRadius
            },
            // Bottom sphere (legs)
            {
              x: playerPos.x,
              y: playerPos.y,
              z: playerPos.z,
              radius: capsuleRadius
            },
            // Cabin/cockpit sphere
            {
              x: playerPos.x,
              y: playerPos.y + 4.0, // cockpit height
              z: playerPos.z,
              radius: 0.7 // smaller radius for cabin
            }
          ];
          
          // Calculate ray direction
          const rayDirection = {
            x: projectile.position.x - prevPosition.x,
            y: projectile.position.y - prevPosition.y,
            z: projectile.position.z - prevPosition.z
          };
          
          // Calculate ray length
          const rayLength = Math.sqrt(
            rayDirection.x * rayDirection.x +
            rayDirection.y * rayDirection.y +
            rayDirection.z * rayDirection.z
          );
          
          // Normalize ray direction
          if (rayLength > 0.0001) {
            rayDirection.x /= rayLength;
            rayDirection.y /= rayLength;
            rayDirection.z /= rayLength;
            
            // Check each sphere for ray intersection
            for (const sphere of spheres) {
              // Ray-sphere intersection - https://en.wikipedia.org/wiki/Line%E2%80%93sphere_intersection
              // Adjust sphere radius to account for projectile size
              const projectileRadius = projectile.weaponType === 'cannon' ? 0.15 : 0.3;
              const combinedRadius = sphere.radius + projectileRadius;
              
              // Vector from ray origin to sphere center
              const oc = {
                x: prevPosition.x - sphere.x,
                y: prevPosition.y - sphere.y,
                z: prevPosition.z - sphere.z
              };
              
              // Quadratic equation coefficients
              const a = 1; // Because rayDirection is normalized
              const b = 2 * (rayDirection.x * oc.x + rayDirection.y * oc.y + rayDirection.z * oc.z);
              const c = (oc.x * oc.x + oc.y * oc.y + oc.z * oc.z) - (combinedRadius * combinedRadius);
              
              // Discriminant determines if ray intersects sphere
              const discriminant = b * b - 4 * a * c;
              
              if (discriminant >= 0) {
                // Calculate intersection distance
                const t = (-b - Math.sqrt(discriminant)) / (2 * a);
                
                // Check if intersection is within ray length and in front of ray
                if (t >= 0 && t <= rayLength) {
                  // Calculate hit position
                  const hitPosition = {
                    x: prevPosition.x + rayDirection.x * t,
                    y: prevPosition.y + rayDirection.y * t,
                    z: prevPosition.z + rayDirection.z * t
                  };
                  
                  // Collision detected!
                  console.log(`Server detected hit: projectile ${id} hit player ${playerId} at distance ${t}`);
                  
                  // Mark projectile as inactive and remove
                  projectile.active = false;
                  projectiles.delete(id);
                  
                  // Broadcast authoritative hit to all clients
                  io.emit('projectileDestroyed', {
                    id,
                    position: hitPosition,
                    hitPlayerId: playerId,
                    sourcePlayerId: projectile.ownerId,
                    reason: 'hit',
                    serverConfirmed: true  // Flag indicating this is an authoritative hit
                  });
                  
                  // Exit all loops since projectile is destroyed
                  return;
                }
              }
            }
          }
        }
      }
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
