document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  /***** CONSTANTES Y UTILIDADES *****/
  const STORAGE_KEYS = {
    users: "infinityUsers",
    currentUser: "infinityCurrentUser",
    posts: "infinityPosts",
    darkMode: "infinityDarkMode",
    notifications: "infinityNotifications",
    postDraft: "infinityPostDraft",
    language: "infinityLanguage"
  };

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const debounce = (fn, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), delay);
    };
  };

  const StorageUtil = {
    save(key, data) {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        console.error(`Error guardando ${key}:`, e);
      }
    },
    load(key) {
      try { 
        return JSON.parse(localStorage.getItem(key)) || []; 
      } catch (e) {
        console.error(`Error al cargar ${key}:`, e);
        return [];
      }
    }
  };

  /***** INTERNATIONALIZATION (i18n) *****/
  const languages = {
    es: {
      welcome: "Bienvenido",
      logout: "Cerrar sesión",
      profile: "Mi Perfil",
      newPost: "Comparte tu idea",
      searchPlaceholder: "Buscar publicaciones...",
      sortNewest: "Más recientes",
      sortOldest: "Más antiguas",
      sortPopular: "Más populares"
    },
    en: {
      welcome: "Welcome",
      logout: "Log Out",
      profile: "My Profile",
      newPost: "Share your idea",
      searchPlaceholder: "Search posts...",
      sortNewest: "Newest",
      sortOldest: "Oldest",
      sortPopular: "Most Popular"
    }
  };

  let currentLang = localStorage.getItem(STORAGE_KEYS.language) || "es";
  const t = (key) => languages[currentLang][key] || key;
  const switchLanguage = (lang) => {
    if (languages[lang]) {
      currentLang = lang;
      localStorage.setItem(STORAGE_KEYS.language, lang);
      const searchInputEl = document.getElementById("search-input");
      if (searchInputEl) searchInputEl.placeholder = t("searchPlaceholder");
      initForum();
    }
  };

  /***** LOGGER *****/
  const Logger = {
    log(event, details) {
      console.log(`[LOG - ${new Date().toLocaleTimeString()}]`, event, details);
    },
    error(err) {
      console.error(`[ERROR - ${new Date().toLocaleTimeString()}]`, err);
    }
  };

  /***** REALTIME SYNC (WebSocket & BroadcastChannel) *****/
  const RealTimeSync = {
    socket: null,
    init() {
      try {
        // Usamos un servidor de eco para pruebas; en producción, reemplazá por tu propio endpoint seguro
        this.socket = new WebSocket("wss://ws.postman-echo.com/raw");
        this.socket.onopen = () => Logger.log("WebSocket conectado", {});
        this.socket.onmessage = (msg) => {
          try {
            if (!msg.data.trim().startsWith("{")) {
              Logger.log("WebSocket", "Mensaje no JSON recibido, ignorando: " + msg.data);
              return;
            }
            const data = JSON.parse(msg.data);
            if (data.type === "UPDATE_POSTS") renderPosts(searchInput.value);
          } catch (error) { Logger.error("Error al procesar mensaje WebSocket: " + error); }
        };
        this.socket.onerror = (e) => Logger.error("WebSocket error: ", e);
      } catch (e) { Logger.error("Error inicializando WebSocket: ", e); }
    },
    send(data) {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify(data));
      }
    }
  };
  RealTimeSync.init();

  const bc = new BroadcastChannel("infinityForumChannel");
  bc.onmessage = (e) => {
    const { type } = e.data;
    if (type === "UPDATE_POSTS") renderPosts(searchInput.value);
    if (type === "UPDATE_DARK_MODE") setDarkMode(e.data.value);
  };

  /***** SERVICE WORKER REGISTRATION *****/
  if ("serviceWorker" in navigator && window.location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js")
      .then(() => Logger.log("Service Worker registrado", {}))
      .catch(Logger.error);
  } else {
    Logger.log("Service Worker no se registró: protocolo no soportado.", {});
  }

  /***** PLUGIN MANAGER *****/
  const PluginManager = {
    plugins: [],
    loadPlugins() {
      this.plugins.push({
        name: "Ejemplo de Plugin",
        init() {
          Logger.log("Plugin 'Ejemplo de Plugin' inicializado", {});
          const btn = document.createElement("button");
          btn.textContent = "Plugin Action";
          btn.addEventListener("click", () => alert("Acción del plugin ejecutada"));
          const controlsContainer = document.getElementById("controls-container");
          if (controlsContainer) controlsContainer.appendChild(btn);
        }
      });
      this.plugins.forEach(plugin => plugin.init());
    }
  };
  PluginManager.loadPlugins();

  /***** GESTIÓN DE USUARIOS *****/
  const UserManager = {
    load: () => StorageUtil.load(STORAGE_KEYS.users),
    save(users) { StorageUtil.save(STORAGE_KEYS.users, users); },
    register(username, password, confirmPassword, avatar, bio) {
      const users = this.load();
      if (users.some(u => u.username === username)) {
        alert("El nombre de usuario ya existe.");
        return false;
      }
      if (password !== confirmPassword) {
        alert("Las contraseñas no coinciden.");
        return false;
      }
      users.push({ username, password, avatar: avatar || null, bio: bio || "", following: [], followers: [] });
      this.save(users);
      alert("Registro exitoso. Ahora inicia sesión.");
      return true;
    },
    login(username, password) {
      const user = this.load().find(u => u.username === username && u.password === password);
      if (!user) { alert("Credenciales incorrectas."); return false; }
      localStorage.setItem(STORAGE_KEYS.currentUser, username);
      return true;
    },
    logout() { localStorage.removeItem(STORAGE_KEYS.currentUser); },
    getCurrent() { return localStorage.getItem(STORAGE_KEYS.currentUser); },
    getAvatar(username) {
      const user = this.load().find(u => u.username === username);
      return user && user.avatar ? user.avatar : null;
    },
    updateProfile(newData) {
      let users = this.load();
      users = users.map(u => u.username === this.getCurrent() ? { ...u, ...newData } : u);
      this.save(users);
      if (newData.username) {
        localStorage.setItem(STORAGE_KEYS.currentUser, newData.username);
      }
    }
  };

  /***** GESTIÓN DE PUBLICACIONES *****/
  const PostManager = {
    load: () => StorageUtil.load(STORAGE_KEYS.posts),
    save(posts) { StorageUtil.save(STORAGE_KEYS.posts, posts); },
    add(post) {
      let posts = this.load();
      posts.push(post);
      this.save(posts);
      bc.postMessage({ type: "UPDATE_POSTS" });
      RealTimeSync.send({ type: "UPDATE_POSTS" });
    },
    update(postId, fields) {
      let posts = this.load();
      posts = posts.map(p => p.id === postId ? { ...p, ...fields } : p);
      this.save(posts);
      bc.postMessage({ type: "UPDATE_POSTS" });
      RealTimeSync.send({ type: "UPDATE_POSTS" });
    },
    delete(postId) {
      let posts = this.load();
      posts = posts.filter(p => p.id !== postId);
      this.save(posts);
      bc.postMessage({ type: "UPDATE_POSTS" });
      RealTimeSync.send({ type: "UPDATE_POSTS" });
    },
    addReply(postId, reply) {
      let posts = this.load();
      posts = posts.map(p => p.id === postId ? { ...p, replies: [...p.replies, reply] } : p);
      this.save(posts);
      bc.postMessage({ type: "UPDATE_POSTS" });
      RealTimeSync.send({ type: "UPDATE_POSTS" });
    },
    updateReply(postId, replyId, fields) {
      let posts = this.load();
      posts = posts.map(p => {
        if (p.id === postId) {
          const updatedReplies = p.replies.map(r => r.id === replyId ? { ...r, ...fields } : r);
          return { ...p, replies: updatedReplies };
        }
        return p;
      });
      this.save(posts);
      bc.postMessage({ type: "UPDATE_POSTS" });
      RealTimeSync.send({ type: "UPDATE_POSTS" });
    },
    deleteReply(postId, replyId) {
      let posts = this.load();
      posts = posts.map(p => {
        if (p.id === postId) {
          const filtered = p.replies.filter(r => r.id !== replyId);
          return { ...p, replies: filtered };
        }
        return p;
      });
      this.save(posts);
      bc.postMessage({ type: "UPDATE_POSTS" });
      RealTimeSync.send({ type: "UPDATE_POSTS" });
    }
  };

  /***** GESTIÓN DE NOTIFICACIONES *****/
  const NotificationManager = {
    notifications: StorageUtil.load(STORAGE_KEYS.notifications),
    save() { StorageUtil.save(STORAGE_KEYS.notifications, this.notifications); },
    add(msg) {
      this.notifications.push({ id: generateId(), message: msg });
      this.save();
      updateNotifUI();
    },
    clear() { this.notifications = []; this.save(); updateNotifUI(); },
    remove(id) {
      this.notifications = this.notifications.filter(n => n.id !== id);
      this.save();
      updateNotifUI();
    }
  };

  /***** CACHE DE ELEMENTOS DEL DOM *****/
  const authSection = document.getElementById("auth-section");
  const forumSection = document.getElementById("forum-section");
  const profileSection = document.getElementById("profile-section");
  const userInfo = document.getElementById("user-info");
  const postsList = document.getElementById("posts-list");
  const searchInput = document.getElementById("search-input");
  const sortSelect = document.getElementById("sort-select");
  const darkToggle = document.getElementById("dark-mode-toggle");
  const vrToggle = document.getElementById("vr-mode-toggle");
  const assistantPanel = document.getElementById("assistant-panel");
  const assistantMessages = document.getElementById("assistant-messages");
  const assistantForm = document.getElementById("assistant-form");
  const notifButton = document.getElementById("notif-button");
  const notifDropdown = document.getElementById("notif-dropdown");
  const notifList = document.getElementById("notif-list");
  const clearNotifsBtn = document.getElementById("clear-notifs");
  const modal = document.getElementById("modal");

  // Elementos de navegación
  const navHome = document.getElementById("nav-home");
  const navForum = document.getElementById("nav-forum");
  const navProfile = document.getElementById("nav-profile");
  const navNotifs = document.getElementById("nav-notifs");
  const navAI = document.getElementById("nav-ai");

  /***** RENDERIZACIÓN DE PUBLICACIONES *****/
  const sortPosts = (posts, criteria) => {
    const sorted = [...posts];
    if (criteria === "oldest") sorted.sort((a, b) => a.timestamp - b.timestamp);
    else if (criteria === "popular") sorted.sort((a, b) => b.likes - a.likes);
    else sorted.sort((a, b) => b.timestamp - a.timestamp);
    return sorted;
  };

  const createPostElement = (post) => {
    const currentUser = UserManager.getCurrent();
    const li = document.createElement("li");
    li.className = "post";
    li.dataset.id = post.id;

    // Encabezado de la publicación
    const header = document.createElement("div");
    header.className = "post-header";
    const avatarImg = document.createElement("img");
    avatarImg.className = "avatar";
    avatarImg.src = UserManager.getAvatar(post.user) || "https://via.placeholder.com/32";
    avatarImg.alt = `Avatar de ${post.user}`;
    header.appendChild(avatarImg);
    const headerText = document.createElement("span");
    headerText.textContent = `Publicado por ${post.user} el ${new Date(post.timestamp).toLocaleString()}`;
    header.appendChild(headerText);
    li.appendChild(header);

    // Contenido de la publicación
    const contentP = document.createElement("p");
    contentP.className = "post-content";
    // Sanitizamos el contenido (puedes integrar DOMPurify si lo deseas)
    contentP.textContent = post.content;
    li.appendChild(contentP);

    // Imagen adjunta, si existe
    if (post.image) {
      const img = document.createElement("img");
      img.src = post.image;
      img.alt = "Imagen adjunta";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "4px";
      img.style.marginBottom = "0.75rem";
      li.appendChild(img);
    }

    // Formulario de edición (solo para el autor)
    const editForm = document.createElement("form");
    editForm.className = "edit-form";
    const editTextarea = document.createElement("textarea");
    editTextarea.value = post.content;
    editForm.appendChild(editTextarea);
    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.textContent = "Guardar";
    editForm.appendChild(saveBtn);
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancelar";
    editForm.appendChild(cancelBtn);
    li.appendChild(editForm);

    // Acciones de la publicación
    const actionsDiv = document.createElement("div");
    actionsDiv.className = "post-actions";
    const likeBtn = document.createElement("button");
    likeBtn.textContent = `❤️ ${post.likes}`;
    actionsDiv.appendChild(likeBtn);
    const replyToggle = document.createElement("button");
    replyToggle.textContent = "Responder";
    actionsDiv.appendChild(replyToggle);

    if (currentUser !== post.user) {
      const reportBtn = document.createElement("button");
      reportBtn.textContent = "Reportar";
      actionsDiv.appendChild(reportBtn);
      reportBtn.addEventListener("click", () => {
        alert("Has reportado esta publicación.");
        NotificationManager.add(`${currentUser} reportó la publicación de ${post.user}`);
      });
    }
    if (currentUser === post.user) {
      const editBtn = document.createElement("button");
      editBtn.textContent = "Editar";
      actionsDiv.appendChild(editBtn);
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Borrar";
      actionsDiv.appendChild(deleteBtn);

      editBtn.addEventListener("click", () => {
        contentP.style.display = "none";
        editForm.style.display = "block";
      });
      cancelBtn.addEventListener("click", () => {
        editForm.style.display = "none";
        contentP.style.display = "block";
      });
      editForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const newContent = editTextarea.value.trim();
        if (newContent) {
          PostManager.update(post.id, { content: newContent });
          contentP.textContent = newContent;
          editForm.style.display = "none";
          contentP.style.display = "block";
        }
      });
      deleteBtn.addEventListener("click", () => { if (confirm("¿Borrar publicación?")) PostManager.delete(post.id); });
    }
    li.appendChild(actionsDiv);

    likeBtn.addEventListener("click", () => {
      // Control de likes únicos:
      if (!post.likedBy) post.likedBy = [];
      if (!post.likedBy.includes(currentUser)) {
        post.likedBy.push(currentUser);
        PostManager.update(post.id, { likes: post.likes + 1, likedBy: post.likedBy });
        likeBtn.textContent = `❤️ ${post.likes + 1}`;
        NotificationManager.add(`${currentUser} le dio like a la publicación de ${post.user}`);
      } else {
        alert("Ya le diste like a esta publicación.");
      }
    });

    // Sección de respuestas
    const repliesContainer = document.createElement("div");
    repliesContainer.className = "replies-container";
    const repliesList = document.createElement("ul");
    repliesList.className = "replies-list";
    post.replies.forEach(reply => repliesList.appendChild(createReplyElement(post.id, reply)));
    repliesContainer.appendChild(repliesList);
    const replyForm = document.createElement("form");
    replyForm.className = "reply-form";
    const replyTextarea = document.createElement("textarea");
    replyTextarea.placeholder = "Escribe tu respuesta...";
    replyTextarea.required = true;
    replyForm.appendChild(replyTextarea);
    const replyBtn = document.createElement("button");
    replyBtn.type = "submit";
    replyBtn.textContent = "Enviar";
    replyForm.appendChild(replyBtn);
    repliesContainer.appendChild(replyForm);
    li.appendChild(repliesContainer);

    replyToggle.addEventListener("click", () => {
      const isVisible = replyForm.style.display === "block";
      replyForm.style.display = isVisible ? "none" : "block";
      replyToggle.textContent = isVisible ? "Responder" : "Cancelar";
    });
    replyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const replyContent = replyTextarea.value.trim();
      if (replyContent) {
        const newReply = { id: generateId(), user: currentUser, content: replyContent, likes: 0, timestamp: Date.now() };
        PostManager.addReply(post.id, newReply);
        replyTextarea.value = "";
        replyForm.style.display = "none";
        replyToggle.textContent = "Responder";
        renderPosts(searchInput.value);
        NotificationManager.add(`${currentUser} respondió a la publicación de ${post.user}`);
      }
    });
    return li;
  };

  const createReplyElement = (postId, reply) => {
    const currentUser = UserManager.getCurrent();
    const li = document.createElement("li");
    li.className = "reply";
    li.dataset.id = reply.id;
    const header = document.createElement("div");
    header.className = "reply-header";
    header.textContent = `Por ${reply.user} el ${new Date(reply.timestamp).toLocaleString()}`;
    li.appendChild(header);
    const contentP = document.createElement("p");
    contentP.className = "reply-content";
    contentP.textContent = reply.content;
    li.appendChild(contentP);
    const replyActions = document.createElement("div");
    replyActions.className = "reply-actions";
    const likeReplyBtn = document.createElement("button");
    likeReplyBtn.textContent = `❤️ ${reply.likes}`;
    replyActions.appendChild(likeReplyBtn);
    if (currentUser === reply.user) {
      const editBtn = document.createElement("button");
      editBtn.textContent = "Editar";
      replyActions.appendChild(editBtn);
      const deleteBtn = document.createElement("button");
      deleteBtn.textContent = "Borrar";
      replyActions.appendChild(deleteBtn);
      const editReplyForm = document.createElement("form");
      editReplyForm.className = "edit-reply-form";
      const editReplyTextarea = document.createElement("textarea");
      editReplyTextarea.value = reply.content;
      editReplyForm.appendChild(editReplyTextarea);
      const saveReplyBtn = document.createElement("button");
      saveReplyBtn.type = "submit";
      saveReplyBtn.textContent = "Guardar";
      editReplyForm.appendChild(saveReplyBtn);
      const cancelReplyBtn = document.createElement("button");
      cancelReplyBtn.type = "button";
      cancelReplyBtn.textContent = "Cancelar";
      editReplyForm.appendChild(cancelReplyBtn);
      li.appendChild(editReplyForm);
      editBtn.addEventListener("click", () => {
        contentP.style.display = "none";
        editReplyForm.style.display = "block";
      });
      cancelReplyBtn.addEventListener("click", () => {
        editReplyForm.style.display = "none";
        contentP.style.display = "block";
      });
      editReplyForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const newContent = editReplyTextarea.value.trim();
        if (newContent) {
          PostManager.updateReply(postId, reply.id, { content: newContent });
          contentP.textContent = newContent;
          editReplyForm.style.display = "none";
          contentP.style.display = "block";
        }
      });
      deleteBtn.addEventListener("click", () => {
        if (confirm("¿Borrar respuesta?")) PostManager.deleteReply(postId, reply.id);
      });
    }
    likeReplyBtn.addEventListener("click", () => {
      PostManager.updateReply(postId, reply.id, { likes: reply.likes + 1 });
      likeReplyBtn.textContent = `❤️ ${reply.likes + 1}`;
      NotificationManager.add(`${currentUser} le dio like a una respuesta de ${reply.user}`);
    });
    li.appendChild(replyActions);
    return li;
  };

  const renderPosts = (filter = "") => {
    let posts = PostManager.load();
    if (filter) {
      posts = posts.filter(p =>
        p.content.toLowerCase().includes(filter.toLowerCase()) ||
        p.user.toLowerCase().includes(filter.toLowerCase())
      );
    }
    posts = sortPosts(posts, sortSelect.value);
    postsList.innerHTML = "";
    posts.forEach(post => postsList.appendChild(createPostElement(post)));
  };

  /***** NOTIFICACIONES *****/
  const updateNotifUI = () => {
    if (notifButton && notifDropdown) {
      const badge = document.getElementById("notif-badge");
      const count = NotificationManager.notifications.length;
      if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? "inline-block" : "none";
      }
      notifList.innerHTML = "";
      NotificationManager.notifications.forEach(notif => {
        const li = document.createElement("li");
        li.textContent = notif.message;
        const delBtn = document.createElement("button");
        delBtn.textContent = "X";
        delBtn.addEventListener("click", () => { NotificationManager.remove(notif.id); });
        li.appendChild(delBtn);
        notifList.appendChild(li);
      });
    }
  };

  if (notifButton) {
    notifButton.addEventListener("click", () => {
      const isDisplayed = notifDropdown.style.display === "block";
      notifDropdown.style.display = isDisplayed ? "none" : "block";
      notifButton.setAttribute("aria-expanded", !isDisplayed);
    });
  }
  if (clearNotifsBtn) {
    clearNotifsBtn.addEventListener("click", () => { NotificationManager.clear(); });
  }

  /***** AUTOGUARDADO DEL BORRADOR *****/
  const draftKey = STORAGE_KEYS.postDraft;
  if (localStorage.getItem(draftKey)) postInput.value = localStorage.getItem(draftKey);
  postInput.addEventListener("input", () => localStorage.setItem(draftKey, postInput.value));

  postForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const content = postInput.value.trim();
    if (!content) return;
    const currentUser = UserManager.getCurrent();
    const fileInput = document.getElementById("post-image");
    if (fileInput && fileInput.files && fileInput.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => { createAndSavePost(content, ev.target.result, currentUser); };
      reader.readAsDataURL(fileInput.files[0]);
    } else { createAndSavePost(content, null, currentUser); }
  });

  const createAndSavePost = (content, image, currentUser) => {
    const newPost = {
      id: generateId(),
      user: currentUser,
      content,
      image,
      likes: 0,
      likedBy: [],
      timestamp: Date.now(),
      replies: []
    };
    PostManager.add(newPost);
    postInput.value = "";
    localStorage.removeItem(draftKey);
    const fileInput = document.getElementById("post-image");
    if (fileInput) fileInput.value = "";
    renderPosts(searchInput.value);
    NotificationManager.add(`${currentUser} publicó una nueva idea`);
  };

  /***** BÚSQUEDA Y ORDENAMIENTO *****/
  searchInput.addEventListener("keyup", debounce(() => renderPosts(searchInput.value), 300));
  const searchButton = document.getElementById("search-button");
  if (searchButton) {
    searchButton.addEventListener("click", () => renderPosts(searchInput.value));
  }

  /***** AUTENTICACIÓN *****/
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = document.getElementById("login-username").value.trim();
      const password = document.getElementById("login-password").value.trim();
      if (UserManager.login(username, password)) initForum();
    });
  }

  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const username = document.getElementById("register-username").value.trim();
      const password = document.getElementById("register-password").value.trim();
      const confirm = document.getElementById("register-password-confirm").value.trim();
      const bio = document.getElementById("register-bio") ? document.getElementById("register-bio").value.trim() : "";
      const fileInput = document.getElementById("register-avatar");
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const reader = new FileReader();
        reader.onload = (ev) => { if (UserManager.register(username, password, confirm, ev.target.result, bio)) registerForm.reset(); };
        reader.readAsDataURL(fileInput.files[0]);
      } else {
        if (UserManager.register(username, password, confirm, null, bio)) registerForm.reset();
      }
    });
  }

  /***** MODO OSCURO *****/
  const setDarkMode = (enabled) => {
    if (enabled) {
      document.body.classList.add("dark");
      darkToggle.textContent = "Modo Claro";
      localStorage.setItem(STORAGE_KEYS.darkMode, "true");
    } else {
      document.body.classList.remove("dark");
      darkToggle.textContent = "Modo Oscuro";
      localStorage.setItem(STORAGE_KEYS.darkMode, "false");
    }
    bc.postMessage({ type: "UPDATE_DARK_MODE", value: enabled });
    RealTimeSync.send({ type: "UPDATE_DARK_MODE", value: enabled });
  };
  if (darkToggle) {
    darkToggle.addEventListener("click", () => setDarkMode(!document.body.classList.contains("dark")));
  }
  if (localStorage.getItem(STORAGE_KEYS.darkMode) === "true") setDarkMode(true);

  /***** MODO VR *****/
  if (vrToggle) {
    vrToggle.addEventListener("click", () => {
      document.body.classList.toggle("vr-mode");
      vrToggle.textContent = document.body.classList.contains("vr-mode") ? "VR Off" : "VR Mode";
    });
  }

  /***** INTERFAZ NEURAL (Speech Recognition) *****/
  let recognition;
  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
  }
  if (neuralToggle) {
    neuralToggle.addEventListener("click", () => {
      if (!recognition) { alert("El reconocimiento de voz no está soportado en este navegador."); return; }
      neuralToggle.textContent = "Escuchando...";
      recognition.start();
    });
  }
  if (recognition) {
    recognition.addEventListener("result", (event) => {
      const transcript = event.results[0][0].transcript;
      postInput.value += (postInput.value ? " " : "") + transcript;
    });
    recognition.addEventListener("end", () => { if (neuralToggle) neuralToggle.textContent = "Interfaz Neural"; });
  }

  /***** AI ASSISTANT *****/
  async function getAIResponse(query) {
    // Ejemplo de integración con una API externa:
    // Reemplazá la URL y agrega tu clave API según la documentación de la API (por ejemplo, OpenAI)
    // return fetch("https://api.tu-ai.com/v1/respond", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //     "Authorization": "Bearer TU_CLAVE_API"
    //   },
    //   body: JSON.stringify({ prompt: query })
    // }).then(res => res.json()).then(data => data.response);
    
    // Simulación simple:
    const baseResponses = [
      "Gracias por compartir tus pensamientos. ¿Podrías contarme más sobre eso?",
      "Interesante, me encantaría conocer más detalles de tu perspectiva.",
      "Eso abre muchas posibilidades. ¿Qué otros aspectos consideras importantes?",
      "Tu comentario es muy inspirador. ¿Podrías profundizar un poco más?",
      "Es un enfoque muy novedoso. ¿Qué te llevó a pensar de esa manera?",
      "Me parece un tema fascinante. ¿Cómo imaginas que evolucione en el futuro?"
    ];
    const randomResponse = baseResponses[Math.floor(Math.random() * baseResponses.length)];
    return `Has dicho: "${query}". ${randomResponse}`;
  }

  if (navAI) {
    navAI.addEventListener("click", (e) => {
      e.preventDefault();
      if (assistantPanel) {
        if (assistantPanel.style.display === "none" || assistantPanel.getAttribute("aria-hidden") === "true") {
          assistantPanel.style.display = "block";
          assistantPanel.setAttribute("aria-hidden", "false");
          assistantToggle.textContent = "Ocultar AI Assistant";
          window.scrollTo({ top: assistantPanel.offsetTop, behavior: "smooth" });
        } else {
          assistantPanel.setAttribute("aria-hidden", "true");
          setTimeout(() => { assistantPanel.style.display = "none"; }, 300);
          assistantToggle.textContent = "AI Assistant";
        }
      }
    });
  }

  if (assistantForm) {
    assistantForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const assistantInput = document.getElementById("assistant-input");
      if (!assistantInput) return;
      const query = assistantInput.value.trim();
      if (!query) return;
      appendAssistantMessage("Usuario", query);
      assistantInput.value = "";
      const response = await getAIResponse(query);
      appendAssistantMessage("Asistente de IA", response);
    });
  }

  const appendAssistantMessage = (sender, message) => {
    if (!assistantMessages) return;
    const msgDiv = document.createElement("div");
    msgDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
    assistantMessages.appendChild(msgDiv);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
  };

  /***** MODAL DE PERFIL *****/
  const editProfileButton = document.getElementById("edit-profile-button");
  const editProfileForm = document.getElementById("edit-profile-form");
  const closeModal = document.getElementById("close-modal");

  if (editProfileButton) {
    editProfileButton.addEventListener("click", () => {
      const editUsername = document.getElementById("edit-profile-username");
      if (editUsername) editUsername.value = UserManager.getCurrent();
      if (modal) modal.style.display = "flex";
    });
  }
  if (closeModal) {
    closeModal.addEventListener("click", () => { if (modal) modal.style.display = "none"; });
  }
  if (editProfileForm) {
    editProfileForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const newUsername = document.getElementById("edit-profile-username").value.trim();
      const fileInput = document.getElementById("edit-profile-avatar");
      if (!newUsername) return;
      let users = UserManager.load();
      if (users.some(u => u.username === newUsername)) { alert("El nombre ya existe."); return; }
      users = users.map(u => u.username === UserManager.getCurrent() ? { ...u, username: newUsername } : u);
      UserManager.save(users);
      let posts = PostManager.load();
      posts = posts.map(p => p.user === UserManager.getCurrent() ? { ...p, user: newUsername } : p);
      PostManager.save(posts);
      localStorage.setItem(STORAGE_KEYS.currentUser, newUsername);
      initForum();
      if (modal) modal.style.display = "none";
    });
  }

  /***** OFFLINE SUPPORT (IndexedDB SIMULADO) *****/
  const dbName = "infinityForumDB";
  let db;
  const initDB = () => {
    const request = indexedDB.open(dbName, 1);
    request.onerror = (e) => Logger.error("IndexedDB error", e);
    request.onsuccess = (e) => { db = e.target.result; Logger.log("IndexedDB iniciado", {}); };
    request.onupgradeneeded = (e) => {
      db = e.target.result;
      if (!db.objectStoreNames.contains("posts")) {
        db.createObjectStore("posts", { keyPath: "id" });
      }
    };
  };
  initDB();

  /***** INICIALIZACIÓN DEL FORO Y AUTENTICACIÓN *****/
  const initForum = () => {
    if (authSection) authSection.style.display = "none";
    if (forumSection) forumSection.style.display = "block";
    if (profileSection) profileSection.style.display = "none";
    if (userInfo) {
      userInfo.innerHTML = `${t("welcome")}, <strong>${UserManager.getCurrent()}</strong>
      <button id="logout-button">${t("logout")}</button>
      <button id="profile-button">${t("profile")}</button>`;
      const logoutButton = document.getElementById("logout-button");
      const profileButton = document.getElementById("profile-button");
      if (logoutButton) {
        logoutButton.addEventListener("click", () => {
          UserManager.logout();
          location.reload();
        });
      }
      if (profileButton) {
        profileButton.addEventListener("click", () => {
          if (profileSection) profileSection.style.display = "block";
          if (forumSection) forumSection.style.display = "none";
          const avatar = UserManager.getAvatar(UserManager.getCurrent());
          const profileAvatar = document.getElementById("profile-avatar");
          if (profileAvatar) {
            if (avatar) {
              profileAvatar.src = avatar;
              profileAvatar.style.display = "inline-block";
            } else {
              profileAvatar.style.display = "none";
            }
          }
          const profileUsername = document.getElementById("profile-username");
          if (profileUsername) profileUsername.textContent = `Usuario: ${UserManager.getCurrent()}`;
          // Mostrar bio si existe:
          const currentUser = UserManager.getCurrent();
          const users = UserManager.load();
          const currentData = users.find(u => u.username === currentUser);
          const profileBio = document.getElementById("profile-bio");
          if (profileBio) profileBio.textContent = currentData && currentData.bio ? currentData.bio : "";
        });
      }
    }
    renderPosts();
    updateNotifUI();
    Logger.log("Foro inicializado", {});
  };

  const initAuth = () => {
    if (authSection) authSection.style.display = "flex";
    if (forumSection) forumSection.style.display = "none";
    if (userInfo) userInfo.innerHTML = "";
  };

  UserManager.getCurrent() ? initForum() : initAuth();

  /***** EVENTOS GLOBALES: Cambio de idioma (Ctrl+L) *****/
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "l") { 
      switchLanguage(currentLang === "es" ? "en" : "es");
    }
  });

  /***** NAVEGACIÓN (Barra superior) *****/
  if (navHome) {
    navHome.addEventListener("click", (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }
  if (navForum) {
    navForum.addEventListener("click", (e) => {
      e.preventDefault();
      if (authSection) authSection.style.display = "none";
      if (profileSection) profileSection.style.display = "none";
      if (forumSection) forumSection.style.display = "block";
      window.scrollTo({ top: forumSection.offsetTop, behavior: "smooth" });
    });
  }
  if (navProfile) {
    navProfile.addEventListener("click", (e) => {
      e.preventDefault();
      if (UserManager.getCurrent()) {
        if (authSection) authSection.style.display = "none";
        if (forumSection) forumSection.style.display = "none";
        if (profileSection) profileSection.style.display = "block";
        window.scrollTo({ top: profileSection.offsetTop, behavior: "smooth" });
      } else {
        alert("Debes iniciar sesión para ver tu perfil.");
      }
    });
  }
  if (navNotifs) {
    navNotifs.addEventListener("click", (e) => {
      e.preventDefault();
      if (notifDropdown) notifDropdown.style.display = notifDropdown.style.display === "block" ? "none" : "block";
    });
  }
  if (navAI) {
    navAI.addEventListener("click", (e) => {
      e.preventDefault();
      if (assistantPanel) {
        if (assistantPanel.style.display === "none" || assistantPanel.getAttribute("aria-hidden") === "true") {
          assistantPanel.style.display = "block";
          assistantPanel.setAttribute("aria-hidden", "false");
          assistantToggle.textContent = "Ocultar AI Assistant";
          window.scrollTo({ top: assistantPanel.offsetTop, behavior: "smooth" });
        } else {
          assistantPanel.setAttribute("aria-hidden", "true");
          setTimeout(() => { assistantPanel.style.display = "none"; }, 300);
          assistantToggle.textContent = "AI Assistant";
        }
      }
    });
  }

  Logger.log("Aplicación cargada", {});
});
