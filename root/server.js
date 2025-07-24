// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

// HTTP server for Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Change to your Vercel URL in production
    methods: ["GET", "POST"],
  },
});

// Health check route
app.get("/", (req, res) => {
  res.send("Socket.IO server is running");
});

// Users and chat state
let users = {}; // socket.id -> userInfo
let chatHistory = {}; // room -> [{ msg, timestamp }]

const FIVE_MINUTES = 5 * 60 * 1000;

// Cleanup old messages every 1 min
setInterval(() => {
  const now = Date.now();
  for (const room in chatHistory) {
    chatHistory[room] = chatHistory[room].filter(
      (entry) => now - entry.timestamp < FIVE_MINUTES
    );
  }
}, 60 * 1000);

// Socket.IO logic
io.on("connection", (socket) => {
  console.log("✅ New user connected:", socket.id);

  // Handle user info
  socket.on("user info", ({ nickname, gender, age }) => {
    users[socket.id] = { id: socket.id, name: nickname, gender, age };
    io.emit("user list", Object.values(users));
  });

  // Handle room join and send history
  socket.on("join room", (room) => {
    socket.join(room);
    const history = chatHistory[room] || [];
    socket.emit(
      "room history",
      history.map((e) => e.msg)
    );
  });

  // Handle messages
  socket.on("chat message", ({ room, text, to }) => {
    const sender = users[socket.id];
    if (!sender) return;

    const msg = {
      id: socket.id,
      name: sender.name,
      gender: sender.gender,
      age: sender.age,
      text,
      room,
      to: to || null,
    };

    // Save to history
    if (!chatHistory[room]) {
      chatHistory[room] = [];
    }
    chatHistory[room].push({ msg, timestamp: Date.now() });

    io.to(room).emit("chat message", msg);
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("❌ Disconnected:", socket.id);
    delete users[socket.id];
    io.emit("user list", Object.values(users));
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
