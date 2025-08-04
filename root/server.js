// CRITICAL: This URL MUST EXACTLY MATCH your Render backend URL.
// Ensure your backend is served over HTTPS.
const socket = io("https://anonymous-chat-backend-1.onrender.com");

// --- DOM Element Selectors ---
const form = document.getElementById("form");
const input = document.getElementById("input");
const messages = document.getElementById("messages");
const userList = document.getElementById("userList");
const roomTitle = document.getElementById("roomTitle");
const showUsersBtn = document.getElementById("showUsersBtn");
const themeToggleBtn = document.getElementById("theme-toggle");
const typingIndicator = document.getElementById("typing-indicator");
const errorMessage = document.getElementById("error-message");
const backgroundOptionsContainer = document.getElementById("backgroundOptions");
const connectedChatsList = document.getElementById("connectedChatsList");
const connectedChatsListMobile = document.getElementById(
  "connectedChatsListMobile"
);

// Modal elements
const userModal = document.getElementById("userModal");
const userForm = document.getElementById("userForm");
const nicknameInput = document.getElementById("nicknameInput");
const ageInput = document.getElementById("ageInput");
const allUsersModal = document.getElementById("allUsersModal");
const allUsersList = document.getElementById("allUsersList");
const createGameModal = document.getElementById("createGameModal");
const createGameForm = document.getElementById("createGameForm");
const roomNameInput = document.getElementById("roomNameInput");
const roomPasswordInput = document.getElementById("roomPasswordInput");
const cancelCreateGameBtn = document.getElementById("cancelCreateGameBtn");
const scoreboardModal = document.getElementById("scoreboardModal");
const scoreboardTitle = document.getElementById("scoreboardTitle");
const finalScores = document.getElementById("finalScores");
const closeScoreboardBtn = document.getElementById("closeScoreboardBtn");
const passwordPromptModal = document.getElementById("passwordPromptModal");
const passwordPromptForm = document.getElementById("passwordPromptForm");
const joinPasswordInput = document.getElementById("joinPasswordInput");
const cancelJoinBtn = document.getElementById("cancelJoinBtn");
const passwordError = document.getElementById("passwordError");

// Disconnect Modal Elements
const disconnectModal = document.getElementById("disconnectModal");
const cancelDisconnectBtn = document.getElementById("cancelDisconnectBtn");
const confirmDisconnectBtn = document.getElementById("confirmDisconnectBtn");

// How to Play Modal Elements
const howToPlayModal = document.getElementById("howToPlayModal");
const howToPlayTitle = document.getElementById("howToPlayTitle");
const howToPlayRules = document.getElementById("howToPlayRules");
const closeHowToPlayBtn = document.getElementById("closeHowToPlayBtn");
const howToPlayBtnDesktop = document.getElementById("howToPlayBtnDesktop");
const howToPlayBtnMobile = document.getElementById("howToPlayBtnMobile");

// Private Chat Request Modal Elements
const privateRequestModal = document.getElementById("privateRequestModal");
const privateRequestFrom = document.getElementById("privateRequestFrom");
const acceptRequestBtn = document.getElementById("acceptRequestBtn");
const declineRequestBtn = document.getElementById("declineRequestBtn");

// Call Modal Elements
const incomingCallModal = document.getElementById("incomingCallModal");
const incomingCallFrom = document.getElementById("incomingCallFrom");
const acceptCallBtn = document.getElementById("acceptCallBtn");
const declineCallBtn = document.getElementById("declineCallBtn");

// Mobile Modal Tab elements
const mobileModalNav = document.getElementById("mobileModalNav");
const mobileModalContent = document.getElementById("mobileModalContent");
const modalTabWrapper = document.querySelector(".modal-tab-wrapper");
const backgroundOptionsMobileContainer = document.getElementById(
  "backgroundOptionsMobile"
);

// Sidebar elements
const sidebarNav = document.getElementById("sidebar-nav");
const sidebarPanels = document.querySelectorAll(".sidebar-panel");

// Game Elements
const doodleGameContainer = document.getElementById("doodleGameContainer");
const gameCanvas = document.getElementById("gameCanvas");
const gameInfo = document.getElementById("gameInfo");
const gameTimer = document.getElementById("gameTimer");
const drawingTools = document.getElementById("drawingTools");
const clearCanvasBtn = document.getElementById("clearCanvasBtn");
const gameOverlayMessage = document.getElementById("gameOverlayMessage");
const createGameRoomBtnDesktop = document.getElementById(
  "createGameRoomBtnDesktop"
);
const createGameRoomBtnMobile = document.getElementById(
  "createGameRoomBtnMobile"
);
const gameRoomListDesktop = document.getElementById("gameRoomListDesktop");
const gameRoomListMobile = document.getElementById("gameRoomListMobile");
const startGameBtn = document.getElementById("startGameBtn");
const stopGameBtn = document.getElementById("stopGameBtn");
const startGameBtnMobile = document.getElementById("startGameBtnMobile");
const stopGameBtnMobile = document.getElementById("stopGameBtnMobile");

// Hangman Game Elements
const hangmanGameContainer = document.getElementById("hangmanGameContainer");
const hangmanTimer = document.getElementById("hangmanTimer");
const hangmanDrawing = document.getElementById("hangmanDrawing");
const hangmanWordDisplay = document.getElementById("hangmanWordDisplay");
const hangmanIncorrectLetters = document.getElementById(
  "hangmanIncorrectLetters"
);
const hangmanGameInfo = document.getElementById("hangmanGameInfo");

// Call & Audio Elements
const startCallBtn = document.getElementById("startCallBtn");
const endCallBtn = document.getElementById("endCallBtn");
const localAudio = document.getElementById("localAudio");
const remoteAudio = document.getElementById("remoteAudio");

// --- Application & Game State ---
let latestUsers = [];
let unreadPrivate = {};
let currentRoom = { id: "public", type: "public" };
let myId = null;
let isTyping = false;
let typingTimer;
const TYPING_TIMER_LENGTH = 1500;
let joiningRoomId = null;
const LOGIN_EXPIRATION_MS = 5 * 60 * 1000;
let pendingPrivateRequests = {};
let incomingPrivateRequest = null;
let recentlyDeclinedBy = {};
let connectedRooms = {};
let disconnectTarget = null;

// Canvas/Drawing State
const ctx = gameCanvas.getContext("2d");
let isDrawing = false;
let lastX = 0;
let lastY = 0;
let currentGameState = {};
let overlayTimer;
let currentDrawingHistory = [];
let roundCountdownInterval = null;
let hangmanCountdownInterval = null;

// --- WebRTC & Call State ---
let peerConnection;
let localStream;
let isCallActive = false;
let callPartnerId = null;
let incomingCallData = null;
let iceCandidateQueue = [];
let isNegotiating = false;

