const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors({ origin: "https://anonymous-chat-frontend-gray.vercel.app" }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://anonymous-chat-frontend-gray.vercel.app",
    methods: ["GET", "POST"],
  },
});

// --- STATE MANAGEMENT ---
const users = {}; // { socket.id: { id, name, gender, age } }
const chatHistory = {}; // { roomName: [ { msg, timestamp } ] }
const messageSenders = {}; // { messageId: senderSocketId }
const gameStates = {}; // { roomName: { drawer, word, scores, etc. } }

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
];
const ROUND_TIME = 60 * 1000; // 60 seconds

// --- RATE LIMITING CONSTANTS ---
const userMessageTimestamps = {};
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_SECONDS = 5;
const FIVE_MINUTES_IN_MS = 5 * 60 * 1000;

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
    // If a game is in progress, send the current state to the new user
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
        // Correct guess!
        const drawerSocketId = gameState.drawer.id;
        gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + 10;
        gameState.scores[drawerSocketId] =
          (gameState.scores[drawerSocketId] || 0) + 5;

        io.to(room).emit("game:correct_guess", {
          guesser: user,
          word: gameState.word,
          scores: gameState.scores,
        });

        // End the round and start a new one
        clearTimeout(gameState.roundTimer);
        startNewRound(room);
        return; // Stop processing as a regular chat message
      }
    }

    const messageId = `${Date.now()}-${socket.id}`;
    const msg = {
      id: socket.id,
      to: room.replace(socket.id, "").replace("-", ""),
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

  // --- GAME EVENTS ---
  socket.on("game:start", (room) => {
    if (!gameStates[room]) {
      const roomUsers = Array.from(io.sockets.adapter.rooms.get(room) || []);
      gameStates[room] = {
        players: roomUsers,
        scores: {},
        isRoundActive: false,
      };
      // Initialize scores
      roomUsers.forEach((id) => (gameStates[room].scores[id] = 0));
    }
    startNewRound(room);
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
      // Handle game state if a player disconnects
      for (const room in gameStates) {
        const gameState = gameStates[room];
        if (gameState.players.includes(socket.id)) {
          gameState.players = gameState.players.filter(
            (id) => id !== socket.id
          );
          if (gameState.drawer && gameState.drawer.id === socket.id) {
            // Drawer disconnected, start a new round
            io.to(room).emit(
              "game:message",
              "The drawer disconnected. Starting a new round."
            );
            clearTimeout(gameState.roundTimer);
            startNewRound(room);
          }
        }
      }
    }
    delete users[socket.id];
    delete userMessageTimestamps[socket.id];
    io.emit("user list", Object.values(users));
  });

  function startNewRound(room) {
    const gameState = gameStates[room];
    if (!gameState || gameState.players.length < 2) {
      io.to(room).emit("game:end", "Not enough players to start a game.");
      if (gameState) delete gameStates[room];
      return;
    }

    // Select next drawer (simple rotation)
    const currentDrawerIndex = gameState.drawer
      ? gameState.players.indexOf(gameState.drawer.id)
      : -1;
    const nextDrawerIndex = (currentDrawerIndex + 1) % gameState.players.length;
    const drawerId = gameState.players[nextDrawerIndex];
    const drawerUser = users[drawerId];

    if (!drawerUser) {
      // If drawer user data is not found, try next
      gameState.players.splice(nextDrawerIndex, 1);
      startNewRound(room);
      return;
    }

    const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];

    gameState.drawer = drawerUser;
    gameState.word = word;
    gameState.isRoundActive = true;
    gameState.roundStart = Date.now();

    // Set timer to end the round
    gameState.roundTimer = setTimeout(() => {
      io.to(room).emit("game:message", `Time's up! The word was '${word}'.`);
      startNewRound(room);
    }, ROUND_TIME);

    io.to(room).emit("game:state", {
      drawer: drawerUser,
      isRoundActive: true,
      scores: gameState.scores,
    });
    // Send the word only to the drawer
    io.to(drawerId).emit("game:word_prompt", word);
  }
});

app.get("/", (req, res) => {
  res.send("✅ Anonymous Chat Backend is running smoothly.");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
