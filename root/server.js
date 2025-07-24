const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

// Serve static files from the 'public' directory
app.use(express.static("public"));

let users = {}; // Stores user data: { socket.id: { name, gender, age } }
let roomMessages = {}; // Stores messages: { roomId: [ { ...msg, timestamp } ] }

// Function to prune messages older than 5 minutes. This runs every minute.
function pruneMessages() {
  const now = Date.now();
  const fiveMinutesAgo = 5 * 60 * 1000;
  for (const room in roomMessages) {
    roomMessages[room] = roomMessages[room].filter(
      (msg) => now - msg.timestamp < fiveMinutesAgo
    );
  }
}
setInterval(pruneMessages, 60 * 1000);

io.on("connection", (socket) => {
  // When a user provides their info
  socket.on("user info", ({ nickname, gender, age }) => {
    // Check if the nickname is already taken (case-insensitive)
    const taken = Object.values(users).some(
      (u) => u.name.toLowerCase() === nickname.trim().toLowerCase()
    );

    if (taken) {
      socket.emit("nickname taken");
      return;
    }

    // Store user data
    users[socket.id] = {
      name: nickname || "Guest",
      gender: gender || "male",
      age: age || "",
    };

    // Broadcast the updated user list to all clients
    io.emit(
      "user list",
      Object.keys(users).map((id) => ({
        id,
        name: users[id].name,
        gender: users[id].gender,
        age: users[id].age,
      }))
    );
  });

  // Automatically join the public room on connection
  socket.join("public");

  // When a user requests to join a room (public or private)
  socket.on("join room", (roomId) => {
    socket.join(roomId);
    // Send the message history for the joined room (last 5 mins)
    const msgs = (roomMessages[roomId] || []).map((msg) => {
      const { timestamp, ...rest } = msg; // Don't send timestamp to client
      return rest;
    });
    socket.emit("room history", msgs);
  });

  // When a chat message is received
  socket.on("chat message", ({ room, text }) => {
    const user = users[socket.id] || { name: "Guest", gender: "male", age: "" };
    const msg = {
      id: socket.id,
      name: user.name,
      gender: user.gender,
      age: user.age,
      text,
      room,
      timestamp: Date.now(),
    };

    // If it's a private message, add a 'to' field for notifications
    if (room !== "public") {
      const ids = room.split("-");
      msg.to = ids.find((id) => id !== socket.id);
    }

    // Store the message
    if (!roomMessages[room]) {
      roomMessages[room] = [];
    }
    roomMessages[room].push(msg);

    // Broadcast the message to the specific room
    io.to(room).emit("chat message", msg);
  });

  // When a user disconnects
  socket.on("disconnect", () => {
    delete users[socket.id];
    // Broadcast the updated user list
    io.emit(
      "user list",
      Object.keys(users).map((id) => ({
        id,
        name: users[id]?.name,
        gender: users[id]?.gender,
        age: users[id]?.age,
      }))
    );
  });
});

http.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