// --- WebRTC Configuration ---
const peerConnectionConfig = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

const predefinedBackgrounds = [
  "https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?q=80&w=1374&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=1575&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1511497584788-876760111969?q=80&w=1332&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1426604966848-d7adac402bff?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1433086966358-54859d0ed716?q=80&w=1374&auto=format&fit=crop",
];

// --- Initialization & Event Listeners (Unchanged) ---
window.addEventListener("load", () => {
  const savedTheme = localStorage.getItem("chatTheme") || "light";
  applyTheme(savedTheme);
  const savedBackground = localStorage.getItem("chatBackground");
  if (savedBackground) applyBackground(savedBackground);
  adjustHeightForKeyboard();
  populateBackgroundOptions(backgroundOptionsContainer);
  setupMobileModalSwipe();
});
window.addEventListener("resize", () => {
  adjustHeightForKeyboard();
  if (currentRoom.type === "doodle") {
    setupCanvas();
  }
});
input.addEventListener("input", () => {
  if (!isTyping) {
    isTyping = true;
    socket.emit("typing", { room: currentRoom.id });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    socket.emit("stop typing", { room: currentRoom.id });
  }, TYPING_TIMER_LENGTH);
});
themeToggleBtn.addEventListener("click", () => {
  const isDarkMode = document.body.classList.contains("dark-mode");
  const newTheme = isDarkMode ? "light" : "dark";
  applyTheme(newTheme);
  localStorage.setItem("chatTheme", newTheme);
});
form.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;

  clearTimeout(typingTimer);
  isTyping = false;
  socket.emit("stop typing", { room: currentRoom.id });

  if (
    currentGameState.gameType === "hangman" &&
    currentGameState.isRoundActive
  ) {
    socket.emit("hangman:guess", { room: currentRoom.id, letter: text });
  } else {
    socket.emit("chat message", { room: currentRoom.id, text: text });
  }

  input.value = "";
  setTimeout(() => input.focus(), 10);
});
showUsersBtn.onclick = () => {
  updateSideBar();
  populateBackgroundOptions(backgroundOptionsMobileContainer);
  allUsersModal.style.display = "flex";
  updateGameButtonVisibility(currentGameState);
};
allUsersModal.addEventListener("click", (e) => {
  if (e.target === allUsersModal) allUsersModal.style.display = "none";
});
scoreboardModal.addEventListener("click", (e) => {
  if (e.target === scoreboardModal) scoreboardModal.style.display = "none";
});
closeScoreboardBtn.onclick = () => (scoreboardModal.style.display = "none");
const mobileTabOrder = ["users", "game", "appearance"];
function switchMobileTab(tabName) {
  const tabIndex = mobileTabOrder.indexOf(tabName);
  if (tabIndex === -1) return;
  document
    .querySelectorAll(".modal-nav-btn")
    .forEach((btn) => btn.classList.remove("active"));
  document
    .querySelector(`.modal-nav-btn[data-tab="${tabName}"]`)
    .classList.add("active");
  modalTabWrapper.style.transform = `translateX(-${tabIndex * 100}%)`;
}
mobileModalNav.addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  switchMobileTab(e.target.dataset.tab);
});
function setupMobileModalSwipe() {
  let touchStartX = 0;
  let touchEndX = 0;
  const swipeThreshold = 50;
  mobileModalContent.addEventListener("touchstart", (e) => {
    if (e.target.closest(".modal-tab-viewport"))
      touchStartX = e.changedTouches[0].screenX;
  });
  mobileModalContent.addEventListener("touchend", (e) => {
    if (touchStartX === 0) return;
    touchEndX = e.changedTouches[0].screenX;
    handleSwipeGesture();
    touchStartX = 0;
  });
  function handleSwipeGesture() {
    const deltaX = touchEndX - touchStartX;
    if (Math.abs(deltaX) < swipeThreshold) return;
    const currentActiveBtn = document.querySelector(".modal-nav-btn.active");
    if (!currentActiveBtn) return;
    const currentIndex = mobileTabOrder.indexOf(currentActiveBtn.dataset.tab);
    if (deltaX < 0)
      switchMobileTab(
        mobileTabOrder[(currentIndex + 1) % mobileTabOrder.length]
      );
    else
      switchMobileTab(
        mobileTabOrder[
          (currentIndex - 1 + mobileTabOrder.length) % mobileTabOrder.length
        ]
      );
  }
}
sidebarNav.addEventListener("click", (e) => {
  if (e.target.tagName !== "BUTTON") return;
  const panelId = e.target.dataset.panel;
  document
    .querySelectorAll(".sidebar-nav-btn")
    .forEach((btn) => btn.classList.remove("active"));
  e.target.classList.add("active");
  sidebarPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.id === panelId);
  });
});

// --- Socket Event Handlers (Unchanged) ---
socket.on("connect", () => {
  myId = socket.id;
  console.log("✅ Connected to server with ID:", myId);
  checkForPersistedLogin();
});
socket.on("typing", ({ name, room }) => {
  if (room === currentRoom.id) {
    typingIndicator.textContent = `${name} is typing...`;
    typingIndicator.style.opacity = "1";
  }
});
socket.on("stop typing", ({ room }) => {
  if (room === currentRoom.id) {
    typingIndicator.textContent = "";
    typingIndicator.style.opacity = "0";
  }
});
socket.on("user list", (users) => {
  latestUsers = users;
  updateSideBar();
});
socket.on("room history", (msgs) => {
  messages.innerHTML = "";
  msgs.forEach(addMessage);
});
socket.on("rate limit", (msg) => displayError(msg));
socket.on("message was read", ({ room, messageId }) => {
  if (room === currentRoom.id) {
    const msgEl = document.querySelector(
      `.msg[data-message-id="${messageId}"] .read-receipt`
    );
    if (msgEl) {
      msgEl.textContent = "✓✓";
      msgEl.classList.add("read");
    }
  }
});
socket.on("chat message", (msg) => {
  if (msg.room === currentRoom.id) {
    typingIndicator.textContent = "";
    typingIndicator.style.opacity = "0";
    addMessage(msg);
    if (currentRoom.type === "private" && msg.room !== "public") {
      const otherId = msg.id === myId ? msg.to : msg.id;
      delete unreadPrivate[otherId];
      updateSideBar();
    }
  } else if (
    msg.room.includes("-") &&
    !msg.room.startsWith("game-") &&
    msg.to === myId
  ) {
    unreadPrivate[msg.id] = true;
    updateSideBar();
  }
});

// --- Core Functions & Private Chat (Unchanged) ---
function checkForPersistedLogin() {
  try {
    const storedUser = JSON.parse(localStorage.getItem("userInfo"));
    if (storedUser && Date.now() - storedUser.timestamp < LOGIN_EXPIRATION_MS) {
      socket.emit("user info", storedUser.data);
      userModal.style.display = "none";
      switchRoom("public", "🌐 Public Chat", "public");
    } else {
      localStorage.removeItem("userInfo");
      showUserModal();
    }
  } catch (error) {
    showUserModal();
  }
}
function showUserModal() {
  userModal.style.display = "flex";
  nicknameInput.focus();
  userForm.onsubmit = (e) => {
    e.preventDefault();
    const nickname = nicknameInput.value.trim();
    const gender = userForm.gender.value;
    const age = ageInput.value.trim();
    if (!nickname) {
      nicknameInput.focus();
      return;
    }
    if (!age || isNaN(age) || age < 18 || age > 99) {
      ageInput.focus();
      ageInput.style.borderColor = "var(--error-color)";
      return;
    }
    const userInfo = { nickname, gender, age };
    socket.emit("user info", userInfo);
    const dataToStore = { timestamp: Date.now(), data: userInfo };
    localStorage.setItem("userInfo", JSON.stringify(dataToStore));
    userModal.style.display = "none";
    switchRoom("public", "🌐 Public Chat", "public");
  };
}
function addMessage(msg, type = "") {
  const item = document.createElement("div");
  item.classList.add("msg");
  if (msg.messageId) {
    item.setAttribute("data-message-id", msg.messageId);
  }
  const isMe = msg.id && msg.id === myId;
  const isSystem =
    type === "system" ||
    msg.name === "System" ||
    msg.isGameEvent ||
    msg.isCallEvent ||
    msg.isPrivateChatEvent;
  if (isSystem) item.classList.add("system");
  else item.classList.add(isMe ? "me" : "other");
  const readReceiptHTML =
    isMe && currentRoom.type === "private"
      ? `<span class="read-receipt">${
          msg.status === "read" ? "✓✓" : "✓"
        }</span>`
      : "";
  const nameHTML = isSystem
    ? ""
    : `<span style="color:${getGenderColor(msg.gender)};">${
        msg.name
      }${getGenderSymbol(msg.gender)}${msg.age ? " · " + msg.age : ""}</span>`;
  const messageContent = isSystem
    ? `<strong>${msg.text}</strong>`
    : `${nameHTML}${msg.text}${readReceiptHTML}`;
  item.innerHTML = `<div class="bubble">${messageContent}</div>`;
  messages.appendChild(item);
  messages.scrollTop = messages.scrollHeight;
  if (!isMe && !isSystem && currentRoom.type === "private") {
    socket.emit("message read", {
      room: currentRoom.id,
      messageId: msg.messageId,
    });
  }
}
function updateSideBar() {
  updateConnectedChatsList(connectedChatsList);
  updateConnectedChatsList(connectedChatsListMobile);
  updateUserList(userList);
  updateUserList(allUsersList);
}
function updateConnectedChatsList(container) {
  if (!container) return;
  container.innerHTML = "";
  const rooms = Object.keys(connectedRooms);
  if (rooms.length === 0) {
    container.parentElement.style.display = "none";
    return;
  }
  container.parentElement.style.display = "block";
  rooms.forEach((roomId) => {
    const room = connectedRooms[roomId];
    const user = room.withUser;
    const div = document.createElement("div");
    div.className = "user connected-chat-item";
    div.dataset.userId = user.id;
    const avatarColor = generateColorFromId(user.id);
    const initial = user.name.charAt(0).toUpperCase();
    div.innerHTML = `
            <div class="user-avatar" style="background-color: ${avatarColor};">${initial}</div>
            <div class="user-info">
                <div class="user-name">${user.name}</div>
            </div>
            <button class="disconnect-btn" data-room-id="${roomId}">Connected</button>`;
    div.onclick = (e) => {
      if (e.target.classList.contains("disconnect-btn")) {
        showDisconnectConfirm(roomId);
      } else {
        switchRoom(roomId, `🔒 Chat with ${user.name}`, "private");
      }
    };
    container.appendChild(div);
  });
}
function updateUserList(container) {
  if (!container) return;
  container.innerHTML = "";
  const publicBtn = document.createElement("div");
  publicBtn.className = "user public-room";
  publicBtn.innerHTML = `🌐 Public Room`;
  publicBtn.onclick = () => {
    switchRoom("public", "🌐 Public Chat", "public");
    if (allUsersModal.style.display === "flex") {
      allUsersModal.style.display = "none";
    }
  };
  container.appendChild(publicBtn);
  latestUsers.forEach((user) => {
    if (user.id === myId) return;
    const privateRoomId = [myId, user.id].sort().join("-");
    if (connectedRooms[privateRoomId]) return;
    const div = document.createElement("div");
    div.className = "user";
    div.dataset.userId = user.id;
    if (pendingPrivateRequests[user.id]) {
      div.classList.add("pending");
    }
    if (recentlyDeclinedBy[user.id]) {
      div.classList.add("declined");
    }
    div.onclick = () => {
      if (div.classList.contains("declined")) {
        displayError(
          `${user.name} declined your last request. They must initiate the next chat.`
        );
        return;
      }
      if (div.classList.contains("pending")) {
        displayError("A private chat request is already pending.");
        return;
      }
      initiatePrivateChat(user);
    };
    const avatarColor = generateColorFromId(user.id);
    const initial = user.name.charAt(0).toUpperCase();
    div.innerHTML = `
          <div class="user-avatar" style="background-color: ${avatarColor};">${initial}</div>
          <div class="user-info">
            <div class="user-name" style="color:${getGenderColor(
              user.gender
            )};">${user.name}</div>
            <div class="user-details">
              <span class="status-dot"></span>
              <span>Online ${getGenderSymbol(user.gender)}${
      user.age ? " · " + user.age : ""
    }</span>
            </div>
          </div>
          ${unreadPrivate[user.id] ? '<span class="red-dot"></span>' : ""}`;
    container.appendChild(div);
  });
}
function switchRoom(roomId, title, roomType) {
  if (isCallActive) {
    displayError("Please end the current call before switching rooms.");
    return;
  }
  if (currentRoom.id === roomId) return;
  if (currentRoom.id && currentRoom.id.startsWith("game-")) {
    socket.emit("game:leave", currentRoom.id);
    endGame();
  }
  currentRoom = { id: roomId, type: roomType };
  roomTitle.textContent = title;
  messages.innerHTML = "";
  typingIndicator.textContent = "";
  typingIndicator.style.opacity = "0";
  updateCallButtonVisibility();
  updateSideBar();
  if (roomType === "doodle" || roomType === "hangman") {
    socket.emit("join room", roomId);
    showGameContainer(roomType);
    if (roomType === "doodle") {
      setTimeout(setupCanvas, 50);
    }
  } else {
    socket.emit("join room", roomId);
    endGame();
  }
  updateGameButtonVisibility({});
}
function generateColorFromId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return `hsl(${hash % 360}, 70%, 50%)`;
}
function getGenderSymbol(gender) {
  return gender === "female" ? "♀" : "♂";
}
function getGenderColor(gender) {
  return gender === "female" ? "#e75480" : "#3b82f6";
}
function adjustHeightForKeyboard() {
  if (window.innerWidth <= 768) {
    document.documentElement.style.setProperty(
      "--vh",
      `${window.innerHeight * 0.01}px`
    );
  }
}
function displayError(msg) {
  errorMessage.textContent = msg;
  errorMessage.style.opacity = "1";
  setTimeout(() => {
    errorMessage.textContent = "";
    errorMessage.style.opacity = "0";
  }, 3000);
}
function applyTheme(theme) {
  if (theme === "dark") {
    document.body.classList.add("dark-mode");
    themeToggleBtn.textContent = "☀️";
  } else {
    document.body.classList.remove("dark-mode");
    themeToggleBtn.textContent = "🌙";
  }
  if (currentRoom.type === "doodle") {
    redrawFromHistory();
  }
}
function applyBackground(url) {
  if (url) {
    messages.style.backgroundImage = `url(${url})`;
    messages.classList.add("has-background");
    localStorage.setItem("chatBackground", url);
  } else {
    messages.style.backgroundImage = "none";
    messages.classList.remove("has-background");
    localStorage.removeItem("chatBackground");
  }
}
function populateBackgroundOptions(container) {
  if (!container) return;
  container.innerHTML = "";
  const defaultOption = document.createElement("div");
  defaultOption.className = "background-option background-option-default";
  defaultOption.innerHTML = "<span>Default</span>";
  defaultOption.onclick = () => applyBackground(null);
  container.appendChild(defaultOption);
  predefinedBackgrounds.forEach((url) => {
    const option = document.createElement("div");
    option.className = "background-option";
    option.style.backgroundImage = `url(${url})`;
    option.onclick = () => applyBackground(url);
    container.appendChild(option);
  });
}
function initiatePrivateChat(targetUser) {
  if (recentlyDeclinedBy[targetUser.id]) {
    displayError(
      `${targetUser.name} declined your last request. They must initiate the next chat.`
    );
    return;
  }
  if (pendingPrivateRequests[targetUser.id]) {
    displayError("You have already sent a request to this user.");
    return;
  }
  socket.emit("private:initiate", { targetId: targetUser.id });
  pendingPrivateRequests[targetUser.id] = true;
  updateSideBar();
  showGameOverlayMessage(
    `Requesting to chat with ${targetUser.name}...`,
    2000,
    "system"
  );
}
socket.on("private:request_incoming", ({ fromUser }) => {
  if (
    isCallActive ||
    privateRequestModal.style.display === "flex" ||
    incomingCallModal.style.display === "flex"
  ) {
    socket.emit("private:decline", {
      requesterId: fromUser.id,
      reason: "busy",
    });
    return;
  }
  incomingPrivateRequest = fromUser;
  privateRequestFrom.textContent = `${fromUser.name} wants to chat privately.`;
  privateRequestModal.style.display = "flex";
});
socket.on("private:request_accepted", ({ room, withUser }) => {
  delete pendingPrivateRequests[withUser.id];
  delete recentlyDeclinedBy[withUser.id];
  privateRequestModal.style.display = "none";
  incomingPrivateRequest = null;
  if (allUsersModal.style.display === "flex") {
    allUsersModal.style.display = "none";
  }
  connectedRooms[room.id] = { withUser };
  switchRoom(room.id, `🔒 Chat with ${withUser.name}`, "private");
  showGameOverlayMessage(
    `You are now chatting privately with ${withUser.name}.`,
    2000,
    "system"
  );
});
socket.on("private:request_declined", ({ byUser, reason }) => {
  delete pendingPrivateRequests[byUser.id];
  recentlyDeclinedBy[byUser.id] = true;
  let message = `${byUser.name} declined your chat request.`;
  if (reason === "busy") {
    message = `${byUser.name} is busy and cannot chat right now.`;
  } else if (reason === "offline") {
    message = `Your chat request to ${byUser.name} was cancelled as they went offline.`;
  }
  showGameOverlayMessage(message, 2000, "system");
  updateSideBar();
});
socket.on("private:request_error", (errorMsg) => {
  displayError(errorMsg);
  const targetId = Object.keys(pendingPrivateRequests)[0];
  if (targetId) {
    recentlyDeclinedBy[targetId] = true;
  }
  pendingPrivateRequests = {};
  updateSideBar();
});
acceptRequestBtn.addEventListener("click", () => {
  if (incomingPrivateRequest) {
    socket.emit("private:accept", { requesterId: incomingPrivateRequest.id });
    privateRequestModal.style.display = "none";
    incomingPrivateRequest = null;
  }
});
declineRequestBtn.addEventListener("click", () => {
  if (incomingPrivateRequest) {
    socket.emit("private:decline", {
      requesterId: incomingPrivateRequest.id,
      reason: "declined",
    });
    privateRequestModal.style.display = "none";
    incomingPrivateRequest = null;
  }
});
function showDisconnectConfirm(roomId) {
  disconnectTarget = roomId;
  disconnectModal.style.display = "flex";
}
cancelDisconnectBtn.addEventListener("click", () => {
  disconnectModal.style.display = "none";
  disconnectTarget = null;
});
confirmDisconnectBtn.addEventListener("click", () => {
  if (disconnectTarget) {
    socket.emit("private:leave", { room: disconnectTarget });
    delete connectedRooms[disconnectTarget];
    if (currentRoom.id === disconnectTarget) {
      switchRoom("public", "🌐 Public Chat", "public");
    }
    updateSideBar();
  }
  disconnectModal.style.display = "none";
  disconnectTarget = null;
});
socket.on("private:partner_left", ({ room, partnerName }) => {
  if (connectedRooms[room]) {
    if (currentRoom.id === room) {
      showGameOverlayMessage(
        `${partnerName} has left the private chat.`,
        2000,
        "system"
      );
      switchRoom("public", "🌐 Public Chat", "public");
    }
    delete connectedRooms[room];
    updateSideBar();
  }
});

