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
const gameStates = {}; // { roomId: { drawer, word, scores, isRoundActive, players, currentPlayerIndex, roundTimer, drawingHistory: [] } }
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
  "cloud",
  "flower",
  "bird",
  "fish",
  "cat",
  "dog",
  "book",
  "pen",
  "chair",
  "table",
  "cup",
  "shoe",
  "hat",
  "shirt",
  "pants",
  "sock",
  "ball",
  "kite",
  "boat",
  "plane",
  "train",
  "truck",
  "bus",
  "bike",
  "road",
  "river",
  "mountain",
  "ocean",
  "beach",
  "forest",
  "city",
  "farm",
  "school",
  "hospital",
  "store",
  "library",
  "park",
  "bridge",
  "clock",
  "watch",
  "key",
  "lock",
  "door",
  "window",
  "bed",
  "lamp",
  "phone",
  "computer",
  "mouse",
  "keyboard",
  "screen",
  "speaker",
  "microphone",
  "camera",
  "robot",
  "rocket",
  "space",
  "planet",
  "earth",
  "fire",
  "water",
  "air",
  "ice",
  "snow",
  "rain",
  "wind",
  "storm",
  "rainbow",
  "light",
  "dark",
  "color",
  "shape",
  "circle",
  "square",
  "triangle",
  "heart",
  "starfish",
  "diamond",
  "music",
  "song",
  "dance",
  "jump",
  "run",
  "walk",
  "sleep",
  "eat",
  "drink",
  "cook",
  "read",
  "write",
  "draw",
  "paint",
  "sing",
  "talk",
  "listen",
  "happy",
  "sad",
  "angry",
  "scared",
  "love",
  "hate",
  "friend",
  "family",
  "teacher",
  "student",
  "doctor",
  "nurse",
  "police",
  "firefighter",
  "pilot",
  "chef",
  "artist",
  "musician",
  "actor",
  "athlete",
  "hero",
  "villain",
  "king",
  "queen",
  "prince",
  "princess",
  "knight",
  "dragon",
  "monster",
  "ghost",
  "witch",
  "wizard",
  "fairy",
  "angel",
  "devil",
  "magic",
  "mystery",
  "adventure",
  "journey",
  "treasure",
  "map",
  "compass",
  "telescope",
  "microscope",
  "discovery",
  "invention",
  "science",
  "history",
  "geography",
  "math",
  "language",
  "culture",
  "world",
  "universe",
  "galaxy",
  "constellation",
  "comet",
  "meteor",
  "volcano",
  "earthquake",
  "tsunami",
  "tornado",
  "hurricane",
  "flood",
  "drought",
  "desert",
  "jungle",
  "swamp",
  "cave",
  "island",
  "peninsula",
  "valley",
  "canyon",
  "glacier",
  "waterfall",
  "dam",
  "canal",
  "tunnel",
  "pyramid",
  "castle",
  "tower",
  "statue",
  "monument",
  "ruins",
  "ancient",
  "modern",
  "future",
  "past",
  "present",
  "time",
  "space",
  "dimension",
  "energy",
  "force",
  "gravity",
  "magnet",
  "electricity",
  "sound",
  "lightwave",
  "atom",
  "molecule",
  "cell",
  "organ",
  "brain",
  "heartbeat",
  "blood",
  "bone",
  "muscle",
  "skin",
  "hair",
  "nail",
  "tooth",
  "tongue",
  "eye",
  "ear",
  "nose",
  "mouth",
  "hand",
  "foot",
  "finger",
  "toe",
  "knee",
  "elbow",
  "shoulder",
  "neck",
  "head",
  "body",
  "mind",
  "soul",
  "spirit",
  "dream",
  "nightmare",
  "imagination",
  "creativity",
  "inspiration",
  "idea",
  "thought",
  "knowledge",
  "wisdom",
  "truth",
  "lie",
  "secret",
  "riddle",
  "puzzle",
  "game",
  "sport",
  "hobby",
  "talent",
  "skill",
  "challenge",
  "victory",
  "defeat",
  "prize",
  "reward",
  "punishment",
  "justice",
  "freedom",
  "peace",
  "war",
  "conflict",
  "solution",
  "problem",
  "question",
  "answer",
  "reason",
  "emotion",
  "feeling",
  "sense",
  "smell",
  "taste",
  "touch",
  "sight",
  "hearing",
  "balance",
  "pain",
  "pleasure",
  "hunger",
  "thirst",
  "sleepy",
  "tired",
  "awake",
  "dreaming",
  "learning",
  "teaching",
  "growing",
  "changing",
  "beginning",
  "end",
  "life",
  "death",
  "birth",
  "holiday",
  "celebration",
  "festival",
  "party",
  "gift",
  "surprise",
  "luck",
  "fortune",
  "destiny",
  "fate",
  "chance",
  "choice",
  "decision",
  "opportunity",
  "risk",
  "safety",
  "danger",
  "warning",
  "sign",
  "symbol",
  "meaning",
  "purpose",
  "goal",
  "achievement",
  "success",
  "failure",
  "progress",
  "development",
  "growth",
  "evolution",
  "revolution",
  "system",
  "structure",
  "organization",
  "community",
  "society",
  "nation",
  "government",
  "politics",
  "economy",
  "business",
  "trade",
  "money",
  "wealth",
  "poverty",
  "rich",
  "poor",
  "job",
  "work",
  "career",
  "education",
  "knowledge",
  "information",
  "data",
  "internet",
  "website",
  "email",
  "message",
  "call",
  "communication",
  "connection",
  "network",
  "code",
  "program",
  "software",
  "hardware",
  "technology",
  "innovation",
  "discovery",
  "research",
  "experiment",
  "analysis",
  "theory",
  "principle",
  "concept",
  "idea",
  "creativity",
  "art",
  "music",
  "literature",
  "poetry",
  "story",
  "novel",
  "play",
  "movie",
  "film",
  "television",
  "radio",
  "newspaper",
  "magazine",
  "book",
  "library",
  "museum",
  "gallery",
  "theater",
  "concert",
  "sport",
  "game",
  "competition",
  "team",
  "player",
  "coach",
  "referee",
  "fan",
  "stadium",
  "arena",
  "court",
  "field",
  "track",
  "pool",
  "gym",
  "exercise",
  "health",
  "fitness",
  "nutrition",
  "diet",
  "medicine",
  "hospital",
  "doctor",
  "nurse",
  "patient",
  "symptom",
  "diagnosis",
  "treatment",
  "recovery",
  "healing",
  "pain",
  "illness",
  "disease",
  "virus",
  "bacteria",
  "infection",
  "allergy",
  "therapy",
  "therapy",
  "psychology",
  "mind",
  "brain",
  "emotion",
  "feeling",
  "stress",
  "anxiety",
  "depression",
  "happiness",
  "sadness",
  "anger",
  "fear",
  "love",
  "hate",
  "joy",
  "grief",
  "peace",
  "calm",
  "excitement",
  "surprise",
  "shock",
  "confusio",
];
const ROUND_TIME = 60000; // 60 seconds
const GUESS_SCORE = 100;
const DRAW_SCORE_PER_GUESSER = 20;

