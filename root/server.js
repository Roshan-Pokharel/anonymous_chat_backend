const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
app.use(cors({ origin: "https://anonymous-chat-frontend-gray.vercel.app/" }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://anonymous-chat-frontend-gray.vercel.app/",
    methods: ["GET", "POST"],
  },
});

// --- STATE MANAGEMENT ---
const users = {}; // { socket.id: { id, name, gender, age } }
const chatHistory = {}; // { roomName: [ { msg, timestamp } ] }
const messageSenders = {}; // { messageId: senderSocketId }
const gameStates = {}; // { roomId: { drawer, word, scores, etc. } }
let activeGameRooms = {}; // { roomId: { id, name, creatorName, creatorId, players: [] } }

// --- GAME CONSTANTS ---
const GAME_WORDS = [
  "apple",
  "banana",
  "car",
  "house",
  "tree",
  "star",
  "sun",
  "moon",
  "dog",
  "cat",
  "guitar",
  "pizza",
  "mountain",
  "river",
  "bridge",
  "flower",
  "bird",
  "fish",
];
const ROUND_TIME = 60 * 1000; // 60 seconds

// --- RATE LIMITING CONSTANTS ---
const userMessageTimestamps = {};
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_SECONDS = 5;
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

// Periodically clean up old chat history
setInterval(() => {
  const now = Date.now();
  for (const room in chatHistory) {
    chatHistory[room] = chatHistory[room].filter(
      (entry) => now - entry.timestamp < FIVE_MINUTES_IN_MS
    );
  }
}, 60 * 1000);

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  userMessageTimestamps[socket.id] = [];

  // Send initial data to the newly connected client
  socket.emit("user list", Object.values(users));
  socket.emit("game:roomsList", Object.values(activeGameRooms));

  socket.on("user info", ({ nickname, gender, age }) => {
    if (
      typeof nickname !== "string" ||
      nickname.trim().length === 0 ||
      nickname.length > 20
    ) {
      return;
    }
    users[socket.id] = { id: socket.id, name: nickname.trim(), gender, age };
    io.emit("user list", Object.values(users));
  });

  socket.on("join room", (roomName) => {
    socket.join(roomName);
    if (chatHistory[roomName]) {
      socket.emit(
        "room history",
        chatHistory[roomName].map((entry) => entry.msg)
      );
    }
    // If joining a game room, send its state
    if (gameStates[roomName] && gameStates[roomName].isRoundActive) {
      socket.emit("game:state", gameStates[roomName]);
    }
  });

  socket.on("chat message", ({ room, text }) => {
    const user = users[socket.id];
    if (!user) return;
    if (
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 500
    ) {
      return;
    }
    // Rate limiting check
    const now = Date.now();
    userMessageTimestamps[socket.id] = userMessageTimestamps[socket.id].filter(
      (timestamp) => now - timestamp < RATE_LIMIT_SECONDS * 1000
    );
    if (userMessageTimestamps[socket.id].length >= RATE_LIMIT_COUNT) {
      socket.emit("rate limit", "You are sending messages too quickly.");
      return;
    }
    userMessageTimestamps[socket.id].push(now);

    // --- GAME GUESS CHECK ---
    const gameState = gameStates[room];
    if (
      gameState &&
      gameState.isRoundActive &&
      socket.id !== gameState.drawer.id
    ) {
      if (text.trim().toLowerCase() === gameState.word.toLowerCase()) {
        const drawerSocketId = gameState.drawer.id;
        gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + 10;
        gameState.scores[drawerSocketId] =
          (gameState.scores[drawerSocketId] || 0) + 5;

        io.to(room).emit("game:correct_guess", {
          guesser: user,
          word: gameState.word,
          scores: gameState.scores,
        });

        clearTimeout(gameState.roundTimer);
        startNewRound(room);
        return; // Stop processing as a regular chat message
      }
    }

    // Standard chat message handling
    const messageId = `${Date.now()}-${socket.id}`;
    const msg = {
      id: socket.id,
      to: room.includes("-")
        ? room.replace(socket.id, "").replace("-", "")
        : null,
      messageId,
      name: user.name,
      gender: user.gender,
      age: user.age,
      text: text.trim(),
      room,
      status: "sent",
    };
    messageSenders[messageId] = socket.id;
    if (!chatHistory[room]) chatHistory[room] = [];
    chatHistory[room].push({ msg, timestamp: Date.now() });
    io.to(room).emit("chat message", msg);
  });

  socket.on("message read", ({ room, messageId }) => {
    const senderSocketId = messageSenders[messageId];
    if (senderSocketId) {
      io.to(senderSocketId).emit("message was read", { room, messageId });
    }
  });

  socket.on("typing", ({ room }) => {
    const user = users[socket.id];
    if (user) socket.to(room).emit("typing", { name: user.name, room });
  });

  socket.on("stop typing", ({ room }) => {
    const user = users[socket.id];
    if (user) socket.to(room).emit("stop typing", { name: user.name, room });
  });

  // --- NEW GAME ROOM EVENTS ---
  socket.on("game:create", (roomName) => {
    const user = users[socket.id];
    if (!user) return;

    const roomId = `game-${randomUUID()}`;
    activeGameRooms[roomId] = {
      id: roomId,
      name: roomName || `${user.name}'s Room`,
      creatorId: socket.id,
      creatorName: user.name,
      players: [user],
    };

    socket.join(roomId);
    socket.emit("game:joined", activeGameRooms[roomId]);
    io.emit("game:roomsList", Object.values(activeGameRooms));
  });

  socket.on("game:join", (roomId) => {
    const user = users[socket.id];
    const room = activeGameRooms[roomId];
    if (!user || !room) return;

    // Prevent joining the same room twice
    if (room.players.some((p) => p.id === user.id)) return;

    room.players.push(user);
    socket.join(roomId);
    socket.emit("game:joined", room);
    io.to(roomId).emit("chat message", {
      room: roomId,
      text: `${user.name} has joined the game!`,
      name: "System",
    });
    io.emit("game:roomsList", Object.values(activeGameRooms));
  });

  // --- GAMEPLAY EVENTS ---
  socket.on("game:start", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];
    // Only the creator can start the game
    if (!room || !user || user.id !== room.creatorId) return;

    const roomUsers = room.players.map((p) => p.id);
    gameStates[roomId] = {
      players: roomUsers,
      scores: {},
      isRoundActive: false,
      creatorId: room.creatorId,
    };
    roomUsers.forEach((id) => (gameStates[roomId].scores[id] = 0));

    startNewRound(roomId);
  });

  socket.on("game:draw", ({ room, data }) => {
    const gameState = gameStates[room];
    if (
      gameState &&
      gameState.isRoundActive &&
      socket.id === gameState.drawer.id
    ) {
      socket.to(room).emit("game:draw", data);
    }
  });

  socket.on("game:clear_canvas", (room) => {
    io.to(room).emit("game:clear_canvas");
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    const user = users[socket.id];
    if (user) {
      // Handle game room cleanup
      for (const roomId in activeGameRooms) {
        const room = activeGameRooms[roomId];
        const playerIndex = room.players.findIndex((p) => p.id === socket.id);

        if (playerIndex > -1) {
          room.players.splice(playerIndex, 1);

          // If room is empty, delete it
          if (room.players.length === 0) {
            delete activeGameRooms[roomId];
            delete gameStates[roomId];
          } else {
            // If the creator left, assign a new creator
            if (room.creatorId === socket.id) {
              room.creatorId = room.players[0].id;
              room.creatorName = room.players[0].name;
            }
            // If a game was active and the drawer left, start a new round
            const gameState = gameStates[roomId];
            if (
              gameState &&
              gameState.isRoundActive &&
              gameState.drawer.id === socket.id
            ) {
              io.to(roomId).emit(
                "game:message",
                "The drawer disconnected. Starting a new round."
              );
              clearTimeout(gameState.roundTimer);
              startNewRound(roomId);
            }
          }
          io.emit("game:roomsList", Object.values(activeGameRooms));
        }
      }
    }
    delete users[socket.id];
    delete userMessageTimestamps[socket.id];
    io.emit("user list", Object.values(users));
  });

  function startNewRound(roomId) {
    const gameState = gameStates[roomId];
    const room = activeGameRooms[roomId];

    if (!gameState || !room || room.players.length < 2) {
      io.to(roomId).emit(
        "game:end",
        "Not enough players to continue the game. Waiting for more..."
      );
      if (gameState) gameState.isRoundActive = false;
      return;
    }

    gameState.players = room.players.map((p) => p.id); // Refresh player list

    const currentDrawerIndex = gameState.drawer
      ? gameState.players.indexOf(gameState.drawer.id)
      : -1;
    const nextDrawerIndex = (currentDrawerIndex + 1) % gameState.players.length;
    const drawerId = gameState.players[nextDrawerIndex];
    const drawerUser = users[drawerId];

    if (!drawerUser) {
      startNewRound(roomId); // Try again if user data not found
      return;
    }

    const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];

    gameState.drawer = drawerUser;
    gameState.word = word;
    gameState.isRoundActive = true;
    gameState.roundStart = Date.now();
    gameState.creatorId = room.creatorId; // Ensure creatorId is fresh

    gameState.roundTimer = setTimeout(() => {
      io.to(roomId).emit("game:message", `Time's up! The word was '${word}'.`);
      startNewRound(roomId);
    }, ROUND_TIME);

    io.to(roomId).emit("game:state", {
      drawer: drawerUser,
      isRoundActive: true,
      scores: gameState.scores,
      creatorId: gameState.creatorId,
    });
    io.to(drawerId).emit("game:word_prompt", word);
  }
});

app.get("/", (req, res) => {
  res.send("✅ Anonymous Chat & Doodle Backend is running smoothly.");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