// --- Game Logic (Unchanged) ---
const openHowToPlayModal = () => {
  const gameType = currentGameState.gameType || "doodle";
  howToPlayTitle.textContent =
    gameType === "doodle"
      ? "✏️ How to Play Doodle Dash"
      : "🤔 How to Play Hangman";
  howToPlayRules.innerHTML =
    gameType === "doodle"
      ? `
        <ul>
          <li>One player is the 'Drawer' and is given a secret word to draw.</li>
          <li>Other players are 'Guessers' and must guess the word by typing in the chat.</li>
          <li>A correct guess wins 2 points for the guesser and 1 point for the drawer.</li>
          <li>The first player to reach 10 points is the champion!</li>
        </ul>
    `
      : `
        <ul>
          <li>This is a 2-player game. Players take turns guessing letters.</li>
          <li>Each player has <strong>20 seconds</strong> to make a guess. If time runs out, it counts as an incorrect guess.</li>
          <li>If you guess a correct letter, you get to guess again.</li>
          <li>If you guess an incorrect letter, your turn ends and the other player gets to guess.</li>
          <li>The player who correctly guesses the final letter to complete the word wins the round!</li>
        </ul>
    `;
  howToPlayModal.style.display = "flex";
};
howToPlayBtnDesktop.addEventListener("click", openHowToPlayModal);
howToPlayBtnMobile.addEventListener("click", openHowToPlayModal);
closeHowToPlayBtn.addEventListener(
  "click",
  () => (howToPlayModal.style.display = "none")
);
howToPlayModal.addEventListener("click", (e) => {
  if (e.target === howToPlayModal) howToPlayModal.style.display = "none";
});
function showGameOverlayMessage(text, duration = 2500, type = "info") {
  if (!gameOverlayMessage) return;
  gameOverlayMessage.textContent = text;
  gameOverlayMessage.className = "game-overlay-message";
  if (type === "system") {
    gameOverlayMessage.classList.add("system-overlay");
  } else if (type === "success") {
    gameOverlayMessage.classList.add("success-overlay");
  }
  gameOverlayMessage.classList.add("visible");
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => {
    gameOverlayMessage.classList.remove("visible");
  }, duration);
}
function updateRoundTimer(endTime) {
  clearInterval(roundCountdownInterval);
  if (!endTime) {
    gameTimer.style.display = "none";
    return;
  }
  gameTimer.style.display = "block";
  const update = () => {
    const timeLeft = Math.round((endTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
      gameTimer.textContent = "0";
      clearInterval(roundCountdownInterval);
    } else {
      gameTimer.textContent = timeLeft;
    }
  };
  update();
  roundCountdownInterval = setInterval(update, 1000);
}
function updateHangmanTimer(endTime) {
  clearInterval(hangmanCountdownInterval);
  if (!endTime) {
    hangmanTimer.style.display = "none";
    return;
  }
  hangmanTimer.style.display = "block";
  const update = () => {
    const timeLeft = Math.round((endTime - Date.now()) / 1000);
    if (timeLeft <= 0) {
      hangmanTimer.textContent = "0";
      clearInterval(hangmanCountdownInterval);
    } else {
      hangmanTimer.textContent = timeLeft;
    }
  };
  update();
  hangmanCountdownInterval = setInterval(update, 1000);
}
socket.on("game:roomsList", updateGameRoomList);
socket.on("game:joined", (roomData) => {
  if (passwordPromptModal.style.display === "flex")
    passwordPromptModal.style.display = "none";
  switchRoom(roomData.id, `🎮 ${roomData.name}`, roomData.gameType);
  if (allUsersModal.style.display === "flex")
    allUsersModal.style.display = "none";
});
socket.on("game:join_error", (message) => {
  if (passwordPromptModal.style.display === "flex") {
    passwordError.textContent = message;
    passwordError.style.display = "block";
    joinPasswordInput.focus();
  } else {
    displayError(message);
  }
});
socket.on("game:state", (state) => {
  currentGameState = state;
  showGameContainer(state.gameType);
  updateGameButtonVisibility(state);
  if (state.gameType === "doodle") {
    renderDoodleState(state);
  } else if (state.gameType === "hangman") {
    renderHangmanState(state);
  }
});
socket.on("game:word_prompt", (word) =>
  showGameOverlayMessage(`Draw: ${word}`, 4000)
);
socket.on("game:message", (text) => showGameOverlayMessage(text));
socket.on("game:new_round", () => {
  if (currentGameState.gameType === "doodle") {
    currentDrawingHistory = [];
    ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  }
  showGameOverlayMessage("New Round!", 2000);
});
socket.on("game:correct_guess", ({ guesser, word }) => {
  showGameOverlayMessage(`✅ ${guesser.name} guessed it!`, 3000, "success");
  addMessage(
    {
      text: `${guesser.name} guessed the word! It was "${word}".`,
      isGameEvent: true,
    },
    "system"
  );
});
socket.on("game:end", (text) => {
  addMessage({ text, isGameEvent: true }, "system");
  endGame(false);
  updateGameButtonVisibility({ ...currentGameState, isRoundActive: false });
});
socket.on("game:over", ({ winner, scores }) => {
  showGameOverlayMessage(`🎉 ${winner.name} wins the game!`, 4000);
  showScoreboard(winner, scores);
  endGame(true);
});
socket.on("game:terminated", (message) => {
  showGameOverlayMessage(message, 3000);
  endGame();
  switchRoom("public", "🌐 Public Chat", "public");
});
socket.on("game:draw", (data) => {
  currentDrawingHistory.push(data);
  const { x0, y0, x1, y1 } = data;
  const w = gameCanvas.clientWidth;
  const h = gameCanvas.clientHeight;
  if (w === 0 || h === 0) return;
  drawLine(x0 * w, y0 * h, x1 * w, y1 * h, false);
});
socket.on("game:drawing_history", (history) => {
  currentDrawingHistory = history;
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  redrawFromHistory();
});
socket.on("game:clear_canvas", () => {
  currentDrawingHistory = [];
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
});
function handleCreateGameRoom() {
  createGameModal.style.display = "flex";
  roomNameInput.focus();
}
createGameRoomBtnDesktop.addEventListener("click", handleCreateGameRoom);
createGameRoomBtnMobile.addEventListener("click", () => {
  if (allUsersModal.style.display === "flex")
    allUsersModal.style.display = "none";
  handleCreateGameRoom();
});
cancelCreateGameBtn.addEventListener(
  "click",
  () => (createGameModal.style.display = "none")
);
createGameForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const roomName = roomNameInput.value.trim();
  const password = roomPasswordInput.value.trim();
  const gameType = createGameForm.gameType.value;
  if (roomName) {
    socket.emit("game:create", { roomName, password, gameType });
    createGameModal.style.display = "none";
    roomNameInput.value = "";
    roomPasswordInput.value = "";
  }
});
passwordPromptForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const password = joinPasswordInput.value;
  if (joiningRoomId && password) {
    socket.emit("game:join", { roomId: joiningRoomId, password });
    joinPasswordInput.value = "";
  }
});
cancelJoinBtn.addEventListener("click", () => {
  passwordPromptModal.style.display = "none";
  joiningRoomId = null;
  joinPasswordInput.value = "";
  passwordError.style.display = "none";
});
function handleStartGame() {
  if (currentRoom.id.startsWith("game-"))
    socket.emit("game:start", currentRoom.id);
}
startGameBtn.addEventListener("click", handleStartGame);
startGameBtnMobile.addEventListener("click", handleStartGame);
function handleStopGame() {
  if (currentRoom.id.startsWith("game-"))
    socket.emit("game:stop", currentRoom.id);
}
stopGameBtn.addEventListener("click", handleStopGame);
stopGameBtnMobile.addEventListener("click", handleStopGame);
clearCanvasBtn.addEventListener("click", () => {
  currentDrawingHistory = [];
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  socket.emit("game:clear_canvas", currentRoom.id);
});
function updateGameButtonVisibility(state) {
  const isCreator = state && state.creatorId === myId;
  const isGameRoom = currentRoom.id && currentRoom.id.startsWith("game-");
  const isGameActive = state && state.isRoundActive;
  startGameBtn.style.display = "none";
  startGameBtnMobile.style.display = "none";
  stopGameBtn.style.display = "none";
  stopGameBtnMobile.style.display = "none";
  if (isGameRoom && isCreator) {
    if (isGameActive) {
      stopGameBtn.style.display = "block";
      stopGameBtnMobile.style.display = "block";
    } else {
      startGameBtn.style.display = "block";
      startGameBtnMobile.style.display = "block";
      let canStart = false;
      if (state.gameType === "hangman") {
        canStart = state.players && state.players.length === 2;
      } else {
        canStart = state.players && state.players.length >= 2;
      }
      startGameBtn.disabled = !canStart;
      startGameBtnMobile.disabled = !canStart;
      if (!canStart) {
        const minPlayers = state.gameType === "hangman" ? 2 : 2;
        const infoElem =
          state.gameType === "doodle" ? gameInfo : hangmanGameInfo;
        if (infoElem) {
          infoElem.textContent = `Waiting for ${minPlayers} players to start...`;
        }
      }
    }
  }
  startGameBtn.classList.toggle("btn-start", !startGameBtn.disabled);
  startGameBtnMobile.classList.toggle(
    "btn-start",
    !startGameBtnMobile.disabled
  );
  stopGameBtn.classList.add("btn-danger");
  stopGameBtnMobile.classList.add("btn-danger");
}
function updateGameRoomList(rooms) {
  const renderList = (container) => {
    if (!container) return;
    container.innerHTML = "";
    if (rooms.length === 0) {
      container.innerHTML = '<p class="no-rooms-msg">No active game rooms.</p>';
      return;
    }
    rooms.forEach((room) => {
      const item = document.createElement("div");
      item.className = "game-room-item";
      const lockIcon = room.hasPassword ? "🔒 " : "";
      const gameIcon = room.gameType === "doodle" ? "✏️" : "🤔";
      item.innerHTML = `<span title="${room.name} (by ${room.creatorName})">${gameIcon} ${lockIcon}${room.name} (${room.players.length}p)</span><button data-room-id="${room.id}">Join</button>`;
      const joinBtn = item.querySelector("button");
      if (
        room.inProgress ||
        (room.gameType === "hangman" && room.players.length >= 2)
      ) {
        joinBtn.disabled = true;
        joinBtn.textContent = room.inProgress ? "Active" : "Full";
      }
      joinBtn.onclick = () => {
        if (room.hasPassword) {
          joiningRoomId = room.id;
          passwordError.style.display = "none";
          passwordPromptModal.style.display = "flex";
          joinPasswordInput.focus();
        } else {
          socket.emit("game:join", { roomId: room.id });
        }
      };
      container.appendChild(item);
    });
  };
  renderList(gameRoomListDesktop);
  renderList(gameRoomListMobile);
}
function showScoreboard(winner, scores) {
  scoreboardTitle.innerHTML = `🏆 ${winner.name} Wins!`;
  finalScores.innerHTML = "<h3>Final Scores:</h3>";
  const scoreList = document.createElement("ul");
  const sortedPlayerIds = Object.keys(scores).sort(
    (a, b) => scores[b] - scores[a]
  );
  sortedPlayerIds.forEach((playerId) => {
    const user = latestUsers.find((u) => u.id === playerId) || {
      name: "A player",
      gender: "male",
    };
    const scoreItem = document.createElement("li");
    scoreItem.innerHTML = `<span class="score-name" style="color:${getGenderColor(
      user.gender
    )};">${user.name}${getGenderSymbol(
      user.gender
    )}</span><span class="score-points">${scores[playerId]} points</span>`;
    scoreList.appendChild(scoreItem);
  });
  finalScores.appendChild(scoreList);
  scoreboardModal.style.display = "flex";
}
function showGameContainer(gameType) {
  doodleGameContainer.style.display = gameType === "doodle" ? "flex" : "none";
  hangmanGameContainer.style.display = gameType === "hangman" ? "flex" : "none";
  input.placeholder =
    gameType === "hangman"
      ? "Guess a letter..."
      : "Type your message or guess...";
}
function endGame(hideContainers = true) {
  if (hideContainers) {
    doodleGameContainer.style.display = "none";
    hangmanGameContainer.style.display = "none";
  }
  if (gameInfo) gameInfo.textContent = "";
  if (drawingTools) drawingTools.style.display = "none";
  if (gameCanvas) gameCanvas.style.cursor = "default";
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  updateGameButtonVisibility({});
  updateRoundTimer(null);
  updateHangmanTimer(null);
  currentGameState = {};
  currentDrawingHistory = [];
  input.placeholder = "Type your message or guess...";
}
function renderDoodleState(state) {
  if (state.isRoundActive) {
    const isDrawer = state.drawer && state.drawer.id === myId;
    gameInfo.textContent = isDrawer
      ? "Your turn to draw!"
      : `${state.drawer.name} is drawing...`;
    drawingTools.style.display = isDrawer ? "flex" : "none";
    gameCanvas.style.cursor = isDrawer ? "crosshair" : "not-allowed";
    input.disabled = isDrawer;
    input.placeholder = isDrawer
      ? "You are drawing..."
      : "Type your guess here!";
    if (state.roundEndTime) updateRoundTimer(state.roundEndTime);
  } else {
    updateRoundTimer(null);
    input.disabled = false;
    input.placeholder = "Type your message...";
    if (state.creatorId === myId) {
      gameInfo.textContent = 'You are the host. Press "Start Game" when ready.';
    } else {
      const creator = latestUsers.find((u) => u.id === state.creatorId);
      gameInfo.textContent = `Waiting for ${
        creator ? creator.name : "the host"
      } to start the game.`;
    }
  }
}
function redrawFromHistory() {
  if (!ctx) return;
  ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
  ctx.strokeStyle = document.body.classList.contains("dark-mode")
    ? "#FFFFFF"
    : "#000000";
  const w = gameCanvas.clientWidth;
  const h = gameCanvas.clientHeight;
  if (w === 0 || h === 0) return;
  currentDrawingHistory.forEach((data) => {
    const { x0, y0, x1, y1 } = data;
    ctx.beginPath();
    ctx.moveTo(x0 * w, y0 * h);
    ctx.lineTo(x1 * w, y1 * h);
    ctx.stroke();
    ctx.closePath();
  });
}
function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = gameCanvas.getBoundingClientRect();
  gameCanvas.width = rect.width * dpr;
  gameCanvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.lineWidth = 5;
  redrawFromHistory();
}
function drawLine(x0, y0, x1, y1, emit = false) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = document.body.classList.contains("dark-mode")
    ? "#FFFFFF"
    : "#000000";
  ctx.stroke();
  ctx.closePath();
  if (!emit) return;
  const w = gameCanvas.clientWidth;
  const h = gameCanvas.clientHeight;
  if (w === 0 || h === 0) return;
  const drawData = { x0: x0 / w, y0: y0 / h, x1: x1 / w, y1: y1 / h };
  currentDrawingHistory.push(drawData);
  socket.emit("game:draw", { room: currentRoom.id, data: drawData });
}
function handleStart(e) {
  if (
    currentGameState.isRoundActive &&
    currentGameState.drawer &&
    currentGameState.drawer.id === myId
  ) {
    isDrawing = true;
    const pos = getMousePos(e);
    [lastX, lastY] = [pos.x, pos.y];
  }
}
function handleMove(e) {
  if (!isDrawing) return;
  e.preventDefault();
  const pos = getMousePos(e);
  drawLine(lastX, lastY, pos.x, pos.y, true);
  [lastX, lastY] = [pos.x, pos.y];
}
function handleEnd() {
  isDrawing = false;
}
function getMousePos(e) {
  const rect = gameCanvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}
