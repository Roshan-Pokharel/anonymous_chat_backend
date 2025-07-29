const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Or use your Vercel domain
    methods: ["GET", "POST"],
  },
});

const users = {};
const chatHistory = {}; // { roomName: [ { msg, timestamp } ] }

// --- ✨ NEW: Room settings, read receipt tracking, and rate limiting ---
const roomSettings = {}; // { roomName: { backgroundUrl: '...' } }
const messageSenders = {}; // { messageId: senderSocketId }
const userMessageTimestamps = {}; // { socketId: [timestamp1, timestamp2, ...] }
const RATE_LIMIT_COUNT = 5; // Max 5 messages
const RATE_LIMIT_SECONDS = 5; // per 5 seconds
// ---

const FIVE_MINUTES = 5 * 60 * 1000;

// Periodically clear out old messages
setInterval(() => {
  const now = Date.now();
  for (const room in chatHistory) {
    chatHistory[room] = chatHistory[room].filter(
      (entry) => now - entry.timestamp < FIVE_MINUTES
    );
  }
}, 60 * 1000);

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  // Initialize rate limiting array for the new user
  userMessageTimestamps[socket.id] = [];

  socket.on("user info", ({ nickname, gender, age }) => {
    users[socket.id] = {
      id: socket.id,
      name: nickname,
      gender,
      age,
    };
    io.emit("user list", Object.values(users));
  });

  socket.on("join room", (roomName) => {
    socket.join(roomName);

    // Send last messages from this room
    if (chatHistory[roomName]) {
      const history = chatHistory[roomName].map((entry) => entry.msg);
      socket.emit("room history", history);
    }
    // --- ✨ NEW: Send room background if it exists ---
    if (roomSettings[roomName] && roomSettings[roomName].backgroundUrl) {
      socket.emit("background updated", {
        room: roomName,
        backgroundUrl: roomSettings[roomName].backgroundUrl,
      });
    }
    // ---
  });

  socket.on("chat message", ({ room, text, to }) => {
    const user = users[socket.id];
    if (!user) return;

    // --- ✨ NEW: Rate Limiting Logic ---
    const now = Date.now();
    // Clear timestamps older than the rate limit window
    userMessageTimestamps[socket.id] = userMessageTimestamps[socket.id].filter(
      (timestamp) => now - timestamp < RATE_LIMIT_SECONDS * 1000
    );
    // Check if the user has exceeded the message limit
    if (userMessageTimestamps[socket.id].length >= RATE_LIMIT_COUNT) {
      socket.emit(
        "rate limit",
        "You are sending messages too quickly. Please slow down."
      );
      return; // Stop message processing
    }
    // Add the current message timestamp
    userMessageTimestamps[socket.id].push(now);
    // ---

    const messageId = `${Date.now()}-${socket.id}`; // Create a unique message ID
    const msg = {
      id: socket.id,
      messageId: messageId, // Add ID to message object
      name: user.name,
      gender: user.gender,
      age: user.age,
      text,
      room,
      to: to || null,
      status: "sent", // Default status for read receipts
    };

    // ✨ NEW: Track who sent which message for read receipts
    messageSenders[messageId] = socket.id;

    if (!chatHistory[room]) {
      chatHistory[room] = [];
    }
    chatHistory[room].push({ msg, timestamp: Date.now() });

    io.to(room).emit("chat message", msg);
  });

  // --- ✨ NEW: Read Receipts Listener ---
  socket.on("message read", ({ room, messageId }) => {
    const senderSocketId = messageSenders[messageId];
    // If we find the original sender, emit an event back to only them
    if (senderSocketId) {
      io.to(senderSocketId).emit("message was read", { room, messageId });
    }
  });
  // ---

  // --- ✨ NEW: Set Background Image Listener ---
  socket.on("set background", ({ room, backgroundUrl }) => {
    if (!roomSettings[room]) {
      roomSettings[room] = {};
    }
    roomSettings[room].backgroundUrl = backgroundUrl;
    // Notify all users in the room about the new background
    io.to(room).emit("background updated", { room, backgroundUrl });
  });
  // ---

  socket.on("typing", ({ room }) => {
    const user = users[socket.id];
    if (user) {
      socket.to(room).emit("typing", { name: user.name, room });
    }
  });

  socket.on("stop typing", ({ room }) => {
    const user = users[socket.id];
    if (user) {
      socket.to(room).emit("stop typing", { name: user.name, room });
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    delete users[socket.id];
    // Clean up rate limit data for the disconnected user
    delete userMessageTimestamps[socket.id];
    io.emit("user list", Object.values(users));
  });
});

app.get("/", (req, res) => {
  res.send("✅ Socket.IO chat backend is running");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
