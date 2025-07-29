const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
// It's good practice to have the express cors middleware as well.
app.use(cors({ origin: "https://anonymous-chat-frontend-gray.vercel.app" }));

const server = http.createServer(app);

// --- SECURE CORS CONFIGURATION for Socket.IO ---
const io = new Server(server, {
  cors: {
    // This is the crucial part. Only your specified frontend can connect.
    origin: "https://anonymous-chat-frontend-gray.vercel.app",
    methods: ["GET", "POST"],
  },
});

// --- PREDEFINED BACKGROUNDS (Server-side) ---
const predefinedBackgrounds = [
  "https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?q=80&w=1374&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=1575&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1332&auto=format&fit=crop",
];

// --- STATE MANAGEMENT ---
const users = {}; // Stores user data: { socket.id: { id, name, gender, age } }
const chatHistory = {}; // Stores message history: { roomName: [ { msg, timestamp } ] }
const roomSettings = {}; // Stores room settings: { roomName: { backgroundUrl: '...' } }
const messageSenders = {}; // Tracks message sender for read receipts: { messageId: senderSocketId }

// --- RATE LIMITING CONSTANTS ---
const userMessageTimestamps = {}; // { socketId: [timestamp1, timestamp2, ...] }
const RATE_LIMIT_COUNT = 5; // Max 5 messages
const RATE_LIMIT_SECONDS = 5; // per 5 seconds

const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

// Periodically clear out old messages from history to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const room in chatHistory) {
    chatHistory[room] = chatHistory[room].filter(
      (entry) => now - entry.timestamp < FIVE_MINUTES_IN_MS
    );
  }
}, 60 * 1000); // Run this check every minute

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  // Initialize rate limiting array for the new user
  userMessageTimestamps[socket.id] = [];

  // Listen for user profile information
  socket.on("user info", ({ nickname, gender, age }) => {
    // Basic validation for user info
    if (
      typeof nickname !== "string" ||
      nickname.trim().length === 0 ||
      nickname.length > 20
    ) {
      return; // Ignore invalid nickname
    }
    users[socket.id] = {
      id: socket.id,
      name: nickname.trim(),
      gender,
      age,
    };
    // Broadcast the updated user list to all clients
    io.emit("user list", Object.values(users));
  });

  // Listen for a user joining a room
  socket.on("join room", (roomName) => {
    socket.join(roomName);

    // Send recent message history for this room to the joining user
    if (chatHistory[roomName]) {
      const history = chatHistory[roomName].map((entry) => entry.msg);
      socket.emit("room history", history);
    }
    // Send room-specific settings like the background image
    if (roomSettings[roomName] && roomSettings[roomName].backgroundUrl) {
      socket.emit("background updated", {
        room: roomName,
        backgroundUrl: roomSettings[roomName].backgroundUrl,
      });
    }
  });

  // Listen for incoming chat messages
  socket.on("chat message", ({ room, text }) => {
    const user = users[socket.id];
    if (!user) return; // Ignore messages from users who haven't set their info

    // --- Server-Side Validation & Rate Limiting ---
    if (
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 500
    ) {
      return; // Ignore invalid or empty messages
    }

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
      to: room.replace(socket.id, "").replace("-", ""), // For private messages
      messageId: messageId,
      name: user.name,
      gender: user.gender,
      age: user.age,
      text: text.trim(),
      room,
      status: "sent", // Default status for read receipts
    };

    // Track who sent which message for read receipts
    messageSenders[messageId] = socket.id;

    if (!chatHistory[room]) {
      chatHistory[room] = [];
    }
    chatHistory[room].push({ msg, timestamp: Date.now() });

    // Send the message to everyone in the room
    io.to(room).emit("chat message", msg);
  });

  // Listen for when a message is read in a private chat
  socket.on("message read", ({ room, messageId }) => {
    const senderSocketId = messageSenders[messageId];
    // If we find the original sender, emit an event back to *only* them
    if (senderSocketId) {
      io.to(senderSocketId).emit("message was read", { room, messageId });
    }
  });

  // Listen for background change requests
  socket.on("set background", ({ room, backgroundId }) => {
    // Validate the received ID
    const id = parseInt(backgroundId, 10);
    if (isNaN(id) || id < 0 || id >= predefinedBackgrounds.length) {
      return; // Invalid ID, do nothing
    }

    const backgroundUrl = predefinedBackgrounds[id];

    if (!roomSettings[room]) {
      roomSettings[room] = {};
    }
    roomSettings[room].backgroundUrl = backgroundUrl;
    // Notify all users in the room about the new background
    io.to(room).emit("background updated", { room, backgroundUrl });
  });

  // Listen for typing events
  socket.on("typing", ({ room }) => {
    const user = users[socket.id];
    if (user) {
      socket.to(room).emit("typing", { name: user.name, room });
    }
  });

  // Listen for stop typing events
  socket.on("stop typing", ({ room }) => {
    const user = users[socket.id];
    if (user) {
      socket.to(room).emit("stop typing", { name: user.name, room });
    }
  });

  // Handle user disconnection
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    delete users[socket.id];
    // Clean up rate limit data for the disconnected user
    delete userMessageTimestamps[socket.id];
    // Broadcast the new user list
    io.emit("user list", Object.values(users));
  });
});

// A simple root route to confirm the server is running
app.get("/", (req, res) => {
  res.send("✅ Anonymous Chat Backend is running smoothly.");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