gameCanvas.addEventListener("mousedown", handleStart);
gameCanvas.addEventListener("mousemove", handleMove);
gameCanvas.addEventListener("mouseup", handleEnd);
gameCanvas.addEventListener("mouseout", handleEnd);
gameCanvas.addEventListener("touchstart", handleStart);
gameCanvas.addEventListener("touchmove", handleMove);
gameCanvas.addEventListener("touchend", handleEnd);
function renderHangmanState(state) {
  if (!state || !hangmanGameContainer) return;
  if (state.isRoundActive && state.turnEndTime) {
    updateHangmanTimer(state.turnEndTime);
  } else {
    updateHangmanTimer(null);
  }
  const displayWord = state.displayWord || [];
  hangmanWordDisplay.innerHTML = displayWord
    .map(
      (letter) =>
        `<div class="letter-placeholder ${letter === " " ? "space" : ""}">${
          letter !== "_" ? letter.toUpperCase() : ""
        }</div>`
    )
    .join("");
  const incorrectGuesses = state.incorrectGuesses || [];
  hangmanIncorrectLetters.textContent = `Incorrect: ${incorrectGuesses
    .filter((g) => g.trim() !== "")
    .join(", ")
    .toUpperCase()}`;
  const incorrectCount = incorrectGuesses.length;
  hangmanDrawing.className = `incorrect-${incorrectCount}`;
  const isMyTurn = state.currentPlayerTurn === myId;
  if (state.isRoundActive) {
    input.disabled = !isMyTurn;
  } else {
    input.disabled = false;
  }
  if (state.isGameOver) {
    hangmanGameInfo.textContent = state.winner
      ? `🎉 ${state.winner.name} won!`
      : "😥 Game over!";
    input.placeholder = "Starting new round soon...";
  } else if (state.isRoundActive) {
    const currentPlayer = latestUsers.find(
      (u) => u.id === state.currentPlayerTurn
    );
    if (isMyTurn) {
      hangmanGameInfo.textContent = "Your turn to guess!";
      input.placeholder = "Guess a letter...";
    } else {
      hangmanGameInfo.textContent = `Waiting for ${
        currentPlayer ? currentPlayer.name : "other player"
      } to guess...`;
      input.placeholder = "Not your turn...";
    }
  } else {
    input.placeholder = "Type your message...";
    if (state.creatorId === myId) {
      hangmanGameInfo.textContent = 'Press "Start Game" when ready.';
    } else {
      const creator = latestUsers.find((u) => u.id === state.creatorId);
      hangmanGameInfo.textContent = `Waiting for ${
        creator ? creator.name : "the host"
      } to start the game.`;
    }
  }
}

