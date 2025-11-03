const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// ✅ FIXED: Proper CORS configuration
app.use(cors({
    origin: '*',  // Allow all origins for local testing
    methods: ['GET', 'POST'],
    credentials: true
}));

app.use(express.json());

// ✅ FIXED: Socket.io with proper CORS
const io = new Server(server, {
    cors: {
        origin: '*',  // Allow all origins
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']  // Enable both transports
});
 


// In-memory storage for rooms
const rooms = new Map();

// Generate random 6-digit room code
function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Clean up expired rooms (older than 30 minutes)
function cleanupRooms() {
    const now = Date.now();
    const EXPIRY_TIME = 30 * 60 * 1000;

    rooms.forEach((room, code) => {
        if (now - room.createdAt > EXPIRY_TIME) {
            rooms.delete(code);
            console.log(`Room ${code} expired and removed`);
        }
    });
}

setInterval(cleanupRooms, 5 * 60 * 1000);

// Socket.io connection handler
io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);

    socket.on('create-room', () => {
        let roomCode;
        
        do {
            roomCode = generateRoomCode();
        } while (rooms.has(roomCode));

        const room = {
            code: roomCode,
            host: socket.id,
            peer: null,
            createdAt: Date.now()
        };

        rooms.set(roomCode, room);
        socket.join(roomCode);
        socket.roomCode = roomCode;

        console.log(`🏠 Room created: ${roomCode} by ${socket.id}`);
        
        socket.emit('room-created', { roomCode });
    });

    socket.on('join-room', ({ roomCode }) => {
        const room = rooms.get(roomCode);
        console.log(`🔑 Client ${socket.id} attempting to join room: ${roomCode}`);

        if (!room) {
            socket.emit('error', { message: 'Room not found. Please check the code.' });
            return;
        }

        if (room.peer) {
            socket.emit('error', { message: 'Room is full. Only 2 devices can connect.' });
            return;
        }

        room.peer = socket.id;
        socket.join(roomCode);
        socket.roomCode = roomCode;

        console.log(`🤝 Client ${socket.id} joined room: ${roomCode}`);

        io.to(room.host).emit('peer-joined');
        socket.emit('room-joined', { roomCode });
    });

    socket.on('offer', ({ roomCode, offer }) => {
        socket.to(roomCode).emit('offer', { offer });
    });

    socket.on('answer', ({ roomCode, answer }) => {
        socket.to(roomCode).emit('answer', { answer });
    });

    socket.on('ice-candidate', ({ roomCode, candidate }) => {
        socket.to(roomCode).emit('ice-candidate', { candidate });
    });

    socket.on('leave-room', ({ roomCode }) => {
        handleLeaveRoom(socket, roomCode);
    });

    socket.on('disconnect', () => {
        console.log(`❌ Client disconnected: ${socket.id}`);
        
        if (socket.roomCode) {
            handleLeaveRoom(socket, socket.roomCode);
        }
    });
});

function handleLeaveRoom(socket, roomCode) {
    const room = rooms.get(roomCode);
    if (!room) return;

    socket.to(roomCode).emit('peer-left');

    if (room.host === socket.id) {
        rooms.delete(roomCode);
        console.log(`🗑️ Room ${roomCode} deleted (host left)`);
    } else if (room.peer === socket.id) {
        room.peer = null;
        console.log(`👋 Peer left room: ${roomCode}`);
    }

    socket.leave(roomCode);
}

app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        activeRooms: rooms.size,
        timestamp: new Date().toISOString()
    });
});

app.get('/stats', (req, res) => {
    res.json({
        totalRooms: rooms.size,
        rooms: Array.from(rooms.entries()).map(([code, room]) => ({
            code,
            hasHost: !!room.host,
            hasPeer: !!room.peer,
            age: Math.floor((Date.now() - room.createdAt) / 1000) + 's'
        }))
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 LocalSnap Server Running!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📍 Local:    http://localhost:${PORT}`);
    console.log(`📍 Network:  http://YOUR_IP:${PORT}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n📖 SETUP INSTRUCTIONS:`);
    console.log(`1. Find your IP: Run "ipconfig" (Windows) or "ifconfig" (Mac/Linux)`);
    console.log(`2. Open on Device 1 (Windows): http://YOUR_IP:${PORT}`);
    console.log(`3. Open on Device 2 (Phone): http://YOUR_IP:${PORT}`);
    console.log(`4. Both devices MUST use the SAME URL!`);
    console.log(`\nExample: If your IP is 192.168.1.100`);
    console.log(`         Both devices open: http://192.168.1.100:${PORT}\n`);
});

process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
