const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

// --- CORS Configuration ---
const allowedOrigin = "https://anonymous-chat-frontend-gray.vercel.app"; // Or your deployed frontend URL

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
const users = {}; // { socket.id: { id, name, gender, age, roomId, lastTypingTime } }
const chatHistory = {}; // { roomId: [ { msg, timestamp, senderName, senderId } ] }
const gameStates = {}; // { roomId: { drawer, word, scores, isRoundActive, roundStart, roundTimer, creatorId, players: [], drawingHistory: [] } }
const activeGameRooms = {}; // { roomId: { id, name, creatorName, creatorId, players: [{id, name}], isGameActive, maxPlayers } }
const userRooms = {}; // { userId: roomId } - to quickly find which room a user is in

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
const ROUND_TIME = 60 * 1000; // 60 seconds per round
const GUESS_SCORE = 100;
const DRAW_SCORE_PER_GUESSER = 20;

// --- Helper Functions ---

function getRoomUsers(roomId) {
  const roomSockets = io.sockets.adapter.rooms.get(roomId);
  if (!roomSockets) return [];
  const roomUserIds = Array.from(roomSockets).map((sid) => users[sid]?.id);
  return Object.values(users).filter(
    (user) => roomUserIds.includes(user.id) && user.roomId === roomId
  );
}

function updateRoomList() {
  const simplifiedRooms = {};
  for (const roomId in activeGameRooms) {
    const room = activeGameRooms[roomId];
    // Filter out players who might have disconnected but still in the players array
    const activePlayersInRoom = room.players.filter((p) => users[p.id]);

    simplifiedRooms[roomId] = {
      id: room.id,
      name: room.name,
      creatorName: room.creatorName,
      creatorId: room.creatorId,
      players: activePlayersInRoom.map((p) => ({ id: p.id, name: p.name })), // Only send ID and name
      isGameActive: gameStates[roomId]?.isRoundActive || false,
      maxPlayers: 10, // Max players for display, adjust as needed
    };
  }
  io.emit("game:roomsList", simplifiedRooms);
}

function resetGameState(roomId) {
  const gameState = gameStates[roomId];
  if (gameState) {
    if (gameState.roundTimer) {
      clearTimeout(gameState.roundTimer);
    }
    gameStates[roomId] = {
      drawer: null,
      word: "",
      isRoundActive: false,
      roundStart: null,
      scores: {},
      creatorId: activeGameRooms[roomId]?.creatorId,
      players: activeGameRooms[roomId]?.players.map((p) => p.id) || [], // Keep current players
      drawingHistory: [], // Clear drawing history
    };
    io.to(roomId).emit("game:end"); // Notify clients game ended
    io.to(roomId).emit("game:state", gameStates[roomId]); // Send initial state
    io.to(roomId).emit("game:clearCanvas"); // Ensure canvas is cleared for all
    updateRoomList(); // Update room list for game status
  }
}

function startNewRound(roomId) {
  const room = activeGameRooms[roomId];
  if (!room) {
    console.error(`Room ${roomId} not found for starting new round.`);
    return;
  }

  let gameState = gameStates[roomId];
  if (!gameState) {
    gameState = {
      drawer: null,
      word: "",
      isRoundActive: false,
      roundStart: null,
      scores: {},
      creatorId: room.creatorId,
      players: room.players.map((p) => p.id),
      drawingHistory: [],
    };
    gameStates[roomId] = gameState;
  }

  // Filter out disconnected players from the active players list
  room.players = room.players.filter((p) => users[p.id]);

  if (room.players.length < 2) {
    io.to(roomId).emit(
      "game:message",
      "Need at least 2 players to start a new round."
    );
    gameState.isRoundActive = false; // Ensure game is not active
    io.to(roomId).emit("game:state", {
      drawer: null,
      isRoundActive: false,
      scores: gameState.scores,
      creatorId: gameState.creatorId,
      players: room.players,
    });
    return;
  }

  // Determine next drawer
  const currentDrawerIndex = gameState.drawer
    ? gameState.players.indexOf(gameState.drawer.id)
    : -1;
  const nextDrawerIndex = (currentDrawerIndex + 1) % gameState.players.length;
  const drawerId = gameState.players[nextDrawerIndex];
  const drawerUser = users[drawerId];

  if (!drawerUser) {
    console.warn(
      `Drawer user ${drawerId} not found. Restarting round selection.`
    );
    startNewRound(roomId); // Try again if user somehow disconnected
    return;
  }

  // Clear previous round's timer if exists
  if (gameState.roundTimer) {
    clearTimeout(gameState.roundTimer);
  }

  const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];

  gameState.drawer = { id: drawerUser.id, name: drawerUser.name };
  gameState.word = word;
  gameState.isRoundActive = true;
  gameState.roundStart = Date.now();
  gameState.drawingHistory = []; // Clear drawing for new round

  // Initialize scores for new players or if not already present
  room.players.forEach((p) => {
    if (!gameState.scores[p.id]) {
      gameState.scores[p.id] = { name: users[p.id].name, score: 0 };
    }
  });

  gameState.roundTimer = setTimeout(() => {
    io.to(roomId).emit("game:message", `Time's up! The word was '${word}'.`);
    startNewRound(roomId);
  }, ROUND_TIME);

  // Emit game state to all in the room
  io.to(roomId).emit("game:state", {
    drawer: gameState.drawer,
    isRoundActive: true,
    scores: gameState.scores,
    creatorId: gameState.creatorId,
    players: room.players.map((p) => ({ id: p.id, name: users[p.id].name })),
  });

  // Privately tell the drawer the word
  io.to(drawerId).emit(
    "game:message",
    `You are drawing! Your word is: "${word}"`
  );
  // Tell others to guess
  room.players.forEach((p) => {
    if (p.id !== drawerId) {
      io.to(p.id).emit("game:message", "Guess the word!");
    }
  });

  io.to(roomId).emit("game:clearCanvas"); // Clear canvas for new round
  updateRoomList(); // Update room list for game status
}

