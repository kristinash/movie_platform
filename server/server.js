import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
const messageHistory = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (data) => {
    const { roomId, username } = data;
    
    if (!rooms.has(roomId)) {
      socket.emit('room-error', { message: 'Room does not exist' });
      console.log(`User ${username} tried to join non-existent room ${roomId}`);
      return;
    }

    const room = rooms.get(roomId);
    room.users.set(socket.id, { username, socketId: socket.id });
    socket.join(roomId);

    socket.to(roomId).emit('user-joined', {
      username,
      users: Array.from(room.users.values())
    });


    socket.emit('room-joined', {
      videoState: room.videoState,
      messages: messageHistory.get(roomId) || [],
      users: Array.from(room.users.values()),
      roomId: roomId
    });

    console.log(`${username} joined room ${roomId}`);
  });


  socket.on('create-room', (data) => {
    const { roomId, username } = data;
    
    if (rooms.has(roomId)) {
      socket.emit('room-error', { message: 'Room already exists' });
      return;
    }

    rooms.set(roomId, {
      users: new Map(),
      videoState: { 
        playing: false, 
        timestamp: 0, 
        videoUrl: '',
        lastAction: 'pause',
        lastActionTime: Date.now()
      }
    });
    messageHistory.set(roomId, []);
  

    const room = rooms.get(roomId);
    room.users.set(socket.id, { username, socketId: socket.id });
    socket.join(roomId);

    socket.emit('room-created', {
      roomId: roomId,
      videoState: room.videoState,
      users: Array.from(room.users.values())
    });

    console.log(`Room "${roomId}" created by ${username}`);
  });

  socket.on('chat-message', (data) => {
    const { roomId, message, username } = data;
    
    if (!rooms.has(roomId)) {
      socket.emit('room-error', { message: 'Room does not exist' });
      return;
    }

    const messageData = {
      id: Date.now() + Math.random(),
      username,
      message,
      timestamp: new Date().toLocaleTimeString(),
      date: new Date().toLocaleString()
    };


    if (messageHistory.has(roomId)) {
      const history = messageHistory.get(roomId);
      history.push(messageData);
      if (history.length > 100) history.shift();
    }


    io.to(roomId).emit('chat-message', messageData);
  });

  socket.on('video-control', (data) => {
    const { roomId, action, timestamp, username } = data;
    
    if (!rooms.has(roomId)) {
      socket.emit('room-error', { message: 'Room does not exist' });
      return;
    }

    const room = rooms.get(roomId);
    
    if (action === 'play' && room.videoState.playing) {
      socket.emit('room-error', { message: 'Video is already playing' });
      return;
    }

    if (action === 'pause' && !room.videoState.playing) {
      socket.emit('room-error', { message: 'Video is already paused' });
      return;
    }
    switch (action) {
      case 'play':
        room.videoState.playing = true;
        room.videoState.lastAction = 'play';
        break;
      case 'pause':
        room.videoState.playing = false;
        room.videoState.lastAction = 'pause';
        break;
      case 'seek':
        room.videoState.timestamp = Math.max(0, room.videoState.timestamp + timestamp);
        room.videoState.lastAction = 'seek';
        break;
      case 'sync':
        room.videoState.timestamp = timestamp;
        room.videoState.lastAction = 'sync';
        break;
    }
    
    room.videoState.lastActionTime = Date.now();

    io.to(roomId).emit('playback-update', {
      action,
      timestamp: room.videoState.timestamp,
      username,
      videoState: room.videoState,
      isSync: action === 'sync'
    });

    console.log(`${username} ${action} at ${room.videoState.timestamp}s in ${roomId}`);
  });


  socket.on('get-room-state', (roomId) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      socket.emit('room-state', {
        videoState: room.videoState,
        messages: messageHistory.get(roomId) || [],
        users: Array.from(room.users.values())
      });
    }
  });

  socket.on('leave-room', (roomId) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      if (room.users.has(socket.id)) {
        const user = room.users.get(socket.id);
        room.users.delete(socket.id);
        socket.leave(roomId);

        io.to(roomId).emit('user-left', {
          username: user.username,
          users: Array.from(room.users.values())
        });

        console.log(`${user.username} left room ${roomId}`);
        
        if (room.users.size === 0) {
          setTimeout(() => {
            if (rooms.get(roomId)?.users.size === 0) {
              rooms.delete(roomId);
              messageHistory.delete(roomId);
              console.log(`Room ${roomId} deleted (empty)`);
            }
          }, 60000);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        const user = room.users.get(socket.id);
        room.users.delete(socket.id);

        io.to(roomId).emit('user-left', {
          username: user.username,
          users: Array.from(room.users.values())
        });

        console.log(`${user.username} disconnected from room ${roomId}`);

        if (room.users.size === 0) {
          setTimeout(() => {
            if (rooms.get(roomId)?.users.size === 0) {
              rooms.delete(roomId);
              messageHistory.delete(roomId);
              console.log(`Room ${roomId} deleted (empty)`);
            }
          }, 60000);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});