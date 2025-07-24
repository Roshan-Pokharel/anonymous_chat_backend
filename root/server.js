// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app); // ✅ Must use http.createServer for Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*", // Set this to your Vercel frontend URL in production
    methods: ["GET", "POST"],
  },
});

app.use(cors());

// Optional: basic health check route
app.get("/", (req, res) => {
  res.send("Socket.IO server is running");
});

// Users map
let users = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // Handle user info
  socket.on("user info", (info) => {
    users[socket.id] = {
      id: socket.id,
      name: info.nickname,
      gender: info.gender,
      age: info.age,
    };
    io.emit("user list", Object.values(users));
  });

  // Join room
  socket.on("join room", (room) => {
    socket.join(room);

    // Send chat history (optional)
    // For simplicity, not storing history on server in this version
  });

  // Handle messages
  socket.on("chat message", (msg) => {
    io.to(msg.room).emit("chat message", {
      id: socket.id,
      name: users[socket.id]?.name,
      gender: users[socket.id]?.gender,
      age: users[socket.id]?.age,
      text: msg.text,
      room: msg.room,
      to: msg.to || null,
    });
  });

  // On disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
    delete users[socket.id];
    io.emit("user list", Object.values(users));
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
