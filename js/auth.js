/* Client-side demo only: passwords are stored as plain text in localStorage. */
(function () {
  "use strict";

  const USERS_KEY = "spendsmart.users";
  const SESSION_KEY = "spendsmart.session";
  const LOGOUT_KEY = "spendsmart.logout";
  const STORAGE_ERROR = "Your browser is blocking local storage, so accounts can't be saved.";
  const LOGIN_ERROR = "Incorrect email or password.";
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /** Reads one namespaced storage value without allowing browser storage errors to escape. */
  function readItem(storageName, key) {
    try {
      const storage = window[storageName];
      if (!storage) return { available: false, value: null };
      return { available: true, value: storage.getItem(key) };
    } catch (error) {
      return { available: false, value: null };
    }
  }

  /** Writes one storage value and reports whether the browser accepted it. */
  function writeItem(storageName, key, value) {
    try {
      const storage = window[storageName];
      if (!storage) return false;
      storage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  /** Removes one storage value without allowing browser storage errors to escape. */
  function removeItem(storageName, key) {
    try {
      const storage = window[storageName];
      if (!storage) return false;
      storage.removeItem(key);
      return true;
    } catch (error) {
      return false;
    }
  }

  /** Reads users safely, treating malformed JSON as an empty account list. */
  function readUsers() {
    const result = readItem("localStorage", USERS_KEY);
    if (!result.available) return { available: false, users: {} };
    if (result.value === null) return { available: true, users: {} };

    try {
      const parsed = JSON.parse(result.value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { available: true, users: parsed };
      }
    } catch (error) {
      // A corrupt account list should never prevent the page from loading.
    }
    return { available: true, users: {} };
  }

  /** Parses a stored session and rejects malformed values. */
  function parseSession(value) {
    if (!value) return null;
    try {
      const session = JSON.parse(value);
      if (!session || typeof session !== "object" || typeof session.name !== "string") return null;
      return session;
    } catch (error) {
      return null;
    }
  }

  /** Normalizes email addresses for every account lookup and write. */
  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  /** Saves every session persistently in localStorage. */
  function saveSession(session) {
    return writeItem("localStorage", SESSION_KEY, JSON.stringify(session));
  }

  /** Builds a normalized session record for an account. */
  function accountSession(user) {
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: "Student",
      guest: false,
      createdAt: new Date().toISOString()
    };
  }

  /** Validates and stores a new account with its plain-text password. */
  function signup({ name, email, password } = {}) {
    const cleanName = String(name || "").trim();
    const normalizedEmail = normalizeEmail(email);
    const cleanPassword = String(password || "");
    if (cleanName.length < 2 || cleanName.length > 50) {
      return { ok: false, field: "name", message: "Enter a name between 2 and 50 characters." };
    }
    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      return { ok: false, field: "email", message: "Please enter a valid email address." };
    }
    if (cleanPassword.length < 8 || !/[A-Za-z]/.test(cleanPassword) || !/[0-9]/.test(cleanPassword)) {
      return { ok: false, field: "password", message: "Use at least 8 characters, including a letter and a number." };
    }

    const result = readUsers();
    if (!result.available) return { ok: false, field: "form", message: STORAGE_ERROR };
    const existingUser = result.users[normalizedEmail];
    if (existingUser && typeof existingUser.password === "string") {
      return { ok: false, field: "email", message: "An account with this email already exists." };
    }

    const user = {
      id: existingUser && existingUser.id ? existingUser.id : createUserId(),
      name: cleanName,
      email: normalizedEmail,
      password: cleanPassword,
      createdAt: existingUser && existingUser.createdAt ? existingUser.createdAt : new Date().toISOString()
    };
    result.users[normalizedEmail] = user;
    if (!writeItem("localStorage", USERS_KEY, JSON.stringify(result.users))) {
      return { ok: false, field: "form", message: STORAGE_ERROR };
    }
    if (!saveSession(accountSession(user))) {
      return { ok: false, field: "form", message: STORAGE_ERROR };
    }
    return { ok: true };
  }

  /** Creates a compact unique identifier for a locally stored demo account. */
  function createUserId() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const bytes = new Uint8Array(12);
        window.crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch (error) {
      // Use the local fallback below if secure random generation is unavailable.
    }
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }

  /** Authenticates an account with one generic error for unknown emails and bad passwords. */
  function login({ email, password } = {}) {
    const normalizedEmail = normalizeEmail(email);
    const result = readUsers();
    if (!result.available) return { ok: false, field: "form", message: STORAGE_ERROR };
    const user = result.users[normalizedEmail];
    if (!user || typeof user !== "object" || typeof user.password !== "string") {
      return { ok: false, field: "form", message: LOGIN_ERROR };
    }

    if (String(password || "") !== user.password) return { ok: false, field: "form", message: LOGIN_ERROR };
    if (!saveSession(accountSession(user))) {
      return { ok: false, field: "form", message: STORAGE_ERROR };
    }
    return { ok: true };
  }

  /** Starts a persistent guest session without creating an account. */
  function loginAsGuest() {
    const session = {
      userId: null,
      email: "",
      name: "Guest",
      role: "Guest",
      guest: true,
      createdAt: new Date().toISOString()
    };
    if (!saveSession(session)) return { ok: false, field: "form", message: STORAGE_ERROR };
    return { ok: true };
  }

  /** Returns the current session from localStorage. */
  function getSession() {
    const stored = readItem("localStorage", SESSION_KEY);
    return stored.available ? parseSession(stored.value) : null;
  }

  /** Reports whether a valid account or guest session exists. */
  function isLoggedIn() {
    return Boolean(getSession());
  }

  /** Returns the current user/session object or null. */
  function currentUser() {
    return getSession();
  }

  /** Clears the local session and redirects to the requested login route. */
  function logout(redirectTarget) {
    removeItem("localStorage", SESSION_KEY);
    writeItem("localStorage", LOGOUT_KEY, `${Date.now()}-${Math.random()}`);
    window.location.replace(redirectTarget || "login.html");
  }

  /** Protects a page before its body is parsed. */
  function requireAuth() {
    if (isLoggedIn()) return true;
    window.location.replace("login.html");
    return false;
  }

  /** Sends signed-in users away from the login form. */
  function redirectIfLoggedIn() {
    if (!isLoggedIn()) return false;
    window.location.replace("index.html");
    return true;
  }

  /** Returns a namespaced data key for the current account or guest. */
  function userKey(name) {
    const session = getSession();
    return `spendsmart.data.${session && session.userId ? session.userId : "guest"}.${String(name || "")}`;
  }

  /** Closes a profile menu and optionally returns focus to its trigger. */
  function closeProfileMenu(wrapper, returnFocus) {
    const trigger = wrapper.querySelector(".user-chip");
    const menu = wrapper.querySelector(".profile-menu");
    if (!trigger || !menu || menu.hidden) return;
    menu.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (returnFocus) trigger.focus();
  }

  /** Initializes the accessible account dropdowns on protected pages. */
  function initializeProfileMenus(session) {
    document.querySelectorAll(".profile-menu-wrap").forEach((wrapper) => {
      const trigger = wrapper.querySelector(".user-chip");
      const menu = wrapper.querySelector(".profile-menu");
      if (!trigger || !menu || trigger.dataset.authMenuReady === "true") return;
      trigger.dataset.authMenuReady = "true";
      trigger.addEventListener("click", () => {
        const willOpen = menu.hidden;
        menu.hidden = !willOpen;
        trigger.setAttribute("aria-expanded", String(willOpen));
      });
      wrapper.querySelectorAll("[data-profile-logout]").forEach((button) => {
        button.addEventListener("click", () => logout());
      });
      wrapper.querySelectorAll("[data-profile-signup]").forEach((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          logout("login.html#signup");
        });
      });
      wrapper.querySelectorAll("[data-profile-menu-name]").forEach((node) => {
        node.textContent = session.name;
      });
      wrapper.querySelectorAll("[data-profile-menu-email]").forEach((node) => {
        node.textContent = session.guest ? "Guest session" : session.email || "";
      });
      wrapper.querySelectorAll("[data-profile-signup]").forEach((node) => {
        node.hidden = !session.guest;
      });
    });

    document.addEventListener("click", (event) => {
      document.querySelectorAll(".profile-menu-wrap").forEach((wrapper) => {
        if (!wrapper.contains(event.target)) closeProfileMenu(wrapper, false);
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      document.querySelectorAll(".profile-menu-wrap").forEach((wrapper) => {
        const menu = wrapper.querySelector(".profile-menu");
        if (menu && !menu.hidden) closeProfileMenu(wrapper, true);
      });
    });
  }

  /** Hydrates names, roles, avatars, and profile menus from the active session. */
  function hydrateUser() {
    const session = getSession();
    if (!session) return;
    const displayName = session.name || (session.guest ? "Guest" : "Student");
    const role = session.guest ? "Guest" : "Student";
    const avatarUrl = `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(displayName)}`;
    document.querySelectorAll("[data-user-name]").forEach((node) => {
      node.textContent = displayName;
    });
    document.querySelectorAll("[data-user-role]").forEach((node) => {
      node.textContent = role;
    });
    document.querySelectorAll("[data-user-avatar]").forEach((image) => {
      image.src = avatarUrl;
      image.alt = displayName;
    });
    document.querySelectorAll("[data-user-firstname]").forEach((node) => {
      node.textContent = displayName.trim().split(/\s+/)[0] || displayName;
    });
    initializeProfileMenus(session);
  }

  window.Auth = {
    signup,
    login,
    loginAsGuest,
    logout,
    getSession,
    isLoggedIn,
    currentUser,
    requireAuth,
    redirectIfLoggedIn,
    userKey,
    hydrateUser
  };

  window.addEventListener("storage", (event) => {
    if (event.key === LOGOUT_KEY && event.newValue) {
      removeItem("localStorage", SESSION_KEY);
      window.location.replace("login.html");
      return;
    }
    if (event.key === SESSION_KEY && event.newValue === null && !isLoggedIn()) {
      window.location.replace("login.html");
    }
  });

  document.addEventListener("DOMContentLoaded", hydrateUser, { once: true });
})();
