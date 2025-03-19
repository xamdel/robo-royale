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

let players = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Add new player
  players[socket.id] = {
    id: socket.id,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0
  };

  // Tell others about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Send existing players to the new player
  socket.emit('existingPlayers', players);

  // Handle movement with delta and validation
  socket.on('move', (data) => {
    if (players[socket.id]) {
      const player = players[socket.id];
      const delta = data.delta;
      const maxSpeed = 0.1; // Matches client speed

      // Basic validation: ensure delta doesn't exceed max speed
      if (Math.abs(delta.dx) <= maxSpeed &&
          Math.abs(delta.dy) <= maxSpeed &&
          Math.abs(delta.dz) <= maxSpeed) {
        player.position.x += delta.dx;
        player.position.y += delta.dy;
        player.position.z += delta.dz;
        
        // Update rotation if provided
        if (delta.rotation !== undefined) {
          player.rotation = delta.rotation;
        }

        // Broadcast the updated position and rotation to others
        socket.broadcast.emit('playerMoved', { 
          id: socket.id, 
          position: player.position,
          rotation: player.rotation
        });
      } else {
        // console.log(`Invalid move rejected for ${socket.id}:`, delta);
      }
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.NODE_ENV === 'production' ? (process.env.PORT || 3000) : 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Node environment: ${process.env.NODE_ENV || 'development'}`);
});