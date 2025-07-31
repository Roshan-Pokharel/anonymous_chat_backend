const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const corsOptions = {
  origin: "https://anonymous-chat-frontend-gray.vercel.app",
  methods: ["GET", "POST"],
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: corsOptions,
});

// --- STATE MANAGEMENT ---
const users = {}; // { socket.id: { id, name, gender, age } }
const chatHistory = {}; // { roomName: [ { msg, timestamp } ] }
const messageSenders = {}; // { messageId: senderSocketId }
const gameStates = {}; // { roomId: { drawer, word, scores, drawingHistory, etc. } }
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
const WINNING_SCORE = 5;

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

// --- HELPER FUNCTION for leaving a game ---
function handlePlayerLeave(socketId, roomId) {
  const room = activeGameRooms[roomId];
  if (!room) return;

  const playerIndex = room.players.findIndex((p) => p.id === socketId);
  if (playerIndex === -1) return;

  const departingPlayer = room.players[playerIndex];
  room.players.splice(playerIndex, 1);
  io.to(roomId).emit("chat message", {
    room: roomId,
    text: `${departingPlayer.name} has left the game.`,
    name: "System",
  });

  const gameState = gameStates[roomId];
  if (room.players.length < 2) {
    if (gameState && gameState.isRoundActive) {
      if (gameState.roundTimer) clearTimeout(gameState.roundTimer);
      io.to(roomId).emit(
        "game:message",
        "Not enough players to continue. The game has ended."
      );
    }
    // Game ends, clean up
    delete activeGameRooms[roomId];
    delete gameStates[roomId];
  } else {
    // Game continues, check for state changes
    if (room.creatorId === socketId) {
      room.creatorId = room.players[0].id;
      room.creatorName = room.players[0].name;
      io.to(roomId).emit(
        "game:message",
        `${room.creatorName} is the new host.`
      );
    }

    if (
      gameState &&
      gameState.isRoundActive &&
      gameState.drawer.id === socketId
    ) {
      io.to(roomId).emit(
        "game:message",
        "The drawer left. Starting a new round."
      );
      clearTimeout(gameState.roundTimer);
      startNewRound(roomId);
    } else {
      // Just update the state for everyone
      io.to(roomId).emit("game:state", {
        ...gameState,
        players: room.players,
        creatorId: room.creatorId,
      });
    }
  }
  // Update the public list of rooms for everyone
  io.emit("game:roomsList", Object.values(activeGameRooms));
}

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);

  // FIX: Automatically join all connecting clients to the public room
  socket.join("public");

  userMessageTimestamps[socket.id] = [];

  socket.emit("user list", Object.values(users));
  socket.emit("game:roomsList", Object.values(activeGameRooms));

  socket.on("user info", ({ nickname, gender, age }) => {
    if (
      typeof nickname !== "string" ||
      nickname.trim().length === 0 ||
      nickname.length > 20
    )
      return;
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
  });

  socket.on("chat message", ({ room, text }) => {
    const user = users[socket.id];
    if (!user) return;
    if (
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 500
    )
      return;

    const now = Date.now();
    userMessageTimestamps[socket.id] = userMessageTimestamps[socket.id].filter(
      (timestamp) => now - timestamp < RATE_LIMIT_SECONDS * 1000
    );
    if (userMessageTimestamps[socket.id].length >= RATE_LIMIT_COUNT) {
      socket.emit("rate limit", "You are sending messages too quickly.");
      return;
    }
    userMessageTimestamps[socket.id].push(now);

    const gameState = gameStates[room];

    if (gameState && gameState.isRoundActive) {
      if (socket.id === gameState.drawer.id) {
        socket.emit("rate limit", "You cannot chat while drawing.");
        return;
      }
      if (text.trim().toLowerCase() === gameState.word.toLowerCase()) {
        clearTimeout(gameState.roundTimer);
        const drawerSocketId = gameState.drawer.id;
        gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + 1;
        if (users[drawerSocketId]) {
          gameState.scores[drawerSocketId] =
            (gameState.scores[drawerSocketId] || 0) + 1;
        }
        io.to(room).emit("game:correct_guess", {
          guesser: user,
          word: gameState.word,
        });
        const winnerId = Object.keys(gameState.scores).find(
          (id) => gameState.scores[id] >= WINNING_SCORE
        );
        if (winnerId && users[winnerId]) {
          const winner = users[winnerId];
          io.to(room).emit("game:over", {
            winner,
            scores: { ...gameState.scores },
          });
          delete activeGameRooms[room];
          delete gameStates[room];
          io.emit("game:roomsList", Object.values(activeGameRooms));
        } else {
          setTimeout(() => startNewRound(room), 3000);
        }
        return;
      }
    }

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
    if (senderSocketId)
      io.to(senderSocketId).emit("message was read", { room, messageId });
  });

  socket.on("typing", ({ room }) => {
    const user = users[socket.id];
    if (user) socket.to(room).emit("typing", { name: user.name, room });
  });

  socket.on("stop typing", ({ room }) => {
    const user = users[socket.id];
    if (user) socket.to(room).emit("stop typing", { name: user.name, room });
  });

  socket.on("game:create", (roomName) => {
    const user = users[socket.id];
    if (!user) return;
    const roomId = `game-${randomUUID()}`;
    const newRoom = {
      id: roomId,
      name: roomName || `${user.name}'s Room`,
      creatorId: socket.id,
      creatorName: user.name,
      players: [user],
    };
    activeGameRooms[roomId] = newRoom;
    socket.join(roomId);
    socket.emit("game:joined", newRoom);
    io.emit("game:roomsList", Object.values(activeGameRooms));
    io.to(roomId).emit("game:state", {
      players: newRoom.players,
      creatorId: newRoom.creatorId,
      isRoundActive: false,
      scores: {},
    });
  });

  socket.on("game:join", (roomId) => {
    const user = users[socket.id];
    const room = activeGameRooms[roomId];
    if (!user || !room || room.players.some((p) => p.id === user.id)) return;
    room.players.push(user);
    socket.join(roomId);
    socket.emit("game:joined", room);
    io.to(roomId).emit("chat message", {
      room: roomId,
      text: `${user.name} has joined the game!`,
      name: "System",
    });
    const gameState = gameStates[roomId] || {};
    io.to(roomId).emit("game:state", {
      players: room.players,
      creatorId: room.creatorId,
      isRoundActive: gameState.isRoundActive || false,
      scores: gameState.scores || {},
      drawer: gameState.drawer,
    });
    if (gameState.isRoundActive && gameState.drawingHistory) {
      socket.emit("game:drawing_history", gameState.drawingHistory);
    }
    io.emit("game:roomsList", Object.values(activeGameRooms));
  });

  socket.on("game:leave", (roomId) => {
    socket.leave(roomId);
    handlePlayerLeave(socket.id, roomId);
  });

  socket.on("game:start", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];
    if (!room || !user || user.id !== room.creatorId) return;
    if (room.players.length < 2) {
      socket.emit("game:message", "You need at least 2 players to start.");
      return;
    }
    const initialScores = {};
    room.players.forEach((p) => (initialScores[p.id] = 0));
    gameStates[roomId] = {
      players: room.players.map((p) => p.id),
      scores: initialScores,
      isRoundActive: false,
      creatorId: room.creatorId,
      currentPlayerIndex: -1,
      drawingHistory: [],
    };
    startNewRound(roomId);
  });

  socket.on("game:stop", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];
    if (!room || !user || user.id !== room.creatorId) return;
    io.to(roomId).emit(
      "game:terminated",
      "The host has terminated the game room."
    );
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
      socketsInRoom.forEach((socketId) =>
        io.sockets.sockets.get(socketId).leave(roomId)
      );
    }
    delete activeGameRooms[roomId];
    delete gameStates[roomId];
    io.emit("game:roomsList", Object.values(activeGameRooms));
  });

  socket.on("game:draw", ({ room, data }) => {
    const gameState = gameStates[room];
    if (
      gameState &&
      gameState.isRoundActive &&
      socket.id === gameState.drawer.id
    ) {
      gameState.drawingHistory.push(data);
      socket.to(room).emit("game:draw", data);
    }
  });

  socket.on("game:clear_canvas", (room) => {
    const gameState = gameStates[room];
    if (gameState && gameState.drawer.id === socket.id) {
      gameState.drawingHistory = [];
      io.to(room).emit("game:clear_canvas");
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    const user = users[socket.id];
    if (user) {
      for (const roomId in activeGameRooms) {
        handlePlayerLeave(socket.id, roomId);
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
      if (gameState) gameState.isRoundActive = false;
      io.to(roomId).emit(
        "game:end",
        "Not enough players to continue. Waiting for more..."
      );
      io.to(roomId).emit("game:state", {
        creatorId: room ? room.creatorId : null,
        players: room ? room.players : [],
        isRoundActive: false,
        scores: gameState ? gameState.scores : {},
      });
      return;
    }
    gameState.drawingHistory = [];
    gameState.players = room.players.map((p) => p.id);
    const nextDrawerIndex =
      (gameState.currentPlayerIndex + 1) % gameState.players.length;
    gameState.currentPlayerIndex = nextDrawerIndex;
    const drawerId = gameState.players[nextDrawerIndex];
    const drawerUser = users[drawerId];
    if (!drawerUser) {
      console.log(`Could not find drawer user for id ${drawerId}, skipping.`);
      startNewRound(roomId);
      return;
    }
    const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];
    gameState.drawer = drawerUser;
    gameState.word = word;
    gameState.isRoundActive = true;
    io.to(roomId).emit("game:new_round");
    gameState.roundTimer = setTimeout(() => {
      io.to(roomId).emit("game:message", `Time's up! The word was '${word}'.`);
      startNewRound(roomId);
    }, ROUND_TIME);
    io.to(roomId).emit("game:state", {
      drawer: drawerUser,
      isRoundActive: true,
      scores: gameState.scores,
      creatorId: room.creatorId,
      players: room.players,
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
