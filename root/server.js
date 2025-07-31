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
  origin: allowedOrigin,
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
const gameStates = {}; // { roomId: { drawer, word, scores, players:[], roundTimer, isRoundActive, creatorId } }
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
  "bird",
  "fish",
  "flower",
  "cloud",
  "rain",
  "boat",
  "chair",
  "table",
  "book",
  "pencil",
  "shoe",
  "hat",
  "shirt",
  "pants",
  "sock",
  "ball",
  "kite",
  "pizza",
  "cake",
  "milk",
  "juice",
  "bed",
  "lamp",
  "door",
  "window",
  "road",
  "bridge",
  "mountain",
  "river",
  "ocean",
  "beach",
  "computer",
  "phone",
  "keyboard",
  "mouse",
  "watch",
  "glasses",
  "wallet",
  "umbrella",
  "backpack",
  "camera",
  "guitar",
  "drum",
  "piano",
  "violin",
  "trumpet",
  "robot",
  "alien",
  "dragon",
  "unicorn",
  "mermaid",
  "wizard",
  "knight",
  "prince",
  "princess",
  "king",
  "queen",
  "castle",
  "forest",
  "desert",
  "island",
  "volcano",
  "rocket",
  "planet",
  "galaxy",
  "comet",
  "meteor",
  "diamond",
  "ruby",
  "emerald",
  "gold",
  "silver",
  "bronze",
  "coin",
  "treasure",
  "map",
  "compass",
  "telescope",
  "microscope",
  "beaker",
  "flask",
  "magnet",
  "battery",
  "lightbulb",
  "fan",
  "clock",
  "calendar",
  "scissors",
  "glue",
  "paint",
  "brush",
  "eraser",
  "ruler",
  "globe",
  "pyramid",
  "sphinx",
  "tower",
  "statue",
  "fountain",
  "garden",
  "park",
  "zoo",
  "circus",
  "theater",
  "museum",
  "library",
  "school",
  "hospital",
  "police",
  "firefighter",
  "doctor",
  "teacher",
  "student",
  "chef",
  "artist",
  "musician",
  "athlete",
  "dancer",
  "singer",
  "writer",
  "engineer",
  "scientist",
  "detective",
  "pilot",
  "captain",
  "soldier",
  "knight",
  "superhero",
  "villain",
  "robot",
  "monster",
  "ghost",
  "zombie",
  "vampire",
  "werewolf",
  "witch",
  "fairy",
  "elf",
  "dwarf",
  "giant",
  "ogre",
  "goblin",
  "skeleton",
  "mummy",
  "ninja",
  "samurai",
  "cowboy",
  "pirate",
  "explorer",
  "inventor",
  "magician",
  "juggler",
  "clown",
  "acrobat",
  "trapeze",
  "tightrope",
  "unicycle",
  "skateboard",
  "rollerblade",
  "surfboard",
  "snowboard",
  "skis",
  "sled",
  "canoe",
  "kayak",
  "paddleboard",
  "scooter",
  "bicycle",
  "motorcycle",
  "train",
  "airplane",
  "helicopter",
  "submarine",
  "spaceship",
];
const ROUND_TIME = 60 * 1000; // 60 seconds
const GAME_OVER_TIME = 5 * 60 * 1000; // 5 minutes total game time

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
    if (gameStates[roomName]) {
      // Re-emit game state to a new joiner
      socket.emit("game:state", {
        creatorId: gameStates[roomName].creatorId,
        players: activeGameRooms[roomName].players, // Send player list as well
        drawer: gameStates[roomName].drawer,
        word: gameStates[roomName].word,
        scores: gameStates[roomName].scores,
        isRoundActive: gameStates[roomName].isRoundActive,
        roundTimeLeft: gameStates[roomName].roundTimeLeft,
      });
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
    const newRoom = {
      id: roomId,
      name: roomName || `${user.name}'s Room`,
      creatorId: socket.id,
      creatorName: user.name,
      players: [user],
    };
    activeGameRooms[roomId] = newRoom;
    socket.join(roomId);
    socket.emit("game:joined", newRoom); // Tell creator they joined

    // Initialize game state for the new room
    gameStates[roomId] = {
      players: [user.id],
      scores: { [user.id]: 0 },
      isRoundActive: false,
      creatorId: socket.id,
      drawer: null,
      word: "",
      roundTimer: null,
      gameTimer: null,
      gameStartTime: null,
    };

    io.to(roomId).emit("game:state", {
      creatorId: newRoom.creatorId,
      players: newRoom.players,
      isRoundActive: false,
      scores: gameStates[roomId].scores,
      drawer: null,
      word: "",
      roundTimeLeft: 0,
    });
    io.emit("game:roomsList", Object.values(activeGameRooms)); // Update room list for all clients
  });

  socket.on("game:join", (roomId) => {
    const user = users[socket.id];
    const room = activeGameRooms[roomId];
    if (!user || !room) return;
    if (room.players.some((p) => p.id === user.id)) return; // User already in room

    room.players.push(user);
    socket.join(roomId);

    // Add player to game state scores if not present
    if (gameStates[roomId]) {
      gameStates[roomId].players.push(user.id);
      gameStates[roomId].scores[user.id] =
        gameStates[roomId].scores[user.id] || 0;
    }

    socket.emit("game:joined", room); // Tell joiner they joined
    io.to(roomId).emit("chat message", {
      room: roomId,
      text: `${user.name} has joined the game!`,
      name: "System",
    });

    // Notify everyone in the room of the new state
    io.to(roomId).emit("game:state", {
      creatorId: room.creatorId,
      players: room.players,
      isRoundActive: gameStates[roomId]
        ? gameStates[roomId].isRoundActive
        : false,
      drawer: gameStates[roomId] ? gameStates[roomId].drawer : null,
      word: gameStates[roomId] ? gameStates[roomId].word : "",
      scores: gameStates[roomId] ? gameStates[roomId].scores : {},
      roundTimeLeft: gameStates[roomId] ? gameStates[roomId].roundTimeLeft : 0,
    });
    io.emit("game:roomsList", Object.values(activeGameRooms)); // Update room list for all clients
  });

  // --- GAMEPLAY EVENTS ---
  socket.on("game:start", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];
    if (!room || !user || user.id !== room.creatorId) {
      socket.emit("game:message", "Only the room creator can start the game.");
      return;
    }
    if (room.players.length < 2) {
      socket.emit(
        "game:message",
        "You need at least 2 players to start the game."
      );
      return;
    }

    // Reset scores for a new game
    const roomUsersIds = room.players.map((p) => p.id);
    gameStates[roomId] = {
      players: roomUsersIds,
      scores: {},
      isRoundActive: false,
      creatorId: room.creatorId,
      drawer: null,
      word: "",
      roundTimer: null,
      gameTimer: null,
      gameStartTime: Date.now(),
    };
    roomUsersIds.forEach((id) => (gameStates[roomId].scores[id] = 0));

    io.to(roomId).emit("chat message", {
      room: roomId,
      text: "The game has started! Good luck!",
      name: "System",
    });

    // Start a game timer
    gameStates[roomId].gameTimer = setTimeout(() => {
      endGame(roomId, "Game over! Time's up!");
    }, GAME_OVER_TIME);

    startNewRound(roomId);
  });

  socket.on("game:draw", ({ room, data }) => {
    const gameState = gameStates[room];
    if (
      gameState &&
      gameState.isRoundActive &&
      socket.id === gameState.drawer.id
    ) {
      // Broadcast drawing data to all other clients in the room
      socket.to(room).emit("game:draw", { room, data });
    }
  });

  socket.on("game:clear_canvas", ({ room }) => {
    const gameState = gameStates[room];
    if (
      gameState &&
      gameState.isRoundActive &&
      socket.id === gameState.drawer.id
    ) {
      io.to(room).emit("game:clear_canvas");
      io.to(room).emit("chat message", {
        room: room,
        text: `${users[socket.id].name} cleared the canvas.`,
        name: "System",
      });
    }
  });

  socket.on("game:end", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];
    if (!room || !user || user.id !== room.creatorId) {
      socket.emit("game:message", "Only the room creator can end the game.");
      return;
    }
    endGame(roomId, "Game ended by creator.");
  });

  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    delete users[socket.id];
    io.emit("user list", Object.values(users));

    // Remove user from any game rooms they were in
    for (const roomId in activeGameRooms) {
      const room = activeGameRooms[roomId];
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
        if (gameStates[roomId]) {
          const gameStatePlayersIndex = gameStates[roomId].players.indexOf(
            socket.id
          );
          if (gameStatePlayersIndex !== -1) {
            gameStates[roomId].players.splice(gameStatePlayersIndex, 1);
          }
        }
        io.emit("game:roomsList", Object.values(activeGameRooms));
        io.to(roomId).emit("chat message", {
          room: roomId,
          text: `${
            room.creatorId === socket.id
              ? room.creatorName
              : users[socket.id]?.name || "A player"
          } has left the game.`,
          name: "System",
        });

        // If the drawer disconnects, or if no players left, end the round/game
        if (
          gameStates[roomId] &&
          gameStates[roomId].drawer &&
          gameStates[roomId].drawer.id === socket.id
        ) {
          clearTimeout(gameStates[roomId].roundTimer);
          io.to(roomId).emit("chat message", {
            room: roomId,
            text: "The drawer disconnected. Starting a new round...",
            name: "System",
          });
          startNewRound(roomId);
        } else if (room.players.length === 0) {
          endGame(roomId, "All players left. Game disbanded.");
        } else {
          // Update game state for remaining players if game is active
          io.to(roomId).emit("game:state", {
            creatorId: room.creatorId,
            players: room.players,
            isRoundActive: gameStates[roomId]
              ? gameStates[roomId].isRoundActive
              : false,
            drawer: gameStates[roomId] ? gameStates[roomId].drawer : null,
            word: gameStates[roomId] ? gameStates[roomId].word : "",
            scores: gameStates[roomId] ? gameStates[roomId].scores : {},
            roundTimeLeft: gameStates[roomId]
              ? gameStates[roomId].roundTimeLeft
              : 0,
          });
        }
      }
    }
  });

  // --- GAME HELPER FUNCTIONS (SERVER-SIDE) ---
  function startNewRound(roomId) {
    const room = activeGameRooms[roomId];
    const gameState = gameStates[roomId];

    if (!room || !gameState || gameState.players.length === 0) {
      endGame(roomId, "Not enough players to start a new round.");
      return;
    }

    clearTimeout(gameState.roundTimer); // Clear any existing timer

    const availablePlayers = gameState.players.filter((pId) => users[pId]); // Ensure player is still connected
    if (availablePlayers.length === 0) {
      endGame(roomId, "No active players for the next round.");
      return;
    }

    // Determine next drawer (round-robin)
    const currentDrawerIndex = availablePlayers.findIndex(
      (pId) => pId === gameState.drawer?.id
    );
    const nextDrawerIndex = (currentDrawerIndex + 1) % availablePlayers.length;
    const nextDrawerId = availablePlayers[nextDrawerIndex];
    const nextDrawer = users[nextDrawerId];

    if (!nextDrawer) {
      endGame(roomId, "Could not find next drawer. Game ended.");
      return;
    }

    const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];

    gameState.drawer = nextDrawer;
    gameState.word = word;
    gameState.isRoundActive = true;
    gameState.roundTimeLeft = ROUND_TIME;

    // Notify all players about the new round
    io.to(roomId).emit("chat message", {
      room: roomId,
      text: `New round! ${nextDrawer.name} is drawing. Guess the word!`,
      name: "System",
    });

    // Start round timer
    gameState.roundTimer = setTimeout(() => {
      io.to(roomId).emit("chat message", {
        room: roomId,
        text: `Time's up! The word was "${gameState.word}".`,
        name: "System",
      });
      startNewRound(roomId); // Start next round automatically
    }, ROUND_TIME);

    // Update game state for all players in the room
    io.to(roomId).emit("game:state", {
      creatorId: room.creatorId,
      players: room.players,
      drawer: gameState.drawer,
      word: gameState.word, // The server knows the word, client will obscure it if not drawer
      scores: gameState.scores,
      isRoundActive: gameState.isRoundActive,
      roundTimeLeft: gameState.roundTimeLeft,
    });

    // Send the actual word only to the drawer
    io.to(nextDrawer.id).emit("chat message", {
      room: roomId,
      text: `It's your turn to draw! The word is "${word}".`,
      name: "System",
      isPrivate: true,
    });

    // Update timer on client side every second
    const timerUpdateInterval = setInterval(() => {
      if (gameStates[roomId] && gameStates[roomId].isRoundActive) {
        gameStates[roomId].roundTimeLeft -= 1000;
        if (gameStates[roomId].roundTimeLeft < 0)
          gameStates[roomId].roundTimeLeft = 0;
        io.to(roomId).emit("game:state", {
          creatorId: room.creatorId,
          players: room.players,
          drawer: gameState.drawer,
          word: gameState.word,
          scores: gameState.scores,
          isRoundActive: gameState.isRoundActive,
          roundTimeLeft: gameState.roundTimeLeft,
        });
      } else {
        clearInterval(timerUpdateInterval);
      }
    }, 1000);
    // Store interval ID to clear it later
    gameState.timerUpdateInterval = timerUpdateInterval;
  }

  function endGame(roomId, message) {
    const room = activeGameRooms[roomId];
    const gameState = gameStates[roomId];

    if (gameState) {
      clearTimeout(gameState.roundTimer);
      clearTimeout(gameState.gameTimer);
      clearInterval(gameState.timerUpdateInterval); // Clear the 1-second interval
      gameState.isRoundActive = false;
      gameState.word = "";
      gameState.drawer = null;
      gameState.roundTimeLeft = 0;
    }

    if (room) {
      io.to(roomId).emit("chat message", {
        room: roomId,
        text: message,
        name: "System",
      });

      // Announce final scores
      if (gameState && Object.keys(gameState.scores).length > 0) {
        const finalScores = Object.entries(gameState.scores)
          .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
          .map(([id, score]) => {
            const user = users[id];
            return user ? `${user.name}: ${score}` : `Unknown: ${score}`;
          })
          .join(", ");
        io.to(roomId).emit("chat message", {
          room: roomId,
          text: `Final Scores: ${finalScores}`,
          name: "System",
        });
      }

      io.to(roomId).emit("game:ended"); // Notify clients to reset their UI
      // Disconnect all sockets in the game room and remove the room
      const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
      if (socketsInRoom) {
        socketsInRoom.forEach((socketId) => {
          io.sockets.sockets.get(socketId)?.leave(roomId);
        });
      }
      delete activeGameRooms[roomId];
      delete gameStates[roomId];
      io.emit("game:roomsList", Object.values(activeGameRooms)); // Update room list globally
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