// Helper to get room ID from socket
function getRoomIdFromSocket(socket) {
  const rooms = Array.from(socket.rooms);
  return rooms.find((room) => room !== socket.id); // Get the first room that isn't the user's own socket ID room
}

// Function to terminate a game room
function terminateGameRoom(roomId) {
  if (gameStates[roomId]) {
    clearTimeout(gameStates[roomId].roundTimer);
    delete gameStates[roomId];
  }
  if (activeGameRooms[roomId]) {
    // Notify all players in the room that the game is ending
    io.to(roomId).emit("game:terminated", roomId);
    // Disconnect sockets from the room if necessary or just remove from active rooms
    // For simplicity, we just remove from activeGameRooms here.
    // Sockets will remain in the room for chat, but game functionality stops.

    // Remove the room from all connected clients' available game rooms list
    io.emit("game:room_removed", roomId);

    delete activeGameRooms[roomId];
    console.log(`Game room ${roomId} terminated.`);
  }
}

// Function to start a new round
function startNewRound(roomId) {
  const room = activeGameRooms[roomId];
  const gameState = gameStates[roomId];

  if (!room || !gameState || room.players.length === 0) {
    console.log(
      `Cannot start new round for room ${roomId}. Room or game state invalid or no players.`
    );
    terminateGameRoom(roomId); // Terminate if no players or invalid state
    return;
  }

  // Clear previous round's drawing history and timer
  if (gameState.roundTimer) {
    clearTimeout(gameState.roundTimer);
  }
  gameState.drawingHistory = []; // Clear drawing history for the new round
  gameState.guesserIds = new Set(); // Reset guessers for the new round

  // Determine next drawer
  const nextDrawerIndex =
    (gameState.currentPlayerIndex + 1) % gameState.players.length;
  gameState.currentPlayerIndex = nextDrawerIndex;

  const drawerId = gameState.players[nextDrawerIndex];
  const drawerUser = users[drawerId];

  // If the next drawer is not found (e.g., disconnected), try the next one or end game
  if (!drawerUser) {
    console.log(`Could not find drawer user for id ${drawerId}, trying next.`);
    if (room.players.length > 1) {
      // Only try next if there are other players
      room.players.splice(nextDrawerIndex, 1); // Remove disconnected player from active players
      if (room.players.length === 0) {
        terminateGameRoom(roomId);
        return;
      }
      // Recalculate next drawer based on updated players array
      gameState.currentPlayerIndex = nextDrawerIndex % room.players.length;
      startNewRound(roomId); // Try starting a new round with the next player
      return;
    } else {
      console.log(`No more players left in room ${roomId}. Terminating game.`);
      terminateGameRoom(roomId);
      return;
    }
  }

  const word = GAME_WORDS[Math.floor(Math.random() * GAME_WORDS.length)];

  gameState.drawer = drawerUser;
  gameState.word = word;
  gameState.isRoundActive = true;

  io.to(roomId).emit("game:new_round", { roundTime: ROUND_TIME }); // Notify clients about new round and round time

  // Set a timeout for the round
  gameState.roundTimer = setTimeout(() => {
    io.to(roomId).emit("game:message", {
      type: "round_end",
      message: `Time's up! The word was '${word}'.`,
      word: word,
    });
    startNewRound(roomId);
  }, ROUND_TIME);

  io.to(roomId).emit("game:state", {
    drawer: drawerUser,
    isRoundActive: true,
    scores: gameState.scores,
    creatorId: room.creatorId,
    players: room.players,
    // When a new round starts, drawingHistory is empty, so no need to send it here initially.
  });

  // Only send the word to the drawer
  io.to(drawerUser.id).emit("game:your_word", word);
  console.log(
    `Room ${roomId}: New round started. Drawer: ${drawerUser.name}, Word: ${word}`
  );
}