// ===================================================================================
// --- 📞 AUDIO CALL (WEBRTC) - STABILITY FIX ---
// ===================================================================================

function updateCallButtonVisibility() {
  const isPrivateChat = currentRoom.type === "private";
  startCallBtn.style.display =
    isPrivateChat && !isCallActive ? "inline-block" : "none";
  endCallBtn.style.display = isCallActive ? "inline-block" : "none";
  const inGame =
    currentRoom.type === "doodle" || currentRoom.type === "hangman";
  if (isCallActive && isPrivateChat && !inGame) {
    input.placeholder = "Call in progress...";
    input.disabled = true;
  } else if (!inGame) {
    input.placeholder = "Type your message...";
    input.disabled = false;
  }
}

async function createPeerConnection() {
  console.log("⚡ Creating new RTCPeerConnection");
  peerConnection = new RTCPeerConnection(peerConnectionConfig);
  iceCandidateQueue = [];
  isNegotiating = false;

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && callPartnerId) {
      socket.emit("call:ice_candidate", {
        targetId: callPartnerId,
        candidate: event.candidate,
      });
    }
  };

  peerConnection.onconnectionstatechange = () => {
    console.log(
      `WebRTC Connection State Changed: %c${peerConnection.connectionState}`,
      "font-weight: bold;"
    );
    switch (peerConnection.connectionState) {
      case "connected":
        showGameOverlayMessage("✅ Call connected.", 2000, "success");
        break;
      case "disconnected":
        showGameOverlayMessage(
          "⚠️ Call disconnected, attempting to reconnect...",
          3000,
          "system"
        );
        break;
      case "failed":
        // *** CRITICAL FIX: DO NOT ATTEMPT TO RESTART ICE. CLEANLY END THE CALL. ***
        handleConnectionFailure();
        break;
      case "closed":
        endCall(false);
        break;
    }
  };

  peerConnection.onsignalingstatechange = () => {
    isNegotiating = peerConnection.signalingState !== "stable";
  };

  peerConnection.ontrack = (event) => {
    console.log("🎶 Received remote audio track.");
    if (event.streams && event.streams[0]) {
      remoteAudio.srcObject = event.streams[0];
      remoteAudio
        .play()
        .catch((error) => console.error("Remote audio play failed:", error));
    }
  };

  peerConnection.onnegotiationneeded = async () => {
    if (isNegotiating)
      return console.log(
        "Skipping negotiationneeded due to ongoing negotiation"
      );

    isNegotiating = true;
    try {
      console.log("🤝 Negotiation needed, creating offer...");
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit("call:offer", {
        targetId: callPartnerId,
        offer: peerConnection.localDescription,
      });
    } catch (err) {
      console.error("Error during negotiationneeded event:", err);
      displayError("An error occurred during call negotiation.");
      endCall(true);
    } finally {
      isNegotiating = false;
    }
  };

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, localStream);
    });
  }
}

