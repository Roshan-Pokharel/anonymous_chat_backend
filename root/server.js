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
  });

  socket.on("chat message", ({ room, text, to }) => {
    const user = users[socket.id];
    if (!user) return;

    const msg = {
      id: socket.id,
      name: user.name,
      gender: user.gender,
      age: user.age,
      text,
      room,
      to: to || null,
    };

    // Save to chat history
    if (!chatHistory[room]) {
      chatHistory[room] = [];
    }
    chatHistory[room].push({ msg, timestamp: Date.now() });

    // Broadcast to the room
    io.to(room).emit("chat message", msg);
  });

  // --- ✨ NEW FEATURE: TYPING INDICATOR ---
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
  // --- END OF NEW FEATURE ---

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    delete users[socket.id];
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
