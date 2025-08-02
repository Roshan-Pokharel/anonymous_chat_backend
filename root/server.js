const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { randomUUID } = require("crypto");

const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: "*",
  methods: ["GET", "POST"],
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: corsOptions,
});

// --- STATE MANAGEMENT ---
const users = {};
const chatHistory = {};
const messageSenders = {};
const gameStates = {};
let activeGameRooms = {};

// --- GAME CONSTANTS ---
const DOODLE_WORDS = [
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
  "clock",
  "key",
  "boat",
  "book",
  "chair",
  "hat",
  "shoe",
  "glasses",
  "bicycle",
  "camera",
  "computer",
  "earth",
];
const HANGMAN_WORDS = [
  "javascript",
  "html",
  "css",
  "nodejs",
  "react",
  "angular",
  "vue",
  "typescript",
  "webpack",
  "babel",
  "mongodb",
  "express",
  "socketio",
  "python",
  "java",
  "ruby",
  "docker",
  "kubernetes",
  "developer",
  "programming",
  "algorithm",
  "database",
  "authentication",
  "framework",
  "library",
  "component",
  "interface",
  "repository",
];
const ROUND_TIME = 60 * 1000;
const WINNING_SCORE = 10;
const MAX_INCORRECT_GUESSES = 6;

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

function getPublicRoomList() {
  return Object.values(activeGameRooms).map((room) => ({
    id: room.id,
    name: room.name,
    creatorName: room.creatorName,
    players: room.players,
    hasPassword: !!room.password,
    inProgress: room.inProgress || false,
    gameType: room.gameType,
  }));
}

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
  const minPlayers = room.gameType === "doodle" ? 2 : 2;

  if (room.players.length < minPlayers) {
    if (gameState && gameState.isRoundActive) {
      if (gameState.roundTimer) clearTimeout(gameState.roundTimer);
      io.to(roomId).emit(
        "game:message",
        "Not enough players. The game has ended."
      );
    }
    delete activeGameRooms[roomId];
    delete gameStates[roomId];
  } else {
    if (room.creatorId === socketId) {
      room.creatorId = room.players[0].id;
      room.creatorName = room.players[0].name;
      io.to(roomId).emit(
        "game:message",
        `${room.creatorName} is the new host.`
      );
    }

    if (gameState && gameState.isRoundActive) {
      if (room.gameType === "doodle" && gameState.drawer.id === socketId) {
        io.to(roomId).emit(
          "game:message",
          "The drawer left. Starting a new round."
        );
        clearTimeout(gameState.roundTimer);
        startNewDoodleRound(roomId);
      } else if (
        room.gameType === "hangman" &&
        gameState.currentPlayerTurn === socketId
      ) {
        // Switch turn if the current player leaves
        gameState.currentPlayerIndex =
          gameState.currentPlayerIndex % room.players.length;
        gameState.currentPlayerTurn =
          room.players[gameState.currentPlayerIndex].id;
        io.to(roomId).emit(
          "game:message",
          "The current player left. Switching turns."
        );
      }
    }
    if (gameState) {
      io.to(roomId).emit("game:state", {
        ...gameState,
        players: room.players,
        creatorId: room.creatorId,
      });
    }
  }
  io.emit("game:roomsList", getPublicRoomList());
}

