const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors({}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// --- STATE MANAGEMENT ---
const users = {}; // { socket.id: { id, name, gender, age } }
const chatHistory = {}; // { roomName: [ { msg, timestamp } ] }
const gameStates = {}; // { roomName: { status, host, players, drawer, word, etc. } }

// --- GAME CONSTANTS ---
const GAME_WORDS = [
  "Starry Night",
  "Mona Lisa",
  "The Persistence of Memory",
  "Guitar",
  "Sunrise",
  "Eiffel Tower",
  "Statue of Liberty",
  "Castle",
  "Dragon",
  "Spaceship",
];
const ROUND_TIME = 60 * 1000; // 90 seconds for drawing

// --- RATE LIMITING ---
const userMessageTimestamps = {};
const RATE_LIMIT_COUNT = 10;
const RATE_LIMIT_SECONDS = 5;

io.on("connection", (socket) => {
  console.log(`🟢 User connected: ${socket.id}`);
  userMessageTimestamps[socket.id] = [];

  // --- USER & CHAT HANDLERS ---
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
    // Send current game state if one exists for this room
    if (gameStates[roomName]) {
      socket.emit("game:state_update", gameStates[roomName]);
    }
  });

  socket.on("chat message", ({ room, text }) => {
    const user = users[socket.id];
    if (
      !user ||
      typeof text !== "string" ||
      text.trim().length === 0 ||
      text.length > 500
    )
      return;

    // Rate Limiting Check
    const now = Date.now();
    userMessageTimestamps[socket.id] = userMessageTimestamps[socket.id].filter(
      (t) => now - t < RATE_LIMIT_SECONDS * 1000
    );
    if (userMessageTimestamps[socket.id].length >= RATE_LIMIT_COUNT) {
      return socket.emit("rate limit", "You are sending messages too quickly.");
    }
    userMessageTimestamps[socket.id].push(now);

    // Game Guess Check
    const gameState = gameStates[room];
    if (
      gameState &&
      gameState.status === "playing" &&
      gameState.drawer &&
      socket.id !== gameState.drawer.id
    ) {
      if (text.trim().toLowerCase() === gameState.word.toLowerCase()) {
        const drawerSocketId = gameState.drawer.id;
        gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + 10;
        if (users[drawerSocketId]) {
          // Ensure drawer is still connected
          gameState.scores[drawerSocketId] =
            (gameState.scores[drawerSocketId] || 0) + 5;
        }
        io.to(room).emit("game:correct_guess", {
          guesser: user,
          word: gameState.word,
        });
        clearTimeout(gameState.roundTimer);
        startNewRound(room);
        return;
      }
    }

    const msg = {
      id: socket.id,
      name: user.name,
      gender: user.gender,
      age: user.age,
      text: text.trim(),
      room,
    };
    if (!chatHistory[room]) chatHistory[room] = [];
    chatHistory[room].push({ msg, timestamp: Date.now() });
    io.to(room).emit("chat message", msg);
  });

  // --- GAME LOGIC HANDLERS ---

  // A player wants to create a new game lobby
  socket.on("game:create", (room) => {
    if (gameStates[room]) {
      return socket.emit(
        "game:error",
        "A game is already in progress in this room."
      );
    }
    const hostUser = users[socket.id];
    if (!hostUser) return;

    gameStates[room] = {
      status: "lobby",
      host: hostUser,
      players: { [socket.id]: hostUser },
      scores: { [socket.id]: 0 },
    };
    io.to(room).emit("game:state_update", gameStates[room]);
  });

  // A player wants to join an existing game lobby
  socket.on("game:join", (room) => {
    const gameState = gameStates[room];
    const player = users[socket.id];
    if (!gameState || gameState.status !== "lobby" || !player) return;

    gameState.players[socket.id] = player;
    gameState.scores[socket.id] = 0;
    io.to(room).emit("game:state_update", gameState);
  });

  // The host starts the game from the lobby
  socket.on("game:start", (room) => {
    const gameState = gameStates[room];
    if (!gameState || gameState.host.id !== socket.id) return;
    if (Object.keys(gameState.players).length < 2) {
      return socket.emit("game:error", "You need at least 2 players to start.");
    }
    gameState.status = "playing";
    gameState.playerOrder = Object.keys(gameState.players); // Initial player order
    gameState.currentDrawerIndex = -1;
    startNewRound(room);
  });

  // The host or a player cancels/leaves the game
  socket.on("game:cancel", (room) => {
    const gameState = gameStates[room];
    if (!gameState) return;
    // If the host cancels, end the game for everyone
    if (gameState.host.id === socket.id) {
      delete gameStates[room];
      io.to(room).emit("game:state_update", null); // Clear state on clients
      io.to(room).emit("game:message", {
        text: `${users[socket.id]?.name || "Host"} has ended the game.`,
      });
    } else {
      // If a player leaves
      delete gameState.players[socket.id];
      io.to(room).emit("game:state_update", gameState);
    }
  });

  // Handling drawing data
  socket.on("game:draw", ({ room, drawData }) => {
    const gameState = gameStates[room];
    if (gameState && gameState.drawer && socket.id === gameState.drawer.id) {
      socket.to(room).emit("game:draw", drawData);
    }
  });

  // Handling canvas clear
  socket.on("game:clear_canvas", (room) => {
    io.to(room).emit("game:clear_canvas");
  });

  // --- DISCONNECT LOGIC ---
  socket.on("disconnect", () => {
    console.log(`🔴 User disconnected: ${socket.id}`);
    const disconnectingUser = users[socket.id];
    if (disconnectingUser) {
      // Check if the user was in any games
      for (const room in gameStates) {
        const gameState = gameStates[room];
        if (gameState.players[socket.id]) {
          // If the host disconnects, end the game
          if (gameState.host.id === socket.id) {
            io.to(room).emit("game:message", {
              text: `Host ${disconnectingUser.name} disconnected. The game has ended.`,
            });
            delete gameStates[room];
            io.to(room).emit("game:state_update", null);
          } else {
            // If a player disconnects
            delete gameState.players[socket.id];
            // If the drawer disconnected, start a new round
            if (gameState.drawer && gameState.drawer.id === socket.id) {
              io.to(room).emit("game:message", {
                text: `Drawer ${disconnectingUser.name} disconnected. Starting a new round.`,
              });
              clearTimeout(gameState.roundTimer);
              startNewRound(room);
            } else {
              // Just update the player list for others
              io.to(room).emit("game:state_update", gameState);
            }
          }
        }
      }
    }
    delete users[socket.id];
    delete userMessageTimestamps[socket.id];
    io.emit("user list", Object.values(users));
  });

  // --- GAME HELPER FUNCTIONS ---
  function startNewRound(room) {
    const gameState = gameStates[room];
    if (!gameState || Object.keys(gameState.players).length < 2) {
      io.to(room).emit("game:message", {
        text: "Not enough players to continue. The game has ended.",
      });
      delete gameStates[room];
      io.to(room).emit("game:state_update", null);
      return;
    }

    gameState.currentDrawerIndex =
      (gameState.currentDrawerIndex + 1) % gameState.playerOrder.length;
    const drawerId = gameState.playerOrder[gameState.currentDrawerIndex];
    const drawerUser = gameState.players[drawerId];

    if (!drawerUser) {
      // If drawer left, try next player
      gameState.playerOrder.splice(gameState.currentDrawerIndex, 1);
      gameState.currentDrawerIndex--; // Adjust index for next increment
      startNewRound(room);
      return;
    }

    const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];
    gameState.drawer = drawerUser;
    gameState.word = word;

    gameState.roundTimer = setTimeout(() => {
      io.to(room).emit("game:message", {
        text: `Time's up! The word was "${word}".`,
      });
      startNewRound(room);
    }, ROUND_TIME);

    io.to(room).emit("game:state_update", gameState);
    io.to(drawerId).emit("game:word_prompt", word);
    io.to(room).emit("game:clear_canvas");
  }
});

app.get("/", (req, res) => res.send("✅ Doodle Dash Chat Backend is running."));
server.listen(process.env.PORT || 3000, () =>
  console.log(`🚀 Server on port ${process.env.PORT || 3000}`)
);
