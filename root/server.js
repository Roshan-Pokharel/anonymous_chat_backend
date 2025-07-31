const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// --- STATE MANAGEMENT ---
const users = {}; // { socket.id: { id, name, gender, age } }
const games = {}; // { gameId: { ...gameState } }
const chatHistory = {}; // { roomName: [ { msg, timestamp } ] }
const messageSenders = {}; // { messageId: senderSocketId }
const userMessageTimestamps = {}; // { socketId: [timestamp1, ...] }

// --- CONSTANTS ---
const RATE_LIMIT_COUNT = 5;
const RATE_LIMIT_SECONDS = 5;
const WORD_LIST = [
  "house",
  "car",
  "tree",
  "sun",
  "dog",
  "cat",
  "computer",
  "javascript",
  "banana",
  "guitar",
  "ocean",
  "mountain",
  "star",
  "moon",
  "pizza",
  "bicycle",
  "flower",
  "bridge",
  "river",
  "cloud",
];

// --- GAME HELPER FUNCTIONS ---
function createNewGame(host, gameName) {
  const gameId = `game_${Date.now()}`;
  games[gameId] = {
    id: gameId,
    name: gameName,
    hostId: host.id,
    players: [],
    status: "waiting",
    currentRound: 0,
    maxRounds: 5,
    timer: 60,
    currentDrawerId: null,
    drawer: {},
    currentWord: "",
    wordToGuess: "",
    roundTimeout: null,
  };
  return games[gameId];
}
function joinGame(player, gameId) {
  const game = games[gameId];
  if (!game || game.players.length >= 10 || game.status !== "waiting")
    return null;
  if (!game.players.find((p) => p.id === player.id)) {
    game.players.push({ ...player, score: 0 });
  }
  return game;
}
function leaveGame(playerId) {
  for (const gameId in games) {
    const game = games[gameId];
    const playerIndex = game.players.findIndex((p) => p.id === playerId);
    if (playerIndex !== -1) {
      const [leftPlayer] = game.players.splice(playerIndex, 1);
      if (game.hostId === playerId && game.players.length > 0)
        game.hostId = game.players[0].id;
      if (game.currentDrawerId === playerId && game.status === "in-progress")
        endRound(gameId, "The drawer left the game.");
      if (game.players.length === 0) {
        clearTimeout(game.roundTimeout);
        delete games[gameId];
      }
      return { game, leftPlayer };
    }
  }
  return null;
}
function startRound(gameId) {
  const game = games[gameId];
  if (!game || game.players.length < 2) return;
  clearTimeout(game.roundTimeout);
  game.status = "in-progress";
  game.currentRound++;
  game.timer = 60;
  const lastDrawerIndex = game.players.findIndex(
    (p) => p.id === game.currentDrawerId
  );
  const newDrawerIndex = (lastDrawerIndex + 1) % game.players.length;
  game.drawer = game.players[newDrawerIndex];
  game.currentDrawerId = game.drawer.id;
  game.currentWord = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)];
  game.wordToGuess = "_ ".repeat(game.currentWord.length).trim();
  io.to(game.drawer.id).emit("game:state_update", {
    ...game,
    wordToGuess: game.currentWord,
  });
  game.roundTimeout = setInterval(() => {
    if (game.status !== "in-progress") return;
    game.timer--;
    if (game.timer <= 0) {
      endRound(gameId, `Time's up! The word was: ${game.currentWord}`);
    } else {
      io.to(game.id).emit("game:state_update", game);
    }
  }, 1000);
  io.to(gameId).emit("game:clear_canvas");
  io.to(gameId).emit("game:chat_message", {
    type: "system",
    message: `Round ${game.currentRound}! ${game.drawer.name} is drawing.`,
  });
  io.to(game.id).emit("game:state_update", game);
}
function endRound(gameId, reason) {
  const game = games[gameId];
  if (!game || game.status !== "in-progress") return;
  clearTimeout(game.roundTimeout);
  game.status = "round-over";
  io.to(gameId).emit("game:chat_message", { type: "system", message: reason });
  io.to(gameId).emit("game:state_update", game);

  if (game.currentRound >= game.maxRounds) {
    game.status = "game-over";
    io.to(gameId).emit("game:chat_message", {
      type: "system",
      message: "Game Over! Thanks for playing!",
    });
    io.to(gameId).emit("game:state_update", game);
    setTimeout(() => {
      delete games[gameId];
      io.emit("lobby:update", games);
    }, 10000);
  } else {
    setTimeout(() => startRound(gameId), 5000);
  }
}

