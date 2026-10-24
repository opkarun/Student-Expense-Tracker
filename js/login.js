(function () {
  "use strict";

  /** Initializes the login and sign-up form after its markup is available. */
  function initializeLoginForm() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const fields = {
      name: document.getElementById("fullName"),
      email: document.getElementById("email"),
      password: document.getElementById("password"),
      confirmPassword: document.getElementById("confirmPassword")
    };
    const errors = {
      name: document.getElementById("nameError"),
      email: document.getElementById("emailError"),
      password: document.getElementById("passwordError"),
      confirmPassword: document.getElementById("confirmPasswordError")
    };
    const formMessage = document.getElementById("formMessage");
    const formNotice = document.getElementById("formNotice");
    const loginButton = document.getElementById("loginBtn");
    const registerLink = document.getElementById("registerLink");
    const touched = new Set();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    /** Clears the form-level error and informational notice. */
    function clearMessages() {
      formMessage.hidden = true;
      formMessage.textContent = "";
      formNotice.hidden = true;
      formNotice.textContent = "";
    }

    /** Shows a form-level alert or status message. */
    function showMessage(node, message) {
      node.textContent = message;
      node.hidden = false;
    }

    /** Clears one field's accessible error state. */
    function clearFieldError(fieldName) {
      const field = fields[fieldName];
      const error = errors[fieldName];
      if (!field || !error) return;
      field.closest(".input-group").classList.remove("error");
      field.setAttribute("aria-invalid", "false");
      error.textContent = "";
    }

    /** Shows one field error, including the fixed duplicate-account action when needed. */
    function showFieldError(fieldName, message, duplicateAccount) {
      const field = fields[fieldName];
      const error = errors[fieldName];
      if (!field || !error) return;
      field.closest(".input-group").classList.add("error");
      field.setAttribute("aria-invalid", "true");
      if (duplicateAccount) {
        error.innerHTML = 'An account with this email already exists. <a href="#login" data-login-instead>Log in instead</a>';
      } else {
        error.textContent = message;
      }
    }

    /** Checks one field using the active form mode. */
    function validateField(fieldName) {
      const mode = form.dataset.mode;
      const value = fields[fieldName].value;
      if (fieldName === "name" && mode === "signup") {
        const name = value.trim();
        return name.length >= 2 && name.length <= 50 ? "" : "Enter a name between 2 and 50 characters.";
      }
      if (fieldName === "email") {
        return emailPattern.test(value.trim()) ? "" : "Please enter a valid email address.";
      }
      if (fieldName === "password") {
        if (mode === "login") return value.length ? "" : "Please enter your password.";
        return value.length >= 8 && /[A-Za-z]/.test(value) && /[0-9]/.test(value)
          ? ""
          : "Use at least 8 characters, including a letter and a number.";
      }
      if (fieldName === "confirmPassword" && mode === "signup") {
        return value && value === fields.password.value ? "" : "Passwords don't match.";
      }
      return "";
    }

    /** Validates the visible fields in keyboard order. */
    function validateForm() {
      const order = form.dataset.mode === "signup"
        ? ["name", "email", "password", "confirmPassword"]
        : ["email", "password"];
      const invalid = [];
      order.forEach((fieldName) => {
        touched.add(fieldName);
        const message = validateField(fieldName);
        if (message) {
          showFieldError(fieldName, message, false);
          invalid.push(fieldName);
        } else {
          clearFieldError(fieldName);
        }
      });
      return invalid;
    }

    /** Switches the shared card between login and sign-up modes. */
    function setMode(mode) {
      const signup = mode === "signup";
      form.dataset.mode = signup ? "signup" : "login";
      document.getElementById("formHeading").textContent = signup ? "Create your account" : "Welcome back";
      document.getElementById("formSubtext").textContent = signup
        ? "Start tracking your spending in minutes."
        : "Log in to keep track of your spending, effortlessly.";
      document.getElementById("btnLabel").textContent = signup ? "Create Account" : "Log In";
      document.getElementById("registerPrompt").textContent = signup
        ? "Already have an account? "
        : "Don't have an account? ";
      registerLink.textContent = signup ? "Log in" : "Register";
      registerLink.href = signup ? "#login" : "#signup";
      fields.password.autocomplete = signup ? "new-password" : "current-password";
      errors.password.textContent = signup
        ? "Use at least 8 characters, including a letter and a number."
        : "Please enter your password.";
      Object.keys(errors).forEach(clearFieldError);
      touched.clear();
      fields.password.value = "";
      fields.confirmPassword.value = "";
      fields.password.type = "password";
      fields.confirmPassword.type = "password";
      resetToggle(document.getElementById("togglePassword"), "Show password");
      resetToggle(document.getElementById("toggleConfirmPassword"), "Show confirm password");
      clearMessages();
      (signup ? fields.name : fields.email).focus();
    }

    /** Resets a password visibility control to its hidden state. */
    function resetToggle(button, label) {
      button.setAttribute("aria-label", label);
      button.setAttribute("aria-pressed", "false");
    }

    /** Toggles a password input and updates its accessible button state. */
    function bindPasswordToggle(buttonId, input, label) {
      const button = document.getElementById(buttonId);
      const toggle = () => {
        const showing = input.type === "password";
        input.type = showing ? "text" : "password";
        button.setAttribute("aria-label", `${showing ? "Hide" : "Show"} ${label}`);
        button.setAttribute("aria-pressed", String(showing));
      };
      button.addEventListener("pointerdown", toggle);
      button.addEventListener("click", (event) => {
        if (event.detail === 0) toggle();
      });
    }

    ["name", "email", "password", "confirmPassword"].forEach((fieldName) => {
      const field = fields[fieldName];
      if (!field) return;
      field.addEventListener("input", () => {
        if (touched.has(fieldName)) {
          const message = validateField(fieldName);
          if (message) showFieldError(fieldName, message, false);
          else clearFieldError(fieldName);
          if (fieldName === "password" && touched.has("confirmPassword") && form.dataset.mode === "signup") {
            const confirmMessage = validateField("confirmPassword");
            if (confirmMessage) showFieldError("confirmPassword", confirmMessage, false);
            else clearFieldError("confirmPassword");
          }
        }
      });
      field.addEventListener("blur", () => {
        touched.add(fieldName);
        if (fieldName === "name" && form.dataset.mode !== "signup") return;
        if (fieldName === "confirmPassword" && form.dataset.mode !== "signup") return;
        const message = validateField(fieldName);
        if (message) showFieldError(fieldName, message, false);
        else clearFieldError(fieldName);
      });
    });

    registerLink.addEventListener("pointerdown", () => {
      setMode(form.dataset.mode === "login" ? "signup" : "login");
    });
    registerLink.addEventListener("click", (event) => {
      event.preventDefault();
      if (event.detail === 0) setMode(form.dataset.mode === "login" ? "signup" : "login");
    });
    document.getElementById("emailError").addEventListener("click", (event) => {
      if (!event.target.closest("[data-login-instead]")) return;
      event.preventDefault();
      setMode("login");
    });

    document.querySelectorAll(".forgot-link").forEach((link) => {
      const showResetNotice = (event) => {
        event.preventDefault();
        showMessage(formNotice, "Password reset isn't available in this offline version. Create a new account or contact support.");
      };
      link.addEventListener("pointerdown", showResetNotice);
      link.addEventListener("click", (event) => {
        if (event.detail === 0) showResetNotice(event);
        else event.preventDefault();
      });
    });

    bindPasswordToggle("togglePassword", fields.password, "password");
    bindPasswordToggle("toggleConfirmPassword", fields.confirmPassword, "confirm password");

    const guestButton = document.getElementById("guestBtn");
    const startGuestSession = (event) => {
      event.preventDefault();
      const result = Auth.loginAsGuest();
      if (!result.ok) {
        showMessage(formMessage, result.message);
        return;
      }
      window.location.replace("guest-loading.html");
    };
    guestButton.addEventListener("pointerdown", startGuestSession);
    guestButton.addEventListener("click", (event) => {
      if (event.detail === 0) startGuestSession(event);
      else event.preventDefault();
    });

    form.querySelectorAll(".btn").forEach((button) => {
      button.addEventListener("pointerdown", (event) => {
        const bounds = button.getBoundingClientRect();
        button.style.setProperty("--ripple-x", `${event.clientX - bounds.left}px`);
        button.style.setProperty("--ripple-y", `${event.clientY - bounds.top}px`);
        button.classList.remove("rippling");
        void button.offsetWidth;
        button.classList.add("rippling");
      });
      button.addEventListener("animationend", (event) => {
        if (event.animationName === "ripple") button.classList.remove("rippling");
      });
      button.addEventListener("pointerup", () => {
        window.setTimeout(() => button.classList.remove("rippling"), 700);
      });
      button.addEventListener("pointercancel", () => button.classList.remove("rippling"));
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearMessages();
      const invalid = validateForm();
      if (invalid.length) {
        touched.add(invalid[0]);
        fields[invalid[0]].focus();
        return;
      }

      const mode = form.dataset.mode;
      const payload = {
        name: fields.name.value.trim(),
        email: fields.email.value.trim(),
        password: fields.password.value
      };
      const controls = Array.from(form.querySelectorAll("input, .toggle-password"));
      loginButton.classList.add("is-loading");
      loginButton.disabled = true;
      form.setAttribute("aria-busy", "true");
      controls.forEach((control) => { control.disabled = true; });

      try {
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        const result = mode === "signup" ? await Auth.signup(payload) : await Auth.login(payload);
        if (result.ok) {
          window.location.replace(mode === "signup" ? "onboarding.html" : "index.html");
          return;
        }
        if (result.field === "email" && result.message === "An account with this email already exists.") {
          showFieldError("email", result.message, true);
          fields.email.focus();
        } else if (result.field && errors[result.field]) {
          showFieldError(result.field, result.message, false);
          fields[result.field].focus();
        } else {
          showMessage(formMessage, result.message || "Unable to sign in. Please try again.");
        }
      } catch (error) {
        showMessage(formMessage, "Unable to complete sign in. Please try again.");
      } finally {
        loginButton.classList.remove("is-loading");
        loginButton.disabled = false;
        form.removeAttribute("aria-busy");
        controls.forEach((control) => { control.disabled = false; });
      }
    });

    setMode(window.location.hash.toLowerCase() === "#signup" ? "signup" : "login");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeLoginForm, { once: true });
  } else {
    initializeLoginForm();
  }
})();