/**
 * **FIX:** This function is called when the connection state becomes 'failed'.
 * Instead of trying a buggy ICE restart, it now cleanly ends the call,
 * preventing the "m-line" error and allowing users to try again reliably.
 */
function handleConnectionFailure() {
  displayError("Call connection failed.");
  showGameOverlayMessage("Call failed. Please try again.", 3000, "system");
  endCall(true); // Notify the other peer that the call has ended.
}

async function startCall() {
  if (isCallActive || currentRoom.type !== "private") return;

  const partnerInfo = connectedRooms[currentRoom.id]?.withUser;
  if (!partnerInfo) {
    return displayError("Could not find a user to call.");
  }

  callPartnerId = partnerInfo.id;
  isCallActive = true;
  updateCallButtonVisibility();
  showGameOverlayMessage(`📞 Calling ${partnerInfo.name}...`, 5000, "system");

  try {
    console.log("🎤 Requesting microphone permissions...");
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localAudio.srcObject = localStream;
    console.log("🎤 Permissions granted.");

    // Create PC, add track. This will automatically trigger `onnegotiationneeded`
    // to create and send the initial offer, which is the correct pattern.
    await createPeerConnection();
  } catch (err) {
    console.error("Error starting call:", err);
    displayError("Could not start call. Check microphone permissions.");
    endCall(false);
  }
}

