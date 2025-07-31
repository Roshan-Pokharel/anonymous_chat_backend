const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const allowedOrigin = "https://anonymous-chat-frontend-gray.vercel.app";

const corsOptions = {
  origin: "https://anonymous-chat-frontend-gray.vercel.app", //
  methods: ["GET", "POST"],
};

// Use CORS middleware for Express
app.use(cors(corsOptions));

// Initialize Socket.IO with the same CORS options
const io = new Server(server, {
  cors: corsOptions,
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
    // If joining an active game room, send the current drawing
    if (gameStates[roomName] && gameStates[roomName].isRoundActive) {
      socket.emit("game:drawing_history", gameStates[roomName].drawingHistory);
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
        clearTimeout(gameState.roundTimer); // Stop the timer

        const drawerSocketId = gameState.drawer.id;
        // Award 1 point to guesser and 1 to drawer
        gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + 1;
        if (users[drawerSocketId]) {
          gameState.scores[drawerSocketId] =
            (gameState.scores[drawerSocketId] || 0) + 1;
        }

        io.to(room).emit("game:correct_guess", {
          guesser: user,
          word: gameState.word,
        });

        // Check for a winner
        const winnerId = Object.keys(gameState.scores).find(
          (id) => gameState.scores[id] >= WINNING_SCORE
        );

        if (winnerId && users[winnerId]) {
          const winner = users[winnerId];
          const finalScores = { ...gameState.scores };

          // Reset game state
          gameState.isRoundActive = false;
          gameState.drawer = null;
          gameState.word = null;
          Object.keys(gameState.scores).forEach(
            (id) => (gameState.scores[id] = 0)
          );

          io.to(room).emit("game:over", { winner, scores: finalScores });
        } else {
          // If no winner, start a new round after a short delay
          setTimeout(() => startNewRound(room), 2000);
        }
        return;
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

    // Send initial state for the new room
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
    if (!user || !room) return;
    if (room.players.some((p) => p.id === user.id)) return;

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
    });
    io.emit("game:roomsList", Object.values(activeGameRooms));
  });

  // --- GAMEPLAY EVENTS ---
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
      drawingHistory: [], // To store drawing data for the current round
    };

    startNewRound(roomId);
  });

  socket.on("game:stop", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];

    if (!room || !user || user.id !== room.creatorId) return;

    // Notify players and make them leave the room
    io.to(roomId).emit(
      "game:terminated",
      "The host has terminated the game room."
    );

    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
      socketsInRoom.forEach((socketId) => {
        io.sockets.sockets.get(socketId).leave(roomId);
      });
    }

    // Clean up server state
    delete activeGameRooms[roomId];
    delete gameStates[roomId];

    // Update room list for all clients
    io.emit("game:roomsList", Object.values(activeGameRooms));
  });

  socket.on("game:draw", ({ room, data }) => {
    const gameState = gameStates[room];
    if (
      gameState &&
      gameState.isRoundActive &&
      socket.id === gameState.drawer.id
    ) {
      gameState.drawingHistory.push(data); // Save the drawing command
      socket.to(room).emit("game:draw", data);
    }
  });

  socket.on("game:clear_canvas", (room) => {
    const gameState = gameStates[room];
    if (gameState && gameState.drawer.id === socket.id) {
      gameState.drawingHistory = []; // Clear history on server
      io.to(room).emit("game:clear_canvas");
    }
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    const user = users[socket.id];
    if (user) {
      for (const roomId in activeGameRooms) {
        const room = activeGameRooms[roomId];
        const playerIndex = room.players.findIndex((p) => p.id === socket.id);

        if (playerIndex > -1) {
          room.players.splice(playerIndex, 1);

          const gameState = gameStates[roomId];
          if (!gameState) {
            if (room.players.length === 0) {
              delete activeGameRooms[roomId];
            } else {
              // If creator leaves, assign a new one
              if (room.creatorId === socket.id) {
                room.creatorId = room.players[0].id;
                room.creatorName = room.players[0].name;
              }
            }
            io.emit("game:roomsList", Object.values(activeGameRooms));
            continue;
          }

          const wasGameActive = gameState.isRoundActive;

          if (room.players.length < 2) {
            if (wasGameActive) {
              if (gameState.roundTimer) clearTimeout(gameState.roundTimer);
              gameState.isRoundActive = false;
              io.to(roomId).emit(
                "game:message",
                "Not enough players to continue the game."
              );
            }
            if (room.players.length === 0) {
              delete activeGameRooms[roomId];
              delete gameStates[roomId];
            }
          } else {
            const wasCreator = room.creatorId === socket.id;
            if (wasCreator) {
              room.creatorId = room.players[0].id;
              room.creatorName = room.players[0].name;
            }
            const wasDrawer =
              gameState.drawer && gameState.drawer.id === socket.id;
            if (wasGameActive && wasDrawer) {
              io.to(roomId).emit(
                "game:message",
                "The drawer disconnected. Starting a new round."
              );
              clearTimeout(gameState.roundTimer);
              startNewRound(roomId);
            }
          }

          // Notify everyone of the updated state
          io.to(roomId).emit("game:state", {
            players: room.players,
            creatorId: room.creatorId,
            isRoundActive: gameState.isRoundActive,
            scores: gameState.scores,
          });
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

    gameState.drawingHistory = []; // Clear drawing history for the new round
    gameState.players = room.players.map((p) => p.id);
    const nextDrawerIndex =
      (gameState.currentPlayerIndex + 1) % gameState.players.length;
    gameState.currentPlayerIndex = nextDrawerIndex;

    const drawerId = gameState.players[nextDrawerIndex];
    const drawerUser = users[drawerId];

    if (!drawerUser) {
      // This can happen if a user disconnects at the wrong time. We try the next one.
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