// --- Socket.IO Connection Handling ---
io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  // --- User Management ---
  socket.on("user:setProfile", (data) => {
    const userId = socket.id; // Use socket.id as initial unique ID
    users[userId] = {
      id: userId, // Persistent ID
      name: data.name,
      age: data.age,
      gender: data.gender,
      roomId: "global", // Default room
      lastTypingTime: 0,
    };
    userRooms[userId] = "global";
    socket.join("global");
    socket.emit("user:profileSet", users[userId]);
    io.emit("user:list", users); // Update all clients with new user list
    console.log("User profile set:", users[userId]);

    // Send chat history and background for global room on connect
    if (chatHistory["global"]) {
      socket.emit("chat:history", chatHistory["global"]);
    }
    socket.emit("room:joined", {
      id: "global",
      name: "Global Chat",
      isGameRoom: false,
      background: "",
    });
  });

  // --- Chat Messaging ---
  socket.on("chat:message", (data) => {
    const user = users[socket.id];
    if (!user) {
      socket.emit("error", "Please set your profile first.");
      return;
    }

    const roomId = user.roomId;
    if (!chatHistory[roomId]) {
      chatHistory[roomId] = [];
    }

    // Handle game guesses
    const gameState = gameStates[roomId];
    if (
      gameState &&
      gameState.isRoundActive &&
      gameState.drawer.id !== user.id
    ) {
      const guessedWord = data.msg.toLowerCase().trim();
      const actualWord = gameState.word.toLowerCase();

      if (guessedWord === actualWord) {
        io.to(roomId).emit("game:message", `${user.name} guessed the word!`);

        // Award points
        if (!gameState.scores[user.id]) {
          gameState.scores[user.id] = { name: user.name, score: 0 };
        }
        gameState.scores[user.id].score += GUESS_SCORE;

        // Award points to the drawer based on number of guessers
        const guessersCount = Object.keys(gameState.scores).filter(
          (id) => id !== gameState.drawer.id
        ).length;
        if (!gameState.scores[gameState.drawer.id]) {
          gameState.scores[gameState.drawer.id] = {
            name: gameState.drawer.name,
            score: 0,
          };
        }
        gameState.scores[gameState.drawer.id].score +=
          guessersCount * DRAW_SCORE_PER_GUESSER;

        // End round and start new one
        startNewRound(roomId);
        io.to(roomId).emit("game:state", gameState); // Update scores immediately
        return; // Do not send as regular chat message
      }
    }

    const messageData = {
      msg: data.msg,
      timestamp: new Date().toLocaleTimeString(),
      senderName: user.name,
      senderId: user.id,
    };
    chatHistory[roomId].push(messageData);
    io.to(roomId).emit("chat:message", messageData);
  });

  // --- Typing Indicator ---
  let typingTimeout;
  socket.on("typing:start", () => {
    const user = users[socket.id];
    if (!user) return;
    const roomId = user.roomId;

    if (user.lastTypingTime === 0) {
      io.to(roomId).emit("typing:start", user.name);
    }
    user.lastTypingTime = Date.now();

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      user.lastTypingTime = 0;
      io.to(roomId).emit("typing:stop");
    }, 3000); // Stop typing after 3 seconds of inactivity
  });

  // --- Room Management ---
  socket.on("room:join", ({ roomId }) => {
    const user = users[socket.id];
    if (!user) {
      socket.emit("error", "Please set your profile first.");
      return;
    }

    const currentRoomId = user.roomId;
    if (currentRoomId === roomId) {
      socket.emit("error", `You are already in ${roomId}.`);
      return;
    }

    // Leave current room
    socket.leave(currentRoomId);
    if (activeGameRooms[currentRoomId]) {
      // Remove player from game room
      activeGameRooms[currentRoomId].players = activeGameRooms[
        currentRoomId
      ].players.filter((p) => p.id !== user.id);
      // If the drawer left, end the round
      if (
        gameStates[currentRoomId] &&
        gameStates[currentRoomId].drawer?.id === user.id
      ) {
        io.to(currentRoomId).emit(
          "game:message",
          `${user.name} (drawer) left. Round ended.`
        );
        startNewRound(currentRoomId); // Start a new round to pick a new drawer
      }
      io.to(currentRoomId).emit("game:message", `${user.name} left the room.`);
      updateRoomList();
    }
    io.to(currentRoomId).emit("user:list", users); // Update user list for old room

    // Join new room
    user.roomId = roomId;
    userRooms[user.id] = roomId;
    socket.join(roomId);
    console.log(`${user.name} joined room: ${roomId}`);

    const room = activeGameRooms[roomId];
    if (room) {
      // Add user to game room if it's a game room
      if (!room.players.some((p) => p.id === user.id)) {
        room.players.push({ id: user.id, name: user.name });
      }
      io.to(roomId).emit("game:message", `${user.name} joined the game room.`);
      socket.emit("room:joined", {
        id: room.id,
        name: room.name,
        isGameRoom: true,
        background: room.background,
      });
      // Send current game state if game is active
      if (gameStates[roomId] && gameStates[roomId].isRoundActive) {
        io.to(socket.id).emit("game:state", gameStates[roomId]);
        // Send drawing history to the new player
        gameStates[roomId].drawingHistory.forEach((line) => {
          socket.emit("game:draw", {
            x0: line.x0,
            y0: line.y0,
            x1: line.x1,
            y1: line.y1,
            color: line.color,
            width: line.width,
            senderId: line.senderId, // Include senderId to avoid re-drawing for self if somehow history contains self's drawing
          });
        });
      } else if (gameStates[roomId]) {
        // If game is not active but state exists, send it
        io.to(socket.id).emit("game:state", gameStates[roomId]);
      } else {
        // Initialize basic game state if it's a new game room
        gameStates[roomId] = {
          drawer: null,
          word: "",
          isRoundActive: false,
          roundStart: null,
          scores: {},
          creatorId: room.creatorId,
          players: room.players.map((p) => p.id),
          drawingHistory: [],
        };
        io.to(socket.id).emit("game:state", gameStates[roomId]);
      }
      updateRoomList();
    } else {
      // Regular chat room
      socket.emit("room:joined", {
        id: roomId,
        name: roomId,
        isGameRoom: false,
        background: chatHistory[roomId]?.background || "",
      });
    }

    // Send chat history for the new room
    if (chatHistory[roomId]) {
      socket.emit("chat:history", chatHistory[roomId]);
    } else {
      chatHistory[roomId] = []; // Initialize if it doesn't exist
    }

    io.to(roomId).emit("user:list", getRoomUsers(roomId)); // Update user list for new room
  });

  socket.on("room:background", ({ roomId, background }) => {
    const user = users[socket.id];
    if (!user || user.roomId !== roomId) return; // Only allow current room's background change

    if (activeGameRooms[roomId]) {
      activeGameRooms[roomId].background = background;
    }
    // You might want to save background for regular rooms too if you implement them
    // For now, it only affects the active game room's background
    io.to(roomId).emit("room:backgroundUpdated", { roomId, background });
  });

  // --- Game Specific Events ---
  socket.on("game:createRoom", ({ roomName }) => {
    const user = users[socket.id];
    if (!user) {
      socket.emit("error", "Please set your profile first.");
      return;
    }

    const roomId = `game-${randomUUID().slice(0, 8)}`; // Unique ID for game room
    activeGameRooms[roomId] = {
      id: roomId,
      name: roomName,
      creatorName: user.name,
      creatorId: user.id,
      players: [],
      isGameActive: false,
      background: "", // Default background for game rooms
    };

    // Automatically join the creator to the room
    socket.emit("room:join", { roomId });
    updateRoomList();
    console.log(`${user.name} created game room: ${roomName} (${roomId})`);
  });

  socket.on("game:start", ({ roomId }) => {
    const user = users[socket.id];
    const room = activeGameRooms[roomId];
    const gameState = gameStates[roomId];

    if (!user || !room || room.creatorId !== user.id) {
      socket.emit("error", "You are not authorized to start this game.");
      return;
    }
    if (room.players.length < 2) {
      socket.emit("error", "Need at least 2 players to start the game.");
      return;
    }
    if (gameState && gameState.isRoundActive) {
      socket.emit("error", "Game is already active.");
      return;
    }

    io.to(roomId).emit("game:message", `Game "${room.name}" is starting!`);
    startNewRound(roomId);
  });

  socket.on("game:end", ({ roomId }) => {
    const user = users[socket.id];
    const room = activeGameRooms[roomId];

    if (!user || !room || room.creatorId !== user.id) {
      socket.emit("error", "You are not authorized to end this game.");
      return;
    }

    io.to(roomId).emit(
      "game:message",
      `Game "${room.name}" has been ended by ${user.name}.`
    );
    resetGameState(roomId); // Reset the game state
    // Optional: Delete the game room if you want it to disappear after ending
    // delete activeGameRooms[roomId];
    // delete gameStates[roomId];
    // updateRoomList();
  });

  socket.on("game:draw", (data) => {
    const user = users[socket.id];
    const roomId = user?.roomId;
    const gameState = gameStates[roomId];

    if (
      !user ||
      !roomId ||
      !gameState ||
      !gameState.isRoundActive ||
      gameState.drawer.id !== user.id
    ) {
      // User is not the drawer or not in an active game
      return;
    }

    // Add drawing data to history
    gameState.drawingHistory.push({
      x0: data.x0,
      y0: data.y0,
      x1: data.x1,
      y1: data.y1,
      color: data.color,
      width: data.width,
      senderId: user.id, // Store sender ID
    });

    // Broadcast drawing to all others in the room
    socket.to(roomId).emit("game:draw", {
      x0: data.x0,
      y0: data.y0,
      x1: data.x1,
      y1: data.y1,
      color: data.color,
      width: data.width,
      senderId: user.id, // Include senderId so client can filter its own drawings
    });
  });

  socket.on("game:clearCanvas", ({ roomId }) => {
    const user = users[socket.id];
    const gameState = gameStates[roomId];

    if (
      !user ||
      !gameState ||
      !gameState.isRoundActive ||
      gameState.drawer.id !== user.id
    ) {
      socket.emit(
        "error",
        "Only the drawer can clear the canvas during a round."
      );
      return;
    }

    gameState.drawingHistory = []; // Clear server-side history
    io.to(roomId).emit("game:clearCanvas");
    io.to(roomId).emit("game:message", `${user.name} cleared the canvas.`);
  });

  // --- Disconnection ---
  socket.on("disconnect", () => {
    const user = users[socket.id];
    if (user) {
      const roomId = user.roomId;
      console.log(`${user.name} disconnected`);
      delete users[socket.id];
      delete userRooms[user.id]; // Clean up userRooms

      io.emit("user:list", users); // Update all clients with new user list

      // Handle user leaving a game room
      if (activeGameRooms[roomId]) {
        activeGameRooms[roomId].players = activeGameRooms[
          roomId
        ].players.filter((p) => p.id !== user.id);
        io.to(roomId).emit("game:message", `${user.name} left the room.`);

        // If the drawer disconnected, end the current round and start a new one
        const gameState = gameStates[roomId];
        if (
          gameState &&
          gameState.isRoundActive &&
          gameState.drawer?.id === user.id
        ) {
          io.to(roomId).emit(
            "game:message",
            `${user.name} (drawer) disconnected. Round ended.`
          );
          startNewRound(roomId); // Start a new round to pick a new drawer
        }
        // If room becomes empty, consider deleting it or resetting its state
        if (activeGameRooms[roomId].players.length === 0) {
          console.log(`Game room ${roomId} is empty. Deleting.`);
          delete activeGameRooms[roomId];
          resetGameState(roomId); // Ensure game state is also cleaned up
          delete gameStates[roomId];
        }
        updateRoomList(); // Update game room list after disconnection
      } else {
        // If it's a regular chat room, just emit a system message
        io.to(roomId).emit("chat:message", {
          msg: `${user.name} has disconnected.`,
          timestamp: new Date().toLocaleTimeString(),
          senderName: "System",
          senderId: "system",
        });
      }
    }
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  // Initial update of room list on server start
  updateRoomList();
});