// --- MAIN CONNECTION HANDLER ---
io.on("connection", (socket) => {
  console.log("🟢 User connected:", socket.id);
  userMessageTimestamps[socket.id] = [];

  socket.on("user:set_info", ({ nickname, gender, age }) => {
    users[socket.id] = { id: socket.id, name: nickname, gender, age };
    io.emit("user list", Object.values(users));
    socket.emit(
      "chat:history",
      chatHistory["public"] ? chatHistory["public"].map((e) => e.msg) : []
    );
  });

  // --- Chat Listeners ---
  socket.on("chat:join_room", (roomName) => {
    socket.join(roomName);
    socket.emit(
      "chat:history",
      chatHistory[roomName] ? chatHistory[roomName].map((e) => e.msg) : []
    );
  });
  socket.on("chat:message", ({ room, text }) => {
    const user = users[socket.id];
    if (!user) return;
    const now = Date.now();
    userMessageTimestamps[socket.id] = userMessageTimestamps[socket.id].filter(
      (t) => now - t < RATE_LIMIT_SECONDS * 1000
    );
    if (userMessageTimestamps[socket.id].length >= RATE_LIMIT_COUNT) {
      return socket.emit(
        "chat:rate_limit",
        "You are sending messages too quickly."
      );
    }
    userMessageTimestamps[socket.id].push(now);
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
    io.to(room).emit("chat:message", msg);
  });
  socket.on("chat:typing", ({ room }) => {
    if (users[socket.id])
      socket
        .to(room)
        .emit("chat:typing", { name: users[socket.id].name, room });
  });
  socket.on("chat:stop_typing", ({ room }) => {
    if (users[socket.id]) socket.to(room).emit("chat:stop_typing", { room });
  });
  socket.on("message read", ({ room, messageId }) => {
    const senderId = messageSenders[messageId];
    if (senderId)
      io.to(senderId).emit("chat:message_read", { room, messageId });
  });

  // --- Game Listeners ---
  socket.on("lobby:request_update", () => socket.emit("lobby:update", games));
  socket.on("lobby:create_game", ({ name }) => {
    const game = createNewGame(users[socket.id], name);
    socket.join(game.id);
    joinGame(users[socket.id], game.id);
    socket.emit("game:joined", game);
    io.emit("lobby:update", games);
  });
  socket.on("lobby:join_game", ({ gameId }) => {
    const game = joinGame(users[socket.id], gameId);
    if (game) {
      socket.join(gameId);
      socket.emit("game:joined", game);
      io.to(gameId).emit("game:state_update", game);
      io.to(gameId).emit("game:chat_message", {
        type: "system",
        message: `${users[socket.id].name} has joined!`,
      });
      io.emit("lobby:update", games);
    }
  });
  socket.on("game:leave", () => {
    const result = leaveGame(socket.id);
    if (result) {
      const { game, leftPlayer } = result;
      socket.leave(game.id);
      socket.emit("game:left");
      io.to(game.id).emit("game:state_update", game);
      io.to(game.id).emit("game:chat_message", {
        type: "system",
        message: `${leftPlayer.name} has left.`,
      });
      io.emit("lobby:update", games);
    }
  });
  socket.on("game:start", () => {
    const game = Object.values(games).find((g) => g.hostId === socket.id);
    if (game) startRound(game.id);
  });
  socket.on("game:draw", (data) => {
    const game = Object.values(games).find(
      (g) => g.currentDrawerId === socket.id
    );
    if (game) socket.to(game.id).emit("game:draw_event", data);
  });
  socket.on("game:clear_canvas", () => {
    const game = Object.values(games).find(
      (g) => g.currentDrawerId === socket.id
    );
    if (game) io.to(game.id).emit("game:clear_canvas");
  });
  socket.on("game:guess", ({ guess }) => {
    const game = Object.values(games).find((g) =>
      g.players.some((p) => p.id === socket.id)
    );
    const player = users[socket.id];
    if (
      !game ||
      !player ||
      game.currentDrawerId === socket.id ||
      game.status !== "in-progress"
    )
      return;
    io.to(game.id).emit("game:chat_message", {
      type: "guess",
      name: player.name,
      message: guess,
    });
    if (guess.toLowerCase() === game.currentWord.toLowerCase()) {
      const guesser = game.players.find((p) => p.id === socket.id);
      const drawer = game.players.find((p) => p.id === game.currentDrawerId);
      if (guesser) guesser.score += 10;
      if (drawer) drawer.score += 5;
      io.to(game.id).emit("game:chat_message", {
        type: "correct-guess",
        name: player.name,
      });
      endRound(game.id, `Round over! Next round starting soon...`);
    }
  });

  // --- Disconnect ---
  socket.on("disconnect", () => {
    console.log("🔴 User disconnected:", socket.id);
    const result = leaveGame(socket.id);
    if (result) {
      const { game, leftPlayer } = result;
      io.to(game.id).emit("game:state_update", game);
      io.to(game.id).emit("game:chat_message", {
        type: "system",
        message: `${leftPlayer.name} has disconnected.`,
      });
      io.emit("lobby:update", games);
    }
    delete users[socket.id];
    delete userMessageTimestamps[socket.id];
    io.emit("user list", Object.values(users));
  });
});

app.get("/", (req, res) => res.send("✅ Chat & Game Backend is running."));
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server is running on port ${PORT}`));