io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  socket.join("public");
  userMessageTimestamps[socket.id] = [];

  socket.on("user info", ({ nickname, gender, age }) => {
    if (
      typeof nickname !== "string" ||
      nickname.trim().length === 0 ||
      nickname.length > 20
    )
      return;
    users[socket.id] = { id: socket.id, name: nickname.trim(), gender, age };
    io.emit("user list", Object.values(users));
    socket.emit("game:roomsList", getPublicRoomList());
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
    userMessageTimestamps[socket.id] = (
      userMessageTimestamps[socket.id] || []
    ).filter((ts) => now - ts < RATE_LIMIT_SECONDS * 1000);
    if (userMessageTimestamps[socket.id].length >= RATE_LIMIT_COUNT) {
      socket.emit("rate limit", "You are sending messages too quickly.");
      return;
    }
    userMessageTimestamps[socket.id].push(now);

    const gameState = gameStates[room];
    const roomData = activeGameRooms[room];

    if (
      gameState &&
      gameState.isRoundActive &&
      roomData.gameType === "doodle"
    ) {
      handleDoodleGuess(socket, user, room, text, gameState);
      return;
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

  // --- GAME EVENTS ---
  socket.on("game:create", ({ roomName, password, gameType }) => {
    const user = users[socket.id];
    if (!user) return;
    const roomId = `game-${randomUUID()}`;
    const newRoom = {
      id: roomId,
      name: roomName || `${user.name}'s Room`,
      creatorId: socket.id,
      creatorName: user.name,
      players: [user],
      password: password || null,
      inProgress: false,
      gameType: gameType || "doodle",
    };
    activeGameRooms[roomId] = newRoom;
    socket.join(roomId);
    socket.emit("game:joined", newRoom);
    io.emit("game:roomsList", getPublicRoomList());
    io.to(roomId).emit("game:state", {
      gameType: newRoom.gameType,
      players: newRoom.players,
      creatorId: newRoom.creatorId,
      isRoundActive: false,
      scores: {},
    });
  });

  socket.on("game:join", ({ roomId, password }) => {
    const user = users[socket.id];
    const room = activeGameRooms[roomId];
    if (!user || !room) return;
    if (room.inProgress) {
      socket.emit("game:join_error", "This game is already in progress.");
      return;
    }
    if (room.password && room.password !== password) {
      socket.emit("game:join_error", "Incorrect password.");
      return;
    }
    if (room.players.some((p) => p.id === user.id)) return;
    if (room.gameType === "hangman" && room.players.length >= 2) {
      socket.emit(
        "game:join_error",
        "This Hangman room is full (2 players max)."
      );
      return;
    }

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
      ...gameState,
      gameType: room.gameType,
      players: room.players,
      creatorId: room.creatorId,
      isRoundActive: gameState.isRoundActive || false,
    });
    if (gameState.isRoundActive && gameState.drawingHistory) {
      socket.emit("game:drawing_history", gameState.drawingHistory);
    }
    io.emit("game:roomsList", getPublicRoomList());
  });

  socket.on("game:leave", (roomId) => {
    socket.leave(roomId);
    handlePlayerLeave(socket.id, roomId);
  });

  socket.on("game:start", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];
    if (!room || !user || user.id !== room.creatorId) return;

    const minPlayers = room.gameType === "doodle" ? 2 : 2;
    if (room.players.length < minPlayers) {
      socket.emit(
        "game:message",
        `You need exactly ${minPlayers} players to start Hangman.`
      );
      return;
    }

    room.inProgress = true;
    if (room.gameType === "doodle") {
      const initialScores = {};
      room.players.forEach((p) => (initialScores[p.id] = 0));
      gameStates[roomId] = {
        gameType: "doodle",
        players: room.players.map((p) => p.id),
        scores: initialScores,
        isRoundActive: false,
        creatorId: room.creatorId,
        currentPlayerIndex: -1,
        drawingHistory: [],
        usedWords: new Set(),
      };
      startNewDoodleRound(roomId);
    } else if (room.gameType === "hangman") {
      gameStates[roomId] = {
        gameType: "hangman",
        players: room.players.map((p) => p.id),
        isRoundActive: false,
        creatorId: room.creatorId,
      };
      startNewHangmanRound(roomId);
    }
    io.emit("game:roomsList", getPublicRoomList());
  });

  socket.on("game:stop", (roomId) => {
    const room = activeGameRooms[roomId];
    const user = users[socket.id];
    if (!room || !user || user.id !== room.creatorId) return;

    io.to(roomId).emit("game:terminated", "The host has terminated the game.");
    const socketsInRoom = io.sockets.adapter.rooms.get(roomId);
    if (socketsInRoom) {
      socketsInRoom.forEach((socketId) =>
        io.sockets.sockets.get(socketId).leave(roomId)
      );
    }
    delete activeGameRooms[roomId];
    delete gameStates[roomId];
    io.emit("game:roomsList", getPublicRoomList());
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

  socket.on("hangman:guess", ({ room, letter }) => {
    const user = users[socket.id];
    const gameState = gameStates[room];
    if (
      !user ||
      !gameState ||
      !gameState.isRoundActive ||
      gameState.gameType !== "hangman"
    )
      return;
    if (socket.id !== gameState.currentPlayerTurn) {
      socket.emit("rate limit", "It's not your turn to guess.");
      return;
    }

    handleHangmanGuess(socket, user, room, letter, gameState);
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
});

// --- DOODLE DASH LOGIC ---
function handleDoodleGuess(socket, user, room, text, gameState) {
  if (socket.id === gameState.drawer.id) {
    socket.emit("rate limit", "You cannot chat while drawing.");
    return;
  }
  if (text.trim().toLowerCase() === gameState.word.toLowerCase()) {
    clearTimeout(gameState.roundTimer);
    const drawerSocketId = gameState.drawer.id;

    gameState.scores[socket.id] = (gameState.scores[socket.id] || 0) + 2;
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
      io.to(room).emit("game:over", {
        winner: users[winnerId],
        scores: { ...gameState.scores },
      });
      delete activeGameRooms[room];
      delete gameStates[room];
      io.emit("game:roomsList", getPublicRoomList());
    } else {
      setTimeout(() => startNewDoodleRound(room), 3000);
    }
  } else {
    const msg = {
      id: user.id,
      name: user.name,
      gender: user.gender,
      age: user.age,
      text,
      room,
    };
    io.to(room).emit("chat message", msg);
  }
}

function startNewDoodleRound(roomId) {
  const gameState = gameStates[roomId];
  const room = activeGameRooms[roomId];
  if (!gameState || !room || room.players.length < 2) {
    if (room) room.inProgress = false;
    if (gameState) gameState.isRoundActive = false;
    io.to(roomId).emit("game:end", "Not enough players. Waiting for more...");
    io.to(roomId).emit("game:state", {
      gameType: "doodle",
      creatorId: room ? room.creatorId : null,
      players: room ? room.players : [],
      isRoundActive: false,
      scores: gameState ? gameState.scores : {},
    });
    io.emit("game:roomsList", getPublicRoomList());
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
    startNewDoodleRound(roomId);
    return;
  }

  let availableWords = DOODLE_WORDS.filter(
    (word) => !gameState.usedWords.has(word)
  );
  if (availableWords.length === 0) {
    gameState.usedWords.clear();
    availableWords = DOODLE_WORDS;
  }
  const word =
    availableWords[Math.floor(Math.random() * availableWords.length)];
  gameState.usedWords.add(word);

  gameState.drawer = drawerUser;
  gameState.word = word;
  gameState.isRoundActive = true;
  const roundEndTime = Date.now() + ROUND_TIME;
  gameState.roundEndTime = roundEndTime;

  io.to(roomId).emit("game:new_round");

  if (gameState.roundTimer) clearTimeout(gameState.roundTimer);
  gameState.roundTimer = setTimeout(() => {
    io.to(roomId).emit("game:message", `Time's up! The word was '${word}'.`);
    setTimeout(() => startNewDoodleRound(roomId), 3000);
  }, ROUND_TIME);

  io.to(roomId).emit("game:state", {
    gameType: "doodle",
    drawer: drawerUser,
    isRoundActive: true,
    scores: gameState.scores,
    creatorId: room.creatorId,
    players: room.players,
    roundEndTime: roundEndTime,
  });
  io.to(drawerId).emit("game:word_prompt", word);
}

// --- HANGMAN LOGIC ---
function startNewHangmanRound(roomId) {
  const gameState = gameStates[roomId];
  const room = activeGameRooms[roomId];
  if (!gameState || !room || room.players.length < 2) {
    if (room) room.inProgress = false;
    io.to(roomId).emit("game:end", "Not enough players. Game over.");
    io.emit("game:roomsList", getPublicRoomList());
    return;
  }

  const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
  gameState.word = word.toLowerCase();
  gameState.displayWord = word
    .split("")
    .map((char) => (char === " " ? " " : "_"));
  gameState.incorrectGuesses = [];
  gameState.correctGuesses = [];
  gameState.isRoundActive = true;
  gameState.isGameOver = false;
  gameState.currentPlayerIndex =
    gameState.currentPlayerIndex !== undefined
      ? (gameState.currentPlayerIndex + 1) % 2
      : 0;
  gameState.currentPlayerTurn = room.players[gameState.currentPlayerIndex].id;
  gameState.winner = null;

  io.to(roomId).emit("game:new_round");
  io.to(roomId).emit("game:state", {
    gameType: "hangman",
    ...gameState,
    players: room.players,
    creatorId: room.creatorId,
  });
}

function handleHangmanGuess(socket, user, room, letter, gameState) {
  const cleanedLetter = letter.trim().toLowerCase();
  if (cleanedLetter.length !== 1 || !/^[a-z]$/.test(cleanedLetter)) {
    socket.emit("rate limit", "Please guess a single letter.");
    return;
  }

  if (
    gameState.correctGuesses.includes(cleanedLetter) ||
    gameState.incorrectGuesses.includes(cleanedLetter)
  ) {
    socket.emit("rate limit", `You already guessed '${cleanedLetter}'.`);
    return;
  }

  const word = gameState.word;
  if (word.includes(cleanedLetter)) {
    gameState.correctGuesses.push(cleanedLetter);
    gameState.displayWord = word
      .split("")
      .map((char) =>
        gameState.correctGuesses.includes(char) || char === " " ? char : "_"
      );
    io.to(room).emit("chat message", {
      room,
      text: `${
        user.name
      } guessed a correct letter: ${cleanedLetter.toUpperCase()}`,
      name: "System",
    });
  } else {
    gameState.incorrectGuesses.push(cleanedLetter);
    io.to(room).emit("chat message", {
      room,
      text: `${
        user.name
      } guessed an incorrect letter: ${cleanedLetter.toUpperCase()}`,
      name: "System",
    });
    // Switch turns on incorrect guess
    gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % 2;
    gameState.currentPlayerTurn =
      activeGameRooms[room].players[gameState.currentPlayerIndex].id;
  }

  const won = !gameState.displayWord.includes("_");
  const lost = gameState.incorrectGuesses.length >= MAX_INCORRECT_GUESSES;

  if (won) {
    gameState.isRoundActive = false;
    gameState.isGameOver = true;
    gameState.winner = user;
    io.to(room).emit(
      "game:message",
      `🎉 ${user.name} won! The word was "${word}".`
    );
    setTimeout(() => startNewHangmanRound(room), 5000);
  } else if (lost) {
    gameState.isRoundActive = false;
    gameState.isGameOver = true;
    io.to(room).emit("game:message", `😥 Game over! The word was "${word}".`);
    setTimeout(() => startNewHangmanRound(room), 5000);
  }

  io.to(room).emit("game:state", { gameType: "hangman", ...gameState });
}

app.get("/", (req, res) => {
  res.send("✅ Anonymous Chat & Games Backend is running smoothly.");
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
