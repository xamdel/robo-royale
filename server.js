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

// Game state - just store player positions
let players = {};

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Add new player with default position
  players[socket.id] = {
    id: socket.id,
    position: { x: 0, y: 0, z: 0 },
    rotation: 0
  };

  // Tell others about the new player
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Send existing players to the new player
  socket.emit('existingPlayers', players);

  // Handle movement - simple position update
  socket.on('move', (moveData) => {
    if (players[socket.id]) {
      // Update player position directly
      players[socket.id].position = moveData.position;
      players[socket.id].rotation = moveData.rotation;
      
      // Broadcast to all other clients
      socket.broadcast.emit('playerMoved', { 
        id: socket.id, 
        position: players[socket.id].position,
        rotation: players[socket.id].rotation
      });
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