function endCall(notifyPeer = true) {
  if (!isCallActive && !incomingCallData && !peerConnection) return;
  console.log(`☎️ Ending call. Notify peer: ${notifyPeer}`);

  if (notifyPeer && callPartnerId) {
    socket.emit("call:end");
  }

  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.ontrack = null;
    peerConnection.onnegotiationneeded = null;
    if (peerConnection.signalingState !== "closed") {
      peerConnection.close();
    }
    peerConnection = null;
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }

  remoteAudio.srcObject = null;
  localAudio.srcObject = null;

  isCallActive = false;
  callPartnerId = null;
  incomingCallData = null;
  isNegotiating = false;
  iceCandidateQueue = [];

  if (incomingCallModal.style.display === "flex") {
    incomingCallModal.style.display = "none";
  }

  showGameOverlayMessage("Call ended.", 2000, "system");
  updateCallButtonVisibility();
}

// --- REVISED AUDIO CALL SOCKET HANDLERS ---
socket.on("call:incoming", async ({ from, offer }) => {
  if (isCallActive || incomingCallData || peerConnection) {
    console.warn("Received call while busy. Notifying server.");
    socket.emit("call:decline", { targetId: from.id, reason: "busy" });
    return;
  }

  console.log(`📞 Incoming call from ${from.name}`);
  incomingCallData = { from, offer };
  incomingCallFrom.textContent = `${from.name} is calling`;
  incomingCallModal.style.display = "flex";
});

socket.on("call:busy", ({ from }) => {
  showGameOverlayMessage(`❌ ${from.name} is currently busy.`, 3000, "system");
  endCall(false);
});

socket.on("call:error", (message) => {
  displayError(message);
  endCall(false);
});

socket.on("call:answer_received", async ({ answer }) => {
  if (!peerConnection)
    return console.error("Received answer but no peer connection exists.");
  console.log("✅ Answer received from peer.");
  try {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );
    iceCandidateQueue.forEach((candidate) =>
      peerConnection.addIceCandidate(candidate)
    );
    iceCandidateQueue = [];
  } catch (err) {
    console.error("Error setting remote description for answer:", err);
  }
});

socket.on("call:ice_candidate_received", async ({ candidate }) => {
  if (!peerConnection) return;
  try {
    if (peerConnection.remoteDescription) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } else {
      iceCandidateQueue.push(candidate);
    }
  } catch (e) {
    /* Errors here can be noisy and are often non-fatal, so logging is omitted. */
  }
});

socket.on("call:declined", ({ from, reason }) => {
  let message = `❌ ${from.name || "User"} declined the call.`;
  if (reason === "busy")
    message = `❌ ${from.name || "User"} is busy on another call.`;
  showGameOverlayMessage(message, 3000, "system");
  endCall(false);
});

socket.on("call:ended", () => {
  showGameOverlayMessage("The other user has ended the call.", 2000, "system");
  endCall(false);
});

// --- AUDIO CALL EVENT LISTENERS ---
startCallBtn.addEventListener("click", startCall);
endCallBtn.addEventListener("click", () => endCall(true));

acceptCallBtn.addEventListener("click", async () => {
  if (!incomingCallData) return;

  const { from, offer } = incomingCallData;
  console.log(`✅ Accepting call from ${from.name}`);
  incomingCallModal.style.display = "none";

  const privateRoomId = [myId, from.id].sort().join("-");
  if (currentRoom.id !== privateRoomId) {
    switchRoom(privateRoomId, `🔒 Chat with ${from.name}`, "private");
  }

  callPartnerId = from.id;
  isCallActive = true;
  updateCallButtonVisibility();

  try {
    console.log("🎤 Requesting microphone permissions...");
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localAudio.srcObject = localStream;
    console.log("🎤 Permissions granted.");

    await createPeerConnection();

    console.log("Offer: Setting remote description.");
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

    console.log("Answer: Creating answer...");
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    console.log("Answer: Local description set.");

    socket.emit("call:answer", {
      targetId: from.id,
      answer: peerConnection.localDescription,
    });
  } catch (err) {
    console.error("Error accepting call:", err);
    displayError("Could not accept call. Check microphone permissions.");
    endCall(true);
  } finally {
    incomingCallData = null;
  }
});

declineCallBtn.addEventListener("click", () => {
  if (incomingCallData) {
    console.log(`❌ Declining call from ${incomingCallData.from.name}`);
    socket.emit("call:decline", {
      targetId: incomingCallData.from.id,
      reason: "declined",
    });
    incomingCallModal.style.display = "none";
    incomingCallData = null;
  }
});