// --- SOCKET.IO CONNECTIONS ---
io.on("connection", (socket) => {
  console.log("a user connected", socket.id);

  // --- User Management ---
  socket.on("user:set_profile", ({ nickname, age }) => {
    users[socket.id] = { id: socket.id, name: nickname, age: age };
    console.log(`User ${nickname} (${socket.id}) set profile.`);
    socket.emit("user:profile_set", users[socket.id]);
    io.emit("user:list_updated", Object.values(users)); // Update user list for everyone
  });

  socket.on("user:get_all", () => {
    socket.emit("user:list_updated", Object.values(users));
  });

  // --- Chat Messaging ---
  socket.on("chat:message", (msg) => {
    const user = users[socket.id];
    const roomId = getRoomIdFromSocket(socket); // Get the room the user is in

    if (!user) {
      socket.emit(
        "chat:error",
        "Profile not set. Please set your nickname and age."
      );
      return;
    }

    const messageId = randomUUID();
    const messageData = {
      id: messageId,
      user: { id: user.id, name: user.name, age: user.age },
      text: msg,
      timestamp: Date.now(),
      roomId: roomId,
    };

    messageSenders[messageId] = socket.id;

    if (roomId) {
      // Game-specific logic if in a game room
      const gameState = gameStates[roomId];
      if (
        gameState &&
        gameState.isRoundActive &&
        gameState.drawer.id !== socket.id
      ) {
        // If it's a game guess
        const normalizedGuess = msg.toLowerCase().trim();
        const normalizedWord = gameState.word.toLowerCase().trim();

        if (normalizedGuess === normalizedWord) {
          if (!gameState.guesserIds.has(socket.id)) {
            // Check if user has already guessed
            const guesser = users[socket.id];
            gameState.scores[guesser.id] =
              (gameState.scores[guesser.id] || 0) + GUESS_SCORE;
            gameState.guesserIds.add(socket.id); // Mark as guessed

            // Award points to the drawer
            gameState.scores[gameState.drawer.id] =
              (gameState.scores[gameState.drawer.id] || 0) +
              DRAW_SCORE_PER_GUESSER;

            io.to(roomId).emit("chat:message", {
              id: randomUUID(),
              user: { id: "system", name: "System" },
              text: `${guesser.name} guessed the word!`,
              timestamp: Date.now(),
              isSystem: true,
            });
            io.to(roomId).emit("game:state", { scores: gameState.scores }); // Update scores for everyone

            // Check if all players (except drawer) have guessed
            const playersInRoom = activeGameRooms[roomId].players.length;
            const guessedCount = gameState.guesserIds.size;
            if (guessedCount >= playersInRoom - 1) {
              // If all guessers found, end round
              io.to(roomId).emit("game:message", {
                type: "round_end",
                message: `Everyone guessed! The word was '${normalizedWord}'.`,
                word: normalizedWord,
              });
              startNewRound(roomId);
            }
          } else {
            // If user already guessed, send normal message
            io.to(roomId).emit("chat:message", messageData);
            chatHistory[roomId] = chatHistory[roomId] || [];
            chatHistory[roomId].push(messageData);
          }
        } else {
          // Normal chat message within game room
          io.to(roomId).emit("chat:message", messageData);
          chatHistory[roomId] = chatHistory[roomId] || [];
          chatHistory[roomId].push(messageData);
        }
      } else {
        // Normal chat message (not a guess or drawer typing)
        io.to(roomId).emit("chat:message", messageData);
        chatHistory[roomId] = chatHistory[roomId] || [];
        chatHistory[roomId].push(messageData);
      }
    } else {
      // Global chat or if user is not in a specific room
      io.emit("chat:message", messageData);
      chatHistory["global"] = chatHistory["global"] || [];
      chatHistory["global"].push(messageData);
    }
  });

  socket.on("chat:typing", (isTyping) => {
    const roomId = getRoomIdFromSocket(socket);
    const user = users[socket.id];
    if (roomId && user) {
      socket
        .to(roomId)
        .emit("chat:typing_status", { user: user.name, isTyping });
    }
  });

  socket.on("message:delete", (messageId) => {
    const senderId = messageSenders[messageId];
    if (senderId === socket.id) {
      // Find the message in chat history and remove it
      for (const room in chatHistory) {
        chatHistory[room] = chatHistory[room].filter(
          (msg) => msg.id !== messageId
        );
      }
      io.emit("message:deleted", messageId);
      delete messageSenders[messageId];
    }
  });

  // --- Room Management ---
  socket.on("room:create_game", ({ roomName }) => {
    const user = users[socket.id];
    if (!user) {
      socket.emit("chat:error", "Profile not set to create a game room.");
      return;
    }

    const roomId = `game-${randomUUID()}`;
    activeGameRooms[roomId] = {
      id: roomId,
      name: roomName,
      creatorName: user.name,
      creatorId: user.id,
      players: [], // Players will be added when they join the room
    };
    gameStates[roomId] = {
      drawer: null,
      word: "",
      scores: {}, // { userId: score }
      isRoundActive: false,
      players: [], // Array of player socket IDs in drawing order
      currentPlayerIndex: -1,
      roundTimer: null,
      drawingHistory: [], // Stores all drawn lines for the current round
      guesserIds: new Set(), // Track who has guessed the word in the current round
    };

    console.log(`Game room '${roomName}' created by ${user.name} (${roomId})`);
    io.emit("game:rooms_list_updated", Object.values(activeGameRooms)); // Notify all clients
    socket.emit("game:room_created", { roomId, roomName }); // Notify creator
  });

  socket.on("room:get_game_rooms", () => {
    socket.emit("game:rooms_list_updated", Object.values(activeGameRooms));
  });

  socket.on("room:join", (roomId) => {
    const user = users[socket.id];
    if (!user) {
      socket.emit(
        "chat:error",
        "Profile not set. Please set your nickname and age to join a room."
      );
      return;
    }

    const room = activeGameRooms[roomId];
    if (!room) {
      socket.emit("chat:error", "Game room not found.");
      return;
    }

    // Leave any previous room
    const currentRoomId = getRoomIdFromSocket(socket);
    if (currentRoomId && currentRoomId !== roomId) {
      socket.leave(currentRoomId);
      // Remove user from the player list of the previous game room if it exists
      if (activeGameRooms[currentRoomId]) {
        activeGameRooms[currentRoomId].players = activeGameRooms[
          currentRoomId
        ].players.filter((p) => p.id !== socket.id);
        io.to(currentRoomId).emit("game:state", {
          players: activeGameRooms[currentRoomId].players,
        });
        if (
          activeGameRooms[currentRoomId].players.length === 0 &&
          gameStates[currentRoomId] &&
          gameStates[currentRoomId].isRoundActive
        ) {
          terminateGameRoom(currentRoomId);
        }
      }
    }

    socket.join(roomId);
    socket.emit("room:joined", roomId);
    console.log(
      `${user.name} (${socket.id}) joined room ${room.name} (${roomId}).`
    );

    // Add player to the game room's player list if not already there
    if (!room.players.some((p) => p.id === socket.id)) {
      room.players.push(user);
    }

    // Initialize scores for new player if they don't exist
    if (!gameStates[roomId].scores[socket.id]) {
      gameStates[roomId].scores[socket.id] = 0;
    }

    // Send updated player list and game state to everyone in the room
    io.to(roomId).emit("game:state", {
      players: room.players,
      scores: gameStates[roomId].scores,
      creatorId: room.creatorId,
      drawer: gameStates[roomId].drawer, // Send current drawer if game is active
      isRoundActive: gameStates[roomId].isRoundActive,
      drawingHistory: gameStates[roomId].drawingHistory, // Send drawing history to new joiners
    });

    // Send chat history for the joined room
    const roomChatHistory = chatHistory[roomId] || [];
    socket.emit("chat:history", roomChatHistory);

    // Announce user joined
    io.to(roomId).emit("chat:message", {
      id: randomUUID(),
      user: { id: "system", name: "System" },
      text: `${user.name} has joined the room.`,
      timestamp: Date.now(),
      isSystem: true,
    });
  });

  socket.on("room:leave", (roomId) => {
    const user = users[socket.id];
    if (!user) return; // User not found, nothing to do

    socket.leave(roomId);
    console.log(`${user.name} (${socket.id}) left room ${roomId}.`);

    if (activeGameRooms[roomId]) {
      activeGameRooms[roomId].players = activeGameRooms[roomId].players.filter(
        (p) => p.id !== socket.id
      );
      io.to(roomId).emit("game:state", {
        players: activeGameRooms[roomId].players,
      }); // Update player list

      // If the drawer leaves, end the round and start a new one
      const gameState = gameStates[roomId];
      if (gameState && gameState.drawer && gameState.drawer.id === socket.id) {
        console.log(
          `Drawer ${user.name} left. Ending round and starting new one.`
        );
        io.to(roomId).emit("game:message", {
          type: "round_end",
          message: `${user.name} (drawer) left! The word was '${gameState.word}'. Starting new round...`,
          word: gameState.word,
        });
        startNewRound(roomId);
      }

      // If no players left in a game room, terminate it
      if (activeGameRooms[roomId].players.length === 0) {
        terminateGameRoom(roomId);
      } else {
        // If the creator leaves, reassign creator or terminate if no one left
        if (activeGameRooms[roomId].creatorId === socket.id) {
          if (activeGameRooms[roomId].players.length > 0) {
            const newCreator = activeGameRooms[roomId].players[0];
            activeGameRooms[roomId].creatorId = newCreator.id;
            activeGameRooms[roomId].creatorName = newCreator.name;
            io.to(roomId).emit("game:state", { creatorId: newCreator.id });
            io.to(roomId).emit("chat:message", {
              id: randomUUID(),
              user: { id: "system", name: "System" },
              text: `${user.name} left. ${newCreator.name} is now the room creator.`,
              timestamp: Date.now(),
              isSystem: true,
            });
          } else {
            terminateGameRoom(roomId);
          }
        }
      }
    }

    // Announce user left
    io.to(roomId).emit("chat:message", {
      id: randomUUID(),
      user: { id: "system", name: "System" },
      text: `${user.name} has left the room.`,
      timestamp: Date.now(),
      isSystem: true,
    });
  });

  // --- Game Controls ---
  socket.on("game:start", () => {
    const roomId = getRoomIdFromSocket(socket);
    const user = users[socket.id];

    if (!roomId || !activeGameRooms[roomId] || !gameStates[roomId]) {
      socket.emit(
        "chat:error",
        "Not in a valid game room or game state not found."
      );
      return;
    }

    if (activeGameRooms[roomId].creatorId !== socket.id) {
      socket.emit("chat:error", "Only the room creator can start the game.");
      return;
    }

    if (activeGameRooms[roomId].players.length < 2) {
      socket.emit("chat:error", "Need at least 2 players to start the game.");
      return;
    }

    const gameState = gameStates[roomId];
    if (gameState.isRoundActive) {
      socket.emit("chat:error", "Game is already active.");
      return;
    }

    // Initialize scores for all players in the room
    activeGameRooms[roomId].players.forEach((p) => {
      gameState.scores[p.id] = 0;
    });

    gameState.players = activeGameRooms[roomId].players.map((p) => p.id); // Set initial player order
    gameState.currentPlayerIndex = -1; // Will be incremented to 0 in startNewRound

    console.log(`Game started in room ${roomId}.`);
    io.to(roomId).emit("chat:message", {
      id: randomUUID(),
      user: { id: "system", name: "System" },
      text: `Game started by ${user.name}!`,
      timestamp: Date.now(),
      isSystem: true,
    });
    startNewRound(roomId);
  });

  socket.on("game:stop_game", () => {
    const roomId = getRoomIdFromSocket(socket);
    const user = users[socket.id];

    if (!roomId || !activeGameRooms[roomId] || !gameStates[roomId]) {
      socket.emit(
        "chat:error",
        "Not in a valid game room or game state not found."
      );
      return;
    }

    if (activeGameRooms[roomId].creatorId !== socket.id) {
      socket.emit("chat:error", "Only the room creator can stop the game.");
      return;
    }

    console.log(`Game in room ${roomId} stopped by ${user.name}.`);
    io.to(roomId).emit("chat:message", {
      id: randomUUID(),
      user: { id: "system", name: "System" },
      text: `Game stopped by ${user.name}. Final Scores:`,
      timestamp: Date.now(),
      isSystem: true,
    });

    // Send final scores before terminating
    const finalScores = gameStates[roomId] ? gameStates[roomId].scores : {};
    io.to(roomId).emit("game:final_scores", finalScores);

    // Now terminate the room
    terminateGameRoom(roomId);
  });

  // --- Drawing Events ---
  socket.on("game:draw", ({ x1, y1, x2, y2, color, lineWidth }) => {
    const roomId = getRoomIdFromSocket(socket);
    const gameState = gameStates[roomId];

    if (
      gameState &&
      gameState.isRoundActive &&
      gameState.drawer.id === socket.id
    ) {
      const lineData = { x1, y1, x2, y2, color, lineWidth };
      gameState.drawingHistory.push(lineData); // Save drawing for new players/sync
      socket.to(roomId).emit("game:drawing", lineData); // Broadcast to others in the room
    }
  });

  socket.on("game:clear_canvas", () => {
    const roomId = getRoomIdFromSocket(socket);
    const gameState = gameStates[roomId];
    if (
      gameState &&
      gameState.isRoundActive &&
      gameState.drawer.id === socket.id
    ) {
      gameState.drawingHistory = []; // Clear server-side history
      io.to(roomId).emit("game:canvas_cleared"); // Notify all clients
    }
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    console.log("user disconnected", socket.id);
    const user = users[socket.id];

    if (user) {
      // Remove user from all active game rooms they might be in
      for (const roomId in activeGameRooms) {
        const room = activeGameRooms[roomId];
        const gameState = gameStates[roomId];

        const initialPlayerCount = room.players.length;
        room.players = room.players.filter((p) => p.id !== socket.id);

        if (room.players.length !== initialPlayerCount) {
          // If user was in this room
          io.to(roomId).emit("game:state", { players: room.players }); // Update player list

          // If the disconnected user was the drawer, start a new round
          if (
            gameState &&
            gameState.drawer &&
            gameState.drawer.id === socket.id
          ) {
            console.log(
              `Drawer ${user.name} disconnected. Ending round and starting new one.`
            );
            io.to(roomId).emit("game:message", {
              type: "round_end",
              message: `${user.name} (drawer) disconnected! The word was '${gameState.word}'. Starting new round...`,
              word: gameState.word,
            });
            startNewRound(roomId);
          }

          // If the disconnected user was the room creator
          if (room.creatorId === socket.id) {
            if (room.players.length > 0) {
              const newCreator = room.players[0];
              room.creatorId = newCreator.id;
              room.creatorName = newCreator.name;
              io.to(roomId).emit("game:state", { creatorId: newCreator.id });
              io.to(roomId).emit("chat:message", {
                id: randomUUID(),
                user: { id: "system", name: "System" },
                text: `${user.name} disconnected. ${newCreator.name} is now the room creator.`,
                timestamp: Date.now(),
                isSystem: true,
              });
            } else {
              terminateGameRoom(roomId); // Terminate if no players left
            }
          }

          // If game room becomes empty after disconnect, terminate it
          if (room.players.length === 0) {
            terminateGameRoom(roomId);
          }

          io.to(roomId).emit("chat:message", {
            id: randomUUID(),
            user: { id: "system", name: "System" },
            text: `${user.name} has disconnected.`,
            timestamp: Date.now(),
            isSystem: true,
          });
        }
      }

      delete users[socket.id];
      io.emit("user:list_updated", Object.values(users)); // Update user list for everyone
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
