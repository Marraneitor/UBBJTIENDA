// ============================================
// UBBJ Tienda Universitaria — app.js
// Sistema con verificación de vendedores
// ============================================

// =============================================
// 🔧 CONFIGURACIÓN DE FIREBASE
// =============================================
const firebaseConfig = {
  apiKey:            "AIzaSyCIggz9kowWV0aiq95GV-7KStBBdNry7NI",
  authDomain:        "ubbjtienda.firebaseapp.com",
  projectId:         "ubbjtienda",
  storageBucket:     "ubbjtienda.firebasestorage.app",
  messagingSenderId: "156880129521",
  appId:             "1:156880129521:web:c245ca7018dd90d4454850"
};

firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const storage = firebase.storage();

// Colecciones
const sellersCol       = db.collection("vendedores");
const productsCol      = db.collection("productos");
const interactionsCol  = db.collection("interacciones");
const complaintsCol    = db.collection("quejas");
const buyersCol        = db.collection("compradores");
const purchasesCol     = db.collection("compras");
const ratingsCol       = db.collection("calificaciones");
const messagesCol      = db.collection("mensajes");
const metricsDoc       = db.doc("metricas/global");


// =============================================
// 🔔 SISTEMA DE NOTIFICACIONES PUSH (FCM)
// =============================================
// VAPID Key pública de Firebase Cloud Messaging
// Obtenla en Firebase Console → Configuración → Cloud Messaging → Web Push certificates
const VAPID_KEY = 'BPCXfdMPKtjFiHgSUfNfD0jgb4onpFeJ9VHOUlaTh02sGGGe4lZxOEqqOLz2Embr8TR-hkW6NXiLzcnMdYJtdYk';

let _messagingInstance = null;

function getMessagingInstance() {
  if (_messagingInstance) return _messagingInstance;
  try {
    _messagingInstance = firebase.messaging();
    return _messagingInstance;
  } catch (err) {
    console.warn('FCM no disponible:', err.message);
    return null;
  }
}

/** Pedir permiso de notificaciones y obtener token FCM */
async function requestNotificationPermission() {
  // FCM solo funciona en HTTPS de producción
  if (location.protocol !== 'https:') {
    return null;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return null;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return null;
  }

  try {
    // Usar el SW único que ya tiene Firebase Messaging
    const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessagingInstance();
    if (!messaging) return null;

    const token = await messaging.getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (token) {
      console.log('✅ Token FCM obtenido');
      localStorage.setItem('fcmToken', token);
      return token;
    }
  } catch (err) {
    console.error('Error obteniendo token FCM:', err);
  }
  return null;
}

/** Guardar token del comprador vinculado a un pedido */
async function saveClientNotifToken(compradorId, compradorNombre, compradorTelefono) {
  const token = await requestNotificationPermission();
  if (!token || !compradorId) return null;

  try {
    await db.collection('notifTokens').doc(token).set({
      token,
      tipo: 'comprador',
      compradorId,
      nombre: compradorNombre || 'Cliente',
      telefono: compradorTelefono || '',
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Error guardando token de comprador:', err);
  }
  return token;
}

/** Guardar token del vendedor para recibir notif de nuevos pedidos */
async function saveSellerNotifToken(sellerId) {
  const token = await requestNotificationPermission();
  if (!token || !sellerId) return null;

  try {
    await db.collection('notifTokens').doc(token).set({
      token,
      tipo: 'vendedor',
      vendedorId: sellerId,
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Error guardando token de vendedor:', err);
  }
  return token;
}

/** Escuchar notificaciones en primer plano */
function listenForegroundNotifications() {
  try {
    const messaging = getMessagingInstance();
    if (!messaging) return;

    messaging.onMessage((payload) => {
      const title = payload.notification?.title || payload.data?.title || '🔔 UBBJ Tienda';
      const body = payload.notification?.body || payload.data?.body || '';
      const chatUrl = payload.data?.url || null;

      // Notificación nativa del navegador
      if (Notification.permission === 'granted') {
        const n = new Notification(title, {
          body,
          icon: '/Logoubbj.png',
          vibrate: [200, 100, 200],
          data: { url: chatUrl }
        });
        n.onclick = () => {
          window.focus();
          n.close();
          if (chatUrl) window.location.href = chatUrl;
        };
      }

      // Toast visual en la app
      showNotificationToast(title, body, chatUrl);
    });
  } catch (err) {
    console.warn('Error listener foreground:', err);
  }
}

/** Toast de notificación visible en la app */
function showNotificationToast(title, body, chatUrl) {
  const prev = document.getElementById('notif-toast');
  if (prev) prev.remove();

  const toast = document.createElement('div');
  toast.id = 'notif-toast';
  toast.className = 'notification-toast';
  if (chatUrl) toast.style.cursor = 'pointer';
  toast.innerHTML = `
    <div class="notif-toast-icon">🔔</div>
    <div class="notif-toast-content">
      <strong>${title}</strong>
      <p>${body}</p>
    </div>
    <button class="notif-toast-close" onclick="event.stopPropagation(); this.parentElement.remove()">✕</button>
  `;
  if (chatUrl) {
    toast.addEventListener('click', () => {
      toast.remove();
      window.location.href = chatUrl;
    });
  }
  document.body.appendChild(toast);
  playNotificationSound();
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  setTimeout(() => { if (toast.parentElement) toast.remove(); }, 6000);
}

// Iniciar listener al cargar
if ('serviceWorker' in navigator) {
  listenForegroundNotifications();
}


// =============================================
// � SONIDO DE NOTIFICACIÓN
// =============================================
let _notifAudioCtx = null;
function playNotificationSound() {
  try {
    if (!_notifAudioCtx) _notifAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _notifAudioCtx;
    const now = ctx.currentTime;
    // Chime de dos tonos agradable
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(830, now);
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.3);

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100, now);
    osc2.connect(gain);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.55);
  } catch(e) { console.warn('Sound error:', e); }
}


// =============================================
// ✍️ INDICADOR DE ESCRITURA (TYPING)
// =============================================
const typingCol = db.collection('typing');

/** Establece el estado de escritura del usuario en un chat */
function setTypingStatus(chatId, userId, userName, isTyping) {
  const docId = chatId + '_' + userId;
  typingCol.doc(docId).set({
    chatId: chatId,
    userId: userId,
    userName: userName,
    isTyping: isTyping,
    timestamp: firebase.firestore.FieldValue.serverTimestamp()
  }).catch(function(e) { console.warn('Typing write error:', e.message || e); });
}

/** Crea un debouncer de escritura para un input de chat */
function createTypingDebouncer(chatId, userId, userName) {
  let typingTimeout = null;
  return {
    onInput: function() {
      setTypingStatus(chatId, userId, userName, true);
      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(function() {
        setTypingStatus(chatId, userId, userName, false);
      }, 2500);
    },
    stop: function() {
      if (typingTimeout) clearTimeout(typingTimeout);
      setTypingStatus(chatId, userId, userName, false);
    }
  };
}

/** Escucha el estado de escritura del otro usuario y muestra indicador.
 *  Retorna { unsub, renderIndicator } para que se pueda re-renderizar
 *  después de que el contenedor se vacíe con innerHTML = ''. */
function listenTypingStatus(chatId, otherUserId, container) {
  const docId = chatId + '_' + otherUserId;
  let _active = false;
  let _name = '';

  function renderIndicator() {
    let indicator = container.querySelector('.typing-indicator');
    if (_active) {
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        container.appendChild(indicator);
      }
      indicator.innerHTML = '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span> ' + _name + ' está escribiendo';
      indicator.style.display = 'flex';
      container.scrollTop = container.scrollHeight;
    } else if (indicator) {
      indicator.remove();
    }
  }

  const unsub = typingCol.doc(docId).onSnapshot(function(doc) {
    if (doc.exists && doc.data().isTyping) {
      const d = doc.data();
      if (d.timestamp) {
        const now = Date.now() / 1000;
        const ts = d.timestamp.seconds || 0;
        if (now - ts > 5) { _active = false; renderIndicator(); return; }
      }
      _name = d.userName || 'Alguien';
      _active = true;
    } else {
      _active = false;
    }
    renderIndicator();
  });

  return { unsub: unsub, renderIndicator: renderIndicator };
}


// =============================================
// �🛠️  UTILIDADES
// =============================================

function showToast(message, type = "") {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = "toast" + (type ? ` toast-${type}` : "");
  void toast.offsetWidth;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function setLoading(show) {
  const overlay = document.getElementById("spinner-overlay");
  if (overlay) overlay.classList.toggle("active", show);
}

function formatPrice(n) {
  return Number(n).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
}

function formatDate(timestamp) {
  if (!timestamp) return "";
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString("es-MX", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

function trackVisit() {
  if (sessionStorage.getItem("visited")) return;
  sessionStorage.setItem("visited", "1");
  metricsDoc.set({ visitas: firebase.firestore.FieldValue.increment(1) }, { merge: true });
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

/** Genera HTML de estrellas (solo lectura) */
function renderStarsReadonly(avg, count) {
  const displayAvg = count > 0 ? avg.toFixed(1) : "0";
  let html = '<div class="stars-display">';
  for (let i = 1; i <= 5; i++) {
    if (i <= Math.floor(avg)) {
      html += '<span class="star filled">★</span>';
    } else if (i - avg < 1 && i - avg > 0) {
      html += '<span class="star half">★</span>';
    } else {
      html += '<span class="star">★</span>';
    }
  }
  html += ` <span class="stars-avg">${displayAvg}</span> <span class="stars-count">(${count})</span></div>`;
  return html;
}

/** Genera HTML de estrellas interactivas para calificar */
function renderStarsInteractive(sellerId, currentRating) {
  let html = `<div class="stars-interactive" data-seller="${sellerId}">`;
  for (let i = 1; i <= 5; i++) {
    html += `<span class="star-btn ${i <= currentRating ? 'filled' : ''}" data-value="${i}">★</span>`;
  }
  html += '</div>';
  return html;
}

/** Obtener promedio y conteo de calificaciones de un vendedor */
async function getSellerRating(sellerId) {
  const snap = await ratingsCol.where("vendedorId", "==", sellerId).get();
  if (snap.empty) return { avg: 0, count: 0 };
  let total = 0;
  snap.forEach(doc => { total += doc.data().estrellas; });
  return { avg: total / snap.size, count: snap.size };
}

/** Obtener calificación actual de un comprador a un vendedor */
async function getBuyerRating(buyerId, sellerId) {
  const snap = await ratingsCol
    .where("compradorId", "==", buyerId)
    .where("vendedorId", "==", sellerId)
    .get();
  if (snap.empty) return { docId: null, estrellas: 0 };
  const doc = snap.docs[0];
  return { docId: doc.id, estrellas: doc.data().estrellas };
}

/** Guardar o actualizar calificación */
async function saveRating(buyerId, sellerId, stars) {
  const existing = await getBuyerRating(buyerId, sellerId);
  if (existing.docId) {
    await ratingsCol.doc(existing.docId).update({
      estrellas: stars,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
  } else {
    await ratingsCol.add({
      compradorId: buyerId,
      vendedorId: sellerId,
      estrellas: stars,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
  }
}

// =============================================
// 💬 SISTEMA DE RESEÑAS
// =============================================
const reviewsCol = db.collection("resenas");

async function openReviewsModal(sellerId, sellerName) {
  const modal = document.getElementById("reviews-modal");
  const nameEl = document.getElementById("reviews-seller-name");
  const listEl = document.getElementById("reviews-list");
  const formContainer = document.getElementById("reviews-form-container");
  if (!modal) return;

  nameEl.textContent = sellerName;
  listEl.innerHTML = '<p class="reviews-empty">Cargando reseñas...</p>';
  formContainer.innerHTML = "";
  modal.style.display = "flex";

  // Cargar reseñas
  try {
    let snap;
    try {
      snap = await reviewsCol
        .where("vendedorId", "==", sellerId)
        .orderBy("fecha", "desc")
        .get();
    } catch (indexErr) {
      // Si falta el índice compuesto, cargar sin orden
      snap = await reviewsCol
        .where("vendedorId", "==", sellerId)
        .get();
    }

    if (snap.empty) {
      listEl.innerHTML = '<p class="reviews-empty">Aún no hay reseñas. ¡Sé el primero en opinar!</p>';
    } else {
      listEl.innerHTML = "";
      snap.forEach(doc => {
        const r = doc.data();
        const stars = "★".repeat(r.estrellas) + "☆".repeat(5 - r.estrellas);
        const fecha = r.fecha ? r.fecha.toDate().toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }) : "";
        const initials = (r.nombreComprador || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

        listEl.innerHTML += `
          <div class="review-card">
            <div class="review-header">
              <div class="review-avatar">${initials}</div>
              <span class="review-author">${r.nombreComprador || "Anónimo"}</span>
              <span class="review-date">${fecha}</span>
            </div>
            <div class="review-stars">${stars}</div>
            ${r.comentario ? `<p class="review-comment">${r.comentario}</p>` : ''}
          </div>`;
      });
    }
  } catch (err) {
    console.error("Error cargando reseñas:", err);
    listEl.innerHTML = '<p class="reviews-empty">Error al cargar reseñas</p>';
  }

  // Formulario para dejar reseña (solo compradores logueados)
  const buyerId = localStorage.getItem("buyer_id");
  if (buyerId) {
    let buyerName = "Comprador";
    try {
      const bDoc = await buyersCol.doc(buyerId).get();
      if (bDoc.exists) buyerName = bDoc.data().nombre || "Comprador";
    } catch (e) {}

    let selectedStars = 0;

    formContainer.innerHTML = `
      <div class="review-form">
        <h3>✍️ Deja tu reseña</h3>
        <div class="stars-interactive" id="review-stars">
          ${[1,2,3,4,5].map(i => `<span class="star-btn" data-value="${i}">★</span>`).join("")}
        </div>
        <textarea id="review-comment" placeholder="Escribe tu opinión sobre este vendedor..."></textarea>
        <button class="btn-submit-review" id="submit-review-btn">Publicar reseña</button>
      </div>`;

    // Eventos estrellas
    formContainer.querySelectorAll(".star-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        selectedStars = parseInt(btn.dataset.value);
        formContainer.querySelectorAll(".star-btn").forEach(b => {
          b.classList.toggle("filled", parseInt(b.dataset.value) <= selectedStars);
        });
      });
    });

    // Enviar reseña
    document.getElementById("submit-review-btn").addEventListener("click", async () => {
      if (selectedStars === 0) {
        showToast("Selecciona una calificación", "error");
        return;
      }
      const comment = document.getElementById("review-comment").value.trim();

      try {
        await reviewsCol.add({
          compradorId: buyerId,
          vendedorId: sellerId,
          nombreComprador: buyerName,
          estrellas: selectedStars,
          comentario: comment,
          fecha: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("¡Reseña publicada! 🎉", "success");
        // Recargar modal
        openReviewsModal(sellerId, sellerName);
      } catch (err) {
        console.error("Error guardando reseña:", err);
        showToast("Error al guardar la reseña", "error");
      }
    });
  } else {
    formContainer.innerHTML = '<p class="review-login-hint">Inicia sesión en <a href="ubbjotito">Mi Ubbjotito</a> para dejar una reseña</p>';
  }
}

// Cerrar modal al hacer clic fuera
document.addEventListener("click", (e) => {
  const modal = document.getElementById("reviews-modal");
  if (modal && e.target === modal) modal.style.display = "none";
});

/** Sube imagen a Storage y devuelve la URL */
async function uploadImage(file, folder) {
  const ext = file.name.split(".").pop();
  const ref = storage.ref(`${folder}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`);
  const snap = await ref.put(file);
  return await snap.ref.getDownloadURL();
}


// =============================================
// 🏠 CATÁLOGO DE VENDEDORES — index.html
// =============================================

/** Muestra skeleton cards de carga */
function showSkeletons(grid, count = 6) {
  grid.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const sk = document.createElement("div");
    sk.className = "seller-card";
    sk.innerHTML = `
      <div class="card-banner"></div>
      <div style="padding:1.25rem;text-align:center">
        <div class="skeleton skeleton-avatar" style="margin-top:-40px"></div>
        <div class="skeleton skeleton-text" style="margin-top:0.75rem"></div>
        <div class="skeleton skeleton-text short" style="margin-top:0.5rem"></div>
      </div>`;
    grid.appendChild(sk);
  }
}

/** Observador de scroll para animaciones fade-up */
function setupScrollAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });

  document.querySelectorAll(".fade-up").forEach(el => observer.observe(el));
}

async function loadSellers() {
  const grid = document.getElementById("sellers-grid");
  if (!grid) return;

  showSkeletons(grid, 6);
  try {
    // Solo vendedores aprobados
    const snap = await sellersCol.where("status", "==", "aprobado").orderBy("aprobadoEn", "desc").get();

    if (snap.empty) {
      grid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">👥</div>
          <p>Aún no hay vendedores registrados.<br>¡Regístrate para comenzar a vender!</p>
        </div>`;
      setLoading(false);
      return;
    }

    grid.innerHTML = "";

    // Para cada vendedor, contar sus productos
    const productSnap = await productsCol.get();
    const productCount = {};
    productSnap.forEach(doc => {
      const vid = doc.data().vendedorId;
      productCount[vid] = (productCount[vid] || 0) + 1;
    });

    // Obtener todas las calificaciones para calcular promedios
    const allRatingsSnap = await ratingsCol.get();
    const ratingsMap = {}; // vendedorId -> { total, count }
    allRatingsSnap.forEach(doc => {
      const r = doc.data();
      if (!ratingsMap[r.vendedorId]) ratingsMap[r.vendedorId] = { total: 0, count: 0 };
      ratingsMap[r.vendedorId].total += r.estrellas;
      ratingsMap[r.vendedorId].count++;
    });

    snap.forEach((doc) => {
      const s = doc.data();
      const count = productCount[doc.id] || 0;
      const rData = ratingsMap[doc.id] || { total: 0, count: 0 };
      const avg = rData.count > 0 ? rData.total / rData.count : 0;
      const card = createSellerCard(doc.id, s, count, avg, rData.count);
      card.classList.add("fade-up");
      grid.appendChild(card);
    });

    // 🏆 Ranking de vendedores populares
    buildRanking(snap, ratingsMap, productCount);

    // Activar animaciones de scroll
    setupScrollAnimations();
  } catch (err) {
    console.error("Error cargando vendedores:", err);
    showToast("Error al cargar vendedores", "error");
  }
  setLoading(false);
}

function createSellerCard(id, s, productCount, ratingAvg = 0, ratingCount = 0) {
  const card = document.createElement("div");
  card.className = "seller-card" + (s.oculto ? " seller-offline" : "");
  card.setAttribute("data-name", (s.nombre || "").toLowerCase());
  card.setAttribute("data-career", (s.carrera || "").toLowerCase());
  card.setAttribute("data-category", (s.categoria || "").trim());
  card.setAttribute("data-desc", (s.descripcion || "").toLowerCase());

  // Construir horario
  let scheduleHtml = "";
  if (s.horaInicio && s.horaFin) {
    scheduleHtml = `<p class="card-schedule">📍 ${s.horaInicio} - ${s.horaFin}</p>`;
  }

  const starsHtml = renderStarsReadonly(ratingAvg, ratingCount);

  card.innerHTML = `
    ${s.oculto ? '<div class="offline-badge">🚫 Fuera de servicio</div>' : ''}
    <div class="card-banner"></div>
    <img class="card-avatar" src="${s.foto || 'https://placehold.co/80/e2e8f0/64748b?text=👤'}" alt="${s.nombre}" loading="lazy">
    <div class="card-body">
      <h3 class="card-name">${s.nombre}</h3>
      ${s.categoria ? `<span class="card-category-badge">${s.categoria}</span>` : ''}
      ${starsHtml}
      <p class="card-desc">${s.descripcion || 'Sin descripción'}</p>
      ${s.turno ? `<p class="card-shift">${s.turno === 'matutino' ? '🌅 Matutino' : s.turno === 'vespertino' ? '🌇 Vespertino' : '🌄 Ambos turnos'}</p>` : ''}
      ${scheduleHtml}
      <p class="card-stats">${productCount} producto${productCount !== 1 ? 's' : ''}</p>
      <button class="btn-reviews" data-seller-id="${id}" data-seller-name="${(s.nombre || '').replace(/"/g, '&quot;')}" onclick="event.stopPropagation(); openReviewsModal(this.dataset.sellerId, this.dataset.sellerName)">💬 Reseñas</button>
    </div>`;

  card.addEventListener("click", () => {
    window.location.href = `perfil?id=${id}`;
  });

  return card;
}

function setupSellerSearch() {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.setAttribute("placeholder", "Buscar vendedor, producto o categoría...");

  let activeCategory = "todos";

  // Función de filtrado combinada
  function filterCards() {
    const term = input.value.toLowerCase().trim();
    document.querySelectorAll(".seller-card").forEach((card) => {
      const name = card.getAttribute("data-name") || "";
      const career = card.getAttribute("data-career") || "";
      const category = card.getAttribute("data-category") || "";
      const desc = card.getAttribute("data-desc") || "";

      const matchesText = !term || name.includes(term) || career.includes(term) || category.toLowerCase().includes(term) || desc.includes(term);
      const matchesCat = activeCategory === "todos" || category === activeCategory;

      card.style.display = (matchesText && matchesCat) ? "" : "none";
    });
  }

  input.addEventListener("input", filterCards);

  // Category filter buttons
  const catContainer = document.getElementById("category-filters");
  if (catContainer) {
    catContainer.addEventListener("click", (e) => {
      const btn = e.target.closest(".cat-btn");
      if (!btn) return;
      catContainer.querySelectorAll(".cat-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeCategory = btn.getAttribute("data-cat");
      filterCards();
    });
  }
}


// =============================================
// 🏆 RANKING DE VENDEDORES POPULARES
// =============================================

function buildRanking(sellersSnap, ratingsMap, productCount) {
  const section = document.getElementById("ranking-section");
  const grid = document.getElementById("ranking-grid");
  if (!section || !grid) return;

  // Construir lista con promedios
  const ranked = [];
  sellersSnap.forEach((doc) => {
    const s = doc.data();
    const rData = ratingsMap[doc.id] || { total: 0, count: 0 };
    const avg = rData.count > 0 ? rData.total / rData.count : 0;
    if (rData.count > 0) {
      ranked.push({ id: doc.id, seller: s, avg, count: rData.count, products: productCount[doc.id] || 0 });
    }
  });

  // Ordenar por promedio desc, luego por cantidad de reseñas desc
  ranked.sort((a, b) => b.avg - a.avg || b.count - a.count);

  // Top 5
  const top = ranked.slice(0, 5);
  if (top.length === 0) return;

  section.style.display = "block";
  grid.innerHTML = "";

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];

  top.forEach((item, i) => {
    const s = item.seller;
    const card = document.createElement("div");
    card.className = "ranking-card fade-up";
    card.innerHTML = `
      <span class="ranking-medal">${medals[i]}</span>
      <img class="ranking-avatar" src="${s.foto || 'https://placehold.co/60/e2e8f0/64748b?text=👤'}" alt="${s.nombre}" loading="lazy">
      <div class="ranking-info">
        <h4 class="ranking-name">${s.nombre}</h4>
        ${s.categoria ? `<span class="card-category-badge" style="font-size:0.65rem;padding:0.12rem 0.5rem">${s.categoria}</span>` : ''}
        <div class="ranking-stars">${renderStarsReadonly(item.avg, item.count)}</div>
      </div>`;
    card.addEventListener("click", () => { window.location.href = `perfil?id=${item.id}`; });
    grid.appendChild(card);
  });
}


// =============================================
// ❓ CÓMO FUNCIONA — index.html
// =============================================

function setupHowModal() {
  const btn = document.getElementById("btn-how");
  const modal = document.getElementById("how-modal");
  if (!btn || !modal) return;

  btn.addEventListener("click", () => { modal.style.display = "flex"; });
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });
}


// =============================================
// ⚠️ REPORTAR VENDEDOR — index.html
// =============================================

function setupComplaintModal() {
  const btn = document.getElementById("btn-complaint");
  const modal = document.getElementById("complaint-modal");
  const form = document.getElementById("complaint-form");
  const sellerSelect = document.getElementById("complaint-seller");
  if (!btn || !modal || !form || !sellerSelect) return;

  btn.addEventListener("click", async () => {
    modal.style.display = "flex";
    // Cargar vendedores aprobados en el select
    if (sellerSelect.options.length <= 1) {
      try {
        const snap = await sellersCol.where("status", "==", "aprobado").get();
        snap.forEach((doc) => {
          const s = doc.data();
          const opt = document.createElement("option");
          opt.value = doc.id;
          opt.textContent = s.nombre;
          opt.setAttribute("data-nombre", s.nombre);
          sellerSelect.appendChild(opt);
        });
      } catch (err) {
        console.error("Error cargando vendedores para queja:", err);
      }
    }
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const sellerId = sellerSelect.value;
    const sellerName = sellerSelect.options[sellerSelect.selectedIndex].textContent;
    const subject = document.getElementById("complaint-subject").value.trim();
    const message = document.getElementById("complaint-message").value.trim();

    if (!sellerId || !subject || !message) {
      showToast("Completa todos los campos", "error");
      return;
    }

    setLoading(true);
    try {
      await complaintsCol.add({
        vendedorId: sellerId,
        vendedorNombre: sellerName,
        asunto: subject,
        mensaje: message,
        fecha: firebase.firestore.FieldValue.serverTimestamp(),
        leido: false
      });
      showToast("Reporte enviado. Será revisado por el admin. ✅", "success");
      form.reset();
      modal.style.display = "none";
    } catch (err) {
      console.error("Error enviando queja:", err);
      showToast("Error al enviar reporte", "error");
    }
    setLoading(false);
  });
}


// =============================================
// 📝 REGISTRO DE VENDEDOR — vender.html
// =============================================

function setupRegisterForm() {
  const form = document.getElementById("register-form");
  if (!form) return;

  const fileInput = document.getElementById("profile-photo");
  const preview   = document.getElementById("img-preview");

  if (fileInput && preview) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (file) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const nombre  = form.nombre.value.trim();
      const categoria = form.categoria ? form.categoria.value : "";
      const codPais = form.codigoPais.value;
      const telefono = codPais + form.telefono.value.trim().replace(/\D/g, "");
      const password = form.password ? form.password.value : "";
      const file     = fileInput ? fileInput.files[0] : null;

      if (!nombre || !form.telefono.value.trim() || !categoria) {
        showToast("Completa todos los campos obligatorios", "error");
        setLoading(false);
        return;
      }

      if (!password || password.length < 4) {
        showToast("La contraseña debe tener al menos 4 caracteres", "error");
        setLoading(false);
        return;
      }

      const passwordConfirm = form.passwordConfirm ? form.passwordConfirm.value : "";
      if (password !== passwordConfirm) {
        showToast("Las contraseñas no coinciden", "error");
        setLoading(false);
        return;
      }

      const acceptPolicies = document.getElementById("accept-policies");
      if (acceptPolicies && !acceptPolicies.checked) {
        showToast("Debes aceptar las políticas de uso", "error");
        setLoading(false);
        return;
      }

      let fotoUrl = "";
      if (file) {
        fotoUrl = await uploadImage(file, "perfiles");
      }

      await sellersCol.add({
        nombre,
        telefono,
        password,
        categoria,
        foto: fotoUrl,
        status: "pendiente",
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });

      showToast("¡Solicitud enviada! El admin revisará tu perfil.", "success");
      form.reset();
      if (preview) preview.style.display = "none";

    } catch (err) {
      console.error("Error registrando vendedor:", err);
      showToast("Error al enviar solicitud.", "error");
    }
    setLoading(false);
  });
}


// =============================================
// 👤 PERFIL DE VENDEDOR (público) — perfil.html
// =============================================

async function loadProfile() {
  const params = new URLSearchParams(window.location.search);
  const sellerId = params.get("id");

  if (!sellerId) {
    showToast("Vendedor no encontrado", "error");
    return;
  }

  setLoading(true);

  try {
    const sellerDoc = await sellersCol.doc(sellerId).get();
    if (!sellerDoc.exists) {
      showToast("Vendedor no encontrado", "error");
      setLoading(false);
      return;
    }

    const s = sellerDoc.data();

    const avatar = document.getElementById("profile-avatar");
    const name   = document.getElementById("profile-name");
    const career = document.getElementById("profile-career");
    const bio    = document.getElementById("profile-bio");
    const waBtn  = document.getElementById("profile-wa-btn");

    if (avatar) avatar.src = s.foto || "https://placehold.co/110/e2e8f0/64748b?text=👤";
    if (name)   name.textContent   = s.nombre;
    if (career) career.textContent = `📚 ${s.carrera || ''}`;
    if (bio) {
      bio.textContent = s.descripcion || "";
      bio.style.display = s.descripcion ? "block" : "none";
    }

    if (waBtn && s.telefono) {
      const msg = `Hola ${s.nombre}, te encontré en UBBJ Tienda`;
      waBtn.href = `https://wa.me/${s.telefono}?text=${encodeURIComponent(msg)}`;
      waBtn.style.display = "inline-flex";
    }

    // Sistema de calificación con estrellas
    const ratingContainer = document.getElementById("rating-container");
    if (ratingContainer) {
      const { avg, count } = await getSellerRating(sellerId);
      const buyerId = localStorage.getItem("buyer_id");

      // Mostrar promedio
      ratingContainer.innerHTML = renderStarsReadonly(avg, count);

      // Si es comprador logueado, mostrar estrellas interactivas
      if (buyerId) {
        const { estrellas: myRating } = await getBuyerRating(buyerId, sellerId);
        const interactiveHtml = `
          <div class="rating-action">
            <p class="rating-label">Tu calificación:</p>
            ${renderStarsInteractive(sellerId, myRating)}
          </div>`;
        ratingContainer.insertAdjacentHTML("beforeend", interactiveHtml);

        // Eventos de clic en estrellas
        ratingContainer.querySelectorAll(".star-btn").forEach(btn => {
          btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const value = parseInt(btn.dataset.value);
            try {
              await saveRating(buyerId, sellerId, value);
              // Actualizar UI
              ratingContainer.querySelectorAll(".star-btn").forEach(b => {
                b.classList.toggle("filled", parseInt(b.dataset.value) <= value);
              });
              // Recalcular promedio
              const updated = await getSellerRating(sellerId);
              const displayEl = ratingContainer.querySelector(".stars-display");
              if (displayEl) displayEl.outerHTML = renderStarsReadonly(updated.avg, updated.count);
              showToast("Calificación guardada ⭐", "success");
            } catch (err) {
              console.error("Error guardando calificación:", err);
              showToast("Error al calificar", "error");
            }
          });
        });
      } else {
        ratingContainer.insertAdjacentHTML("beforeend",
          '<p class="rating-login-hint">Inicia sesión como comprador en <a href="ubbjotito.html">Mi Ubbjotito</a> para calificar</p>');
      }
    }

    const prodSnap = await productsCol.where("vendedorId", "==", sellerId).orderBy("creadoEn", "desc").get();
    const grid = document.getElementById("product-grid");

    if (grid) {
      // Filtrar productos ocultos en perfil público
      const visibleProducts = [];
      prodSnap.forEach((doc) => {
        const p = doc.data();
        if (!p.oculto) visibleProducts.push({ id: doc.id, data: p });
      });

      if (visibleProducts.length === 0) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <div class="empty-icon">📦</div>
            <p>Este vendedor aún no ha publicado productos.</p>
          </div>`;
      } else {
        grid.innerHTML = "";
        visibleProducts.forEach((item) => {
          grid.appendChild(createProductCard(item.id, item.data, s));
        });
      }
    }

    // Inicializar carrito
    setupCart(s);

    // Registrar visita al perfil del vendedor
    try {
      await db.collection("visitas_perfil").add({
        vendedorId: sellerId,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch(e) { console.warn("No se pudo registrar visita", e); }

    // Chat comprador-vendedor
    setupProfileChat(sellerId, s);

    // Auto-abrir chat si viene de notificación
    if (params.get('openchat') === '1') {
      const fabBtn = document.getElementById('chat-fab-btn');
      if (fabBtn) setTimeout(() => fabBtn.click(), 500);
    }

  } catch (err) {
    console.error("Error cargando perfil:", err);
    showToast("Error al cargar el perfil", "error");
  }
  setLoading(false);
}

function createProductCard(id, p, seller) {
  const card = document.createElement("div");
  card.className = "product-card";

  card.innerHTML = `
    <img class="card-img" src="${p.imagen || 'https://placehold.co/400x200/e2e8f0/64748b?text=Sin+Imagen'}" alt="${p.nombre}" loading="lazy">
    <div class="card-body">
      <span class="card-price">${formatPrice(p.precio)}</span>
      <h3 class="card-title">${p.nombre}</h3>
      ${p.categoria ? `<span class="card-category-badge">${p.categoria}</span>` : ''}
      <div class="card-meta"><span class="icon">📍</span> ${p.lugar || 'Sin ubicación'}</div>
      ${p.descripcion ? `<p class="card-description">${p.descripcion}</p>` : ""}
    </div>
    <div class="card-footer">
      <div class="qty-controls">
        <button class="qty-btn qty-minus" data-id="${id}">−</button>
        <span class="qty-value" id="qty-${id}">0</span>
        <button class="qty-btn qty-plus" data-id="${id}">+</button>
      </div>
      <button class="btn btn-primary btn-sm add-to-cart-btn" data-id="${id}" data-name="${p.nombre}" data-price="${p.precio}">
        🛒 Agregar
      </button>
    </div>`;

  // Controles de cantidad
  const qtyVal = card.querySelector(`#qty-${id}`);
  card.querySelector(".qty-minus").addEventListener("click", () => {
    let v = parseInt(qtyVal.textContent);
    if (v > 0) { v--; qtyVal.textContent = v; }
    if (v === 0) qtyVal.textContent = "0";
  });
  card.querySelector(".qty-plus").addEventListener("click", () => {
    let v = parseInt(qtyVal.textContent);
    v++;
    qtyVal.textContent = v;
  });

  // Botón agregar al carrito
  card.querySelector(".add-to-cart-btn").addEventListener("click", () => {
    const qty = parseInt(qtyVal.textContent);
    if (qty < 1) {
      showToast("Selecciona al menos 1 unidad", "error");
      return;
    }
    addToCart(id, p.nombre, p.precio, qty);
    qtyVal.textContent = "0";
    trackContact(id, p.nombre, seller.nombre);
  });

  return card;
}

// =============================================
// 🛒 CARRITO — perfil.html
// =============================================

const cart = [];
let currentSeller = null;

function addToCart(id, name, price, qty) {
  const existing = cart.find(item => item.id === id);
  if (existing) {
    existing.qty += qty;
  } else {
    cart.push({ id, name, price: parseFloat(price), qty });
  }
  updateCartUI();
  showToast(`${qty}x ${name} agregado al carrito`, "success");
}

function removeFromCart(id) {
  const idx = cart.findIndex(item => item.id === id);
  if (idx > -1) cart.splice(idx, 1);
  updateCartUI();
}

function updateCartUI() {
  const countEl   = document.getElementById("cart-count");
  const floatEl   = document.getElementById("cart-float");
  const itemsEl   = document.getElementById("cart-items");
  const totalEl   = document.getElementById("cart-total");
  const changeEl  = document.getElementById("cart-change");
  const payInput  = document.getElementById("cart-pay-amount");

  if (!countEl) return;

  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  countEl.textContent = totalItems;
  floatEl.classList.toggle("hidden", totalItems === 0);

  if (itemsEl) {
    if (cart.length === 0) {
      itemsEl.innerHTML = '<li class="cart-empty">Tu carrito está vacío</li>';
    } else {
      itemsEl.innerHTML = cart.map(item => `
        <li class="cart-item">
          <div class="cart-item-info">
            <span class="cart-item-name">${item.name}</span>
            <span class="cart-item-detail">${item.qty} × ${formatPrice(item.price)}</span>
          </div>
          <div class="cart-item-right">
            <span class="cart-item-subtotal">${formatPrice(item.price * item.qty)}</span>
            <button class="cart-item-remove" onclick="removeFromCart('${item.id}')">✕</button>
          </div>
        </li>`).join("");
    }
  }

  if (totalEl) totalEl.textContent = formatPrice(totalPrice);

  // Recalcular cambio
  if (payInput && changeEl) {
    const paid = parseFloat(payInput.value) || 0;
    const change = paid - totalPrice;
    changeEl.textContent = change >= 0 ? formatPrice(change) : "$0.00";
    changeEl.style.color = change < 0 ? "var(--danger)" : "var(--success)";
  }
}

function setupCart(seller) {
  currentSeller = seller;

  const toggleBtn  = document.getElementById("cart-toggle");
  const closeBtn   = document.getElementById("cart-close");
  const panel      = document.getElementById("cart-panel");
  const overlay    = document.getElementById("cart-overlay");
  const payInput   = document.getElementById("cart-pay-amount");
  const sendBtn    = document.getElementById("cart-send-wa");

  if (!toggleBtn) return;

  function openCart()  { panel.classList.add("open"); overlay.classList.add("open"); }
  function closeCart() { panel.classList.remove("open"); overlay.classList.remove("open"); }

  toggleBtn.addEventListener("click", openCart);
  closeBtn.addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);

  if (payInput) {
    payInput.addEventListener("input", () => updateCartUI());
  }

  // Mostrar opción de transferencia si el vendedor la tiene habilitada
  const t = seller.transferencia || {};
  const transferOption = document.getElementById("transfer-option");
  const cashFields     = document.getElementById("cash-fields");
  const transferInfo   = document.getElementById("transfer-info");

  if (t.habilitada && transferOption) {
    transferOption.style.display = "flex";
    // Rellenar datos bancarios
    setText("ti-account", t.cuenta || "—");
    setText("ti-holder", t.titular || "—");
    setText("ti-bank", t.banco || "—");
  }

  // Cambiar entre efectivo y transferencia
  document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
    radio.addEventListener("change", (e) => {
      const method = e.target.value;
      if (cashFields)    cashFields.style.display    = method === "efectivo" ? "block" : "none";
      if (transferInfo)  transferInfo.style.display   = method === "transferencia" ? "block" : "none";
    });
  });

  if (sendBtn) {
    sendBtn.addEventListener("click", async () => {
      if (cart.length === 0) {
        showToast("Agrega productos al carrito primero", "error");
        return;
      }

      // Get buyer info for the message
      let buyerDisplayName = "";
      let buyerDisplayGroup = "";
      const buyerId = localStorage.getItem("buyer_id");
      if (buyerId) {
        try {
          const bDoc = await buyersCol.doc(buyerId).get();
          if (bDoc.exists) {
            const bd = bDoc.data();
            buyerDisplayName = bd.nombre || "";
            buyerDisplayGroup = bd.grupo || "";
          }
        } catch(e) {}
      }

      const totalPrice = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
      const selectedMethod = document.querySelector('input[name="payment-method"]:checked');
      const method = selectedMethod ? selectedMethod.value : "efectivo";

      let msg = `🛒 *Nuevo pedido desde UBBJ Tienda*\n\n`;
      msg += `Hola ${seller.nombre}, quiero pedir:\n\n`;
      if (buyerDisplayName) msg += `👤 *Cliente:* ${buyerDisplayName}\n`;
      if (buyerDisplayGroup) msg += `📋 *Grupo:* ${buyerDisplayGroup}\n\n`;
      cart.forEach(item => {
        msg += `• ${item.qty}x ${item.name} — ${formatPrice(item.price * item.qty)}\n`;
      });
      msg += `\n💰 *Total: ${formatPrice(totalPrice)}*`;

      if (method === "efectivo") {
        const paid = parseFloat(payInput.value) || 0;
        const change = paid - totalPrice;
        msg += `\n\n💵 *Pago: Efectivo*`;
        if (paid > 0) {
          msg += `\n💵 Pago con: ${formatPrice(paid)}`;
          msg += `\n🔄 Cambio: ${change >= 0 ? formatPrice(change) : 'Falta ' + formatPrice(Math.abs(change))}`;
        }
      } else {
        const t = seller.transferencia || {};
        msg += `\n\n🏦 *Pago: Transferencia bancaria*`;
        msg += `\n📋 Datos de la transferencia:`;
        msg += `\n• Cuenta: ${t.cuenta || '—'}`;
        msg += `\n• A nombre de: ${t.titular || '—'}`;
        msg += `\n• Banco: ${t.banco || '—'}`;
        msg += `\n\n📸 *Enviaré la captura de la transferencia por este medio.*`;
        msg += `\n⚠️ *Nota: No entregar el producto hasta recibir la captura de pago. Si no se recibe, favor de comunicarse con el comprador.*`;
      }

      msg += `\n\n¡Gracias!`;

      const waLink = `https://wa.me/${seller.telefono}?text=${encodeURIComponent(msg)}`;
      window.open(waLink, "_blank");

      // Guardar compra en historial del comprador
      savePurchase(seller, [...cart], totalPrice, method);
    });
  }
}

/** Copiar texto al portapapeles */
function copyText(elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const text = el.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Copiado: " + text, "success");
  }).catch(() => {
    // Fallback
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    showToast("Copiado: " + text, "success");
  });
}

function trackContact(productId, productName, vendedor) {
  interactionsCol.add({
    productoId: productId,
    producto: productName,
    vendedor: vendedor,
    fecha: firebase.firestore.FieldValue.serverTimestamp()
  }).catch((e) => console.error("Error registrando interacción:", e));
}

// =============================================
// 🔑 PANEL DEL VENDEDOR — perfilvendedor.html
// =============================================

function setupVendorAuth() {
  const overlay  = document.getElementById("vendor-login-overlay");
  const loginBtn = document.getElementById("vendor-login-btn");
  const phoneIn  = document.getElementById("vendor-phone");
  const passIn   = document.getElementById("vendor-pass");

  if (!overlay) return;

  // Si ya hay sesión activa, cargar directamente
  const savedVendor = localStorage.getItem("vendor_id");
  if (savedVendor) {
    overlay.style.display = "none";
    loadVendorPanel(savedVendor);
    return;
  }

  loginBtn.addEventListener("click", () => vendorLogin());
  passIn.addEventListener("keydown", (e) => { if (e.key === "Enter") vendorLogin(); });

  async function vendorLogin() {
    const phone = phoneIn.value.trim().replace(/\D/g, "");
    const pass  = passIn.value;

    if (!phone || !pass) {
      showToast("Completa ambos campos", "error");
      return;
    }

    setLoading(true);
    try {
      // Buscar vendedor por teléfono (puede terminar en el número ingresado)
      const snap = await sellersCol.where("status", "==", "aprobado").get();
      let foundDoc = null;

      snap.forEach((doc) => {
        const s = doc.data();
        const storedPhone = (s.telefono || "").replace(/\D/g, "");
        if (storedPhone.endsWith(phone) || phone.endsWith(storedPhone) || storedPhone === phone) {
          foundDoc = { id: doc.id, data: s };
        }
      });

      if (!foundDoc) {
        showToast("No se encontró un vendedor aprobado con ese número", "error");
        setLoading(false);
        return;
      }

      // Verificar contraseña
      const vendorPass = foundDoc.data.password || "";
      if (!vendorPass) {
        showToast("No tienes contraseña configurada. Contacta al admin.", "error");
        setLoading(false);
        return;
      }

      if (pass !== vendorPass) {
        showToast("Contraseña incorrecta", "error");
        setLoading(false);
        return;
      }

      localStorage.setItem("vendor_id", foundDoc.id);
      overlay.style.display = "none";
      loadVendorPanel(foundDoc.id);

    } catch (err) {
      console.error("Error en login de vendedor:", err);
      showToast("Error al iniciar sesión", "error");
    }
    setLoading(false);
  }
}

async function loadVendorPanel(sellerId) {
  setLoading(true);

  // Auto-registrar token de notificaciones del vendedor
  if (!localStorage.getItem('sellerNotifEnabled') && 'Notification' in window && Notification.permission !== 'denied') {
    saveSellerNotifToken(sellerId).then(t => {
      if (t) localStorage.setItem('sellerNotifEnabled', 'true');
    }).catch(() => {});
  } else if (localStorage.getItem('sellerNotifEnabled')) {
    // Refrescar token en caso de que haya cambiado
    saveSellerNotifToken(sellerId).catch(() => {});
  }

  try {
    const sellerDoc = await sellersCol.doc(sellerId).get();
    if (!sellerDoc.exists) {
      showToast("Vendedor no encontrado", "error");
      localStorage.removeItem("vendor_id");
      location.reload();
      return;
    }

    const s = sellerDoc.data();

    const avatar = document.getElementById("vp-avatar");
    const name   = document.getElementById("vp-name");
    const career = document.getElementById("vp-career");

    if (avatar) avatar.src = s.foto || "https://placehold.co/110/e2e8f0/64748b?text=👤";
    if (name)   name.textContent   = s.nombre;
    if (career) career.textContent = `📚 ${s.carrera || ''}`;

    // Descripción editable
    const bioInput = document.getElementById("vp-bio");
    const saveBioBtn = document.getElementById("vp-save-bio");
    if (bioInput) bioInput.value = s.descripcion || "";
    if (saveBioBtn) {
      saveBioBtn.onclick = async () => {
        const desc = bioInput.value.trim();
        setLoading(true);
        try {
          await sellersCol.doc(sellerId).update({ descripcion: desc });
          showToast("Descripción guardada ✅", "success");
        } catch (err) {
          console.error("Error guardando descripción:", err);
          showToast("Error al guardar", "error");
        }
        setLoading(false);
      };
    }

    // Cambiar foto de perfil
    const photoInput = document.getElementById("vp-photo-input");
    if (photoInput) {
      photoInput.onchange = async () => {
        const file = photoInput.files[0];
        if (!file) return;
        setLoading(true);
        try {
          const fotoUrl = await uploadImage(file, "perfiles");
          await sellersCol.doc(sellerId).update({ foto: fotoUrl });
          if (avatar) avatar.src = fotoUrl;
          showToast("Foto actualizada ✅", "success");
        } catch (err) {
          console.error("Error actualizando foto:", err);
          showToast("Error al subir la foto", "error");
        }
        setLoading(false);
      };
    }

    // Botón de cerrar sesión
    const logoutBtn = document.getElementById("vp-logout-btn");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("vendor_id");
        location.reload();
      });
    }

    // Configuración de transferencia
    setupTransferConfig(sellerId, s);

    // Configuración de perfil (ocultar + turno)
    setupProfileConfig(sellerId, s);

    // Cargar productos de este vendedor
    const prodSnap = await productsCol.where("vendedorId", "==", sellerId).orderBy("creadoEn", "desc").get();
    const grid = document.getElementById("my-product-grid");

    if (grid) {
      if (prodSnap.empty) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1">
            <div class="empty-icon">📦</div>
            <p>Aún no tienes productos publicados.</p>
          </div>`;
      } else {
        grid.innerHTML = "";
        prodSnap.forEach((doc) => {
          const p = doc.data();
          grid.appendChild(createVendorProductCard(doc.id, p, s));
        });
      }
    }

    // Configurar formulario de añadir producto
    setupAddProductForm(sellerId, s);
    setupEditProductForm();

    // Cargar estadísticas, chat y pedidos del vendedor
    loadVendorStats(sellerId);
    setupVendorChat(sellerId);
    loadVendorOrders(sellerId);

    // Ofrecer activar notificaciones al vendedor
    if (!localStorage.getItem('sellerNotifEnabled') && 'Notification' in window) {
      setTimeout(() => {
        const banner = document.createElement('div');
        banner.id = 'seller-notif-banner';
        banner.innerHTML = `
          <div style="position:fixed;top:80px;left:50%;transform:translateX(-50%);
            background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;
            padding:14px 20px;border-radius:14px;z-index:9999;display:flex;
            align-items:center;gap:12px;box-shadow:0 6px 25px rgba(0,0,0,0.2);
            font-family:'Poppins',sans-serif;max-width:90%;width:400px;
            animation:slideDown .4s ease">
            <span style="font-size:1.5rem">🔔</span>
            <div style="flex:1">
              <strong style="font-size:0.85rem">Activar notificaciones</strong>
              <p style="font-size:0.7rem;margin:2px 0 0;opacity:0.9">
                Recibe alertas cuando te hagan un pedido nuevo
              </p>
            </div>
            <button id="enable-seller-notif" style="background:#fff;color:#16a34a;border:none;
              padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;
              font-size:0.8rem">Activar</button>
            <button id="dismiss-seller-notif" style="background:none;border:none;color:#fff;
              font-size:1.2rem;cursor:pointer">✕</button>
          </div>
        `;
        document.body.appendChild(banner);

        document.getElementById('enable-seller-notif').addEventListener('click', async () => {
          banner.remove();
          await saveSellerNotifToken(sellerId);
          localStorage.setItem('sellerNotifEnabled', 'true');
          showToast('🔔 Notificaciones activadas — recibirás alertas de nuevos pedidos', 'success');
        });

        document.getElementById('dismiss-seller-notif').addEventListener('click', () => {
          banner.remove();
        });
      }, 2000);
    }

    // ===== SUB-MENÚ DE PESTAÑAS =====
    const panelTabs = document.querySelectorAll('.panel-tab');
    const panelPanels = document.querySelectorAll('.panel-tab-content');
    if (panelTabs.length) {
      // Restaurar pestaña activa si hay una guardada
      const savedTab = sessionStorage.getItem('vendorActiveTab');
      if (savedTab) {
        const target = document.getElementById(savedTab);
        if (target) {
          panelTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === savedTab));
          panelPanels.forEach(p => p.classList.toggle('active', p.id === savedTab));
        }
      }
      panelTabs.forEach(tab => {
        tab.addEventListener('click', () => {
          const tabId = tab.dataset.tab;
          panelTabs.forEach(t => t.classList.remove('active'));
          panelPanels.forEach(p => p.classList.remove('active'));
          tab.classList.add('active');
          const panel = document.getElementById(tabId);
          if (panel) panel.classList.add('active');
          sessionStorage.setItem('vendorActiveTab', tabId);
          // Scroll al top del contenido
          window.scrollTo({ top: document.querySelector('.panel-tabs-wrapper')?.offsetTop - 60 || 0, behavior: 'smooth' });
        });
      });
    }

    // Generar QR del perfil público del vendedor
    const qrContainer = document.getElementById("profile-qr");
    const downloadBtn = document.getElementById("download-qr");
    if (qrContainer && typeof QRCode !== "undefined") {
      const profileUrl = `${window.location.origin}/perfil?id=${sellerId}`;
      qrContainer.innerHTML = "";
      new QRCode(qrContainer, {
        text: profileUrl,
        width: 180,
        height: 180,
        colorDark: "#1a1a2e",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
      });

      if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
          const canvas = qrContainer.querySelector("canvas");
          if (canvas) {
            const link = document.createElement("a");
            link.download = `QR-${s.nombre || 'vendedor'}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
          }
        });
      }
    }

  } catch (err) {
    console.error("Error cargando panel vendedor:", err);
    showToast("Error al cargar el panel", "error");
  }
  setLoading(false);
}

function createVendorProductCard(id, p, seller) {
  const card = document.createElement("div");
  card.className = "product-card" + (p.oculto ? " product-hidden" : "");

  card.innerHTML = `
    <img class="card-img" src="${p.imagen || 'https://placehold.co/400x200/e2e8f0/64748b?text=Sin+Imagen'}" alt="${p.nombre}" loading="lazy">
    <div class="card-body">
      <span class="card-price">${formatPrice(p.precio)}</span>
      <h3 class="card-title">${p.nombre}</h3>
      ${p.categoria ? `<span class="card-category-badge">${p.categoria}</span>` : ''}
      <div class="card-meta"><span class="icon">📍</span> ${p.lugar || 'Sin ubicación'}</div>
      ${p.descripcion ? `<p class="card-description">${p.descripcion}</p>` : ""}
      ${p.oculto ? '<span class="badge badge-hidden">👁️ Oculto</span>' : ''}
    </div>
    <div class="card-footer" style="flex-wrap:wrap;gap:0.4rem;">
      <button class="btn btn-secondary btn-sm" onclick="openEditProduct('${id}')">✏️ Editar</button>
      <button class="btn ${p.oculto ? 'btn-primary' : 'btn-warning'} btn-sm" onclick="toggleProductVisibility('${id}', ${!p.oculto})">
        ${p.oculto ? '👁️ Mostrar' : '🛠️ Ocultar'}
      </button>
      <button class="btn btn-danger btn-sm" onclick="deleteProduct('${id}')">🗑 Eliminar</button>
    </div>`;

  return card;
}

// ---- Editar producto ----
async function openEditProduct(productId) {
  try {
    const doc = await productsCol.doc(productId).get();
    if (!doc.exists) { showToast("Producto no encontrado", "error"); return; }
    const p = doc.data();

    document.getElementById("edit-prod-id").value = productId;
    document.getElementById("edit-prod-nombre").value = p.nombre || "";
    document.getElementById("edit-prod-precio").value = p.precio || "";
    document.getElementById("edit-prod-categoria").value = p.categoria || "";
    document.getElementById("edit-prod-descripcion").value = p.descripcion || "";
    document.getElementById("edit-prod-lugar").value = p.lugar || "";

    const preview = document.getElementById("edit-prod-preview");
    if (p.imagen) {
      preview.src = p.imagen;
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }

    // File preview
    const fileInput = document.getElementById("edit-prod-image");
    fileInput.value = "";
    fileInput.onchange = () => {
      const f = fileInput.files[0];
      if (f) { preview.src = URL.createObjectURL(f); preview.style.display = "block"; }
    };

    document.getElementById("edit-product-modal").style.display = "flex";
  } catch (err) {
    console.error("Error abriendo editor:", err);
    showToast("Error al cargar producto", "error");
  }
}

function setupEditProductForm() {
  const form = document.getElementById("edit-product-form");
  const modal = document.getElementById("edit-product-modal");
  if (!form || !modal) return;

  // Cerrar al click fuera
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const productId   = document.getElementById("edit-prod-id").value;
      const nombre      = document.getElementById("edit-prod-nombre").value.trim();
      const precio      = parseFloat(document.getElementById("edit-prod-precio").value);
      const categoria   = document.getElementById("edit-prod-categoria").value;
      const descripcion = document.getElementById("edit-prod-descripcion").value.trim();
      const lugar       = document.getElementById("edit-prod-lugar").value.trim();
      const file        = document.getElementById("edit-prod-image").files[0];

      if (!nombre || !precio || !lugar || !categoria) {
        showToast("Completa los campos obligatorios", "error");
        setLoading(false);
        return;
      }

      const updateData = { nombre, precio, categoria, descripcion, lugar };

      if (file) {
        updateData.imagen = await uploadImage(file, "productos");
      }

      await productsCol.doc(productId).update(updateData);

      showToast("¡Producto actualizado!", "success");
      modal.style.display = "none";

      const vendorId = localStorage.getItem("vendor_id");
      if (vendorId) loadVendorPanel(vendorId);
    } catch (err) {
      console.error("Error actualizando producto:", err);
      showToast("Error al guardar cambios", "error");
    }
    setLoading(false);
  });
}

async function deleteProduct(productId) {
  if (!confirm("¿Eliminar este producto?")) return;
  setLoading(true);
  try {
    await productsCol.doc(productId).delete();
    await metricsDoc.set(
      { productosActivos: firebase.firestore.FieldValue.increment(-1) },
      { merge: true }
    );
    showToast("Producto eliminado", "success");
    const vendorId = localStorage.getItem("vendor_id");
    if (vendorId) loadVendorPanel(vendorId);
  } catch (err) {
    console.error("Error eliminando producto:", err);
    showToast("Error al eliminar", "error");
  }
  setLoading(false);
}

async function toggleProductVisibility(productId, hide) {
  setLoading(true);
  try {
    await productsCol.doc(productId).update({ oculto: hide });
    showToast(hide ? "Producto oculto" : "Producto visible", "success");
    const vendorId = localStorage.getItem("vendor_id");
    if (vendorId) loadVendorPanel(vendorId);
  } catch (err) {
    console.error("Error cambiando visibilidad:", err);
    showToast("Error", "error");
  }
  setLoading(false);
}

/** Formulario para que el vendedor añada productos */
function setupAddProductForm(sellerId, seller) {
  const toggleBtn = document.getElementById("toggle-add-product");
  const formDiv   = document.getElementById("add-product-form");
  const form      = document.getElementById("product-form");

  if (!toggleBtn || !formDiv || !form) return;

  toggleBtn.addEventListener("click", () => {
    formDiv.classList.toggle("open");
    toggleBtn.textContent = formDiv.classList.contains("open") ? "✕ Cancelar" : "➕ Añadir Producto";
  });

  const fileInput = document.getElementById("product-image");
  const preview   = document.getElementById("product-img-preview");

  if (fileInput && preview) {
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      if (file) {
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
      }
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const nombre      = form.nombre.value.trim();
      const precio      = parseFloat(form.precio.value);
      const categoria   = document.getElementById("prod-categoria").value;
      const descripcion = form.descripcion.value.trim();
      const lugar       = form.lugar.value.trim();
      const file        = fileInput ? fileInput.files[0] : null;

      if (!nombre || !precio || !lugar || !categoria) {
        showToast("Completa los campos obligatorios", "error");
        setLoading(false);
        return;
      }

      let imageUrl = "";
      if (file) {
        imageUrl = await uploadImage(file, "productos");
      }

      await productsCol.add({
        nombre,
        precio,
        categoria,
        descripcion,
        lugar,
        vendedorId: sellerId,
        imagen: imageUrl,
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });

      await metricsDoc.set(
        { productosActivos: firebase.firestore.FieldValue.increment(1) },
        { merge: true }
      );

      showToast("¡Producto publicado!", "success");
      form.reset();
      if (preview) preview.style.display = "none";
      formDiv.classList.remove("open");
      toggleBtn.textContent = "➕ Añadir Producto";

      // Recargar productos
      loadVendorPanel(sellerId);

    } catch (err) {
      console.error("Error publicando producto:", err);
      showToast("Error al publicar producto.", "error");
    }
    setLoading(false);
  });
}

/** Configuración de perfil: ocultar + turno + horario */
function setupProfileConfig(sellerId, seller) {
  const hideToggle = document.getElementById("vp-hide-profile");
  const turnoSelect = document.getElementById("vp-turno");
  const horaInicio = document.getElementById("vp-hora-inicio");
  const horaFin = document.getElementById("vp-hora-fin");
  const saveBtn = document.getElementById("vp-save-config");

  if (!hideToggle || !turnoSelect || !saveBtn) return;

  hideToggle.checked = !!seller.oculto;
  turnoSelect.value = seller.turno || "";
  if (horaInicio) horaInicio.value = seller.horaInicio || "";
  if (horaFin) horaFin.value = seller.horaFin || "";

  saveBtn.addEventListener("click", async () => {
    setLoading(true);
    try {
      const updateData = {
        oculto: hideToggle.checked,
        turno: turnoSelect.value
      };
      if (horaInicio) updateData.horaInicio = horaInicio.value;
      if (horaFin) updateData.horaFin = horaFin.value;
      await sellersCol.doc(sellerId).update(updateData);
      showToast("Configuración guardada ✅", "success");
    } catch (err) {
      console.error("Error guardando config:", err);
      showToast("Error al guardar", "error");
    }
    setLoading(false);
  });
}

/** Configuración de transferencia bancaria del vendedor */
function setupTransferConfig(sellerId, seller) {
  const toggle     = document.getElementById("vp-transfer-toggle");
  const statusText = document.getElementById("vp-transfer-status");
  const fields     = document.getElementById("vp-transfer-fields");
  const bankName   = document.getElementById("vp-bank-name");
  const bankAcct   = document.getElementById("vp-bank-account");
  const bankHolder = document.getElementById("vp-bank-holder");
  const saveBtn    = document.getElementById("vp-save-transfer");

  if (!toggle) return;

  // Cargar estado actual
  const t = seller.transferencia || {};
  toggle.checked = !!t.habilitada;
  statusText.textContent = t.habilitada ? "Habilitado" : "Deshabilitado";
  fields.style.display = t.habilitada ? "block" : "none";
  if (bankName)   bankName.value   = t.banco || "";
  if (bankAcct)   bankAcct.value   = t.cuenta || "";
  if (bankHolder) bankHolder.value = t.titular || "";

  toggle.addEventListener("change", () => {
    const on = toggle.checked;
    statusText.textContent = on ? "Habilitado" : "Deshabilitado";
    fields.style.display = on ? "block" : "none";
    if (!on) {
      // Deshabilitar transferencia
      sellersCol.doc(sellerId).update({ "transferencia.habilitada": false })
        .then(() => showToast("Transferencia deshabilitada", "success"))
        .catch(err => { console.error(err); showToast("Error", "error"); });
    }
  });

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const banco   = bankName.value.trim();
      const cuenta  = bankAcct.value.trim();
      const titular = bankHolder.value.trim();

      if (!banco || !cuenta || !titular) {
        showToast("Completa todos los campos bancarios", "error");
        return;
      }

      setLoading(true);
      try {
        await sellersCol.doc(sellerId).update({
          transferencia: {
            habilitada: true,
            banco,
            cuenta,
            titular
          }
        });
        showToast("Datos bancarios guardados ✅", "success");
      } catch (err) {
        console.error("Error guardando datos bancarios:", err);
        showToast("Error al guardar", "error");
      }
      setLoading(false);
    });
  }
}


// =============================================
// 🔐 ADMIN — admin.html
// =============================================

const ADMIN_PASSWORD = "admin123";

function setupAdminAuth() {
  const overlay  = document.getElementById("login-overlay");
  const loginBtn = document.getElementById("login-btn");
  const passIn   = document.getElementById("admin-pass");

  if (!overlay) return;

  if (sessionStorage.getItem("admin_auth")) {
    overlay.style.display = "none";
    loadAdminData();
    return;
  }

  loginBtn.addEventListener("click", () => {
    if (passIn.value === ADMIN_PASSWORD) {
      sessionStorage.setItem("admin_auth", "1");
      overlay.style.display = "none";
      loadAdminData();
    } else {
      showToast("Contraseña incorrecta", "error");
    }
  });

  passIn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });
}

async function loadAdminData() {
  setLoading(true);

  try {
    // Métricas
    const metSnap = await metricsDoc.get();
    const met = metSnap.exists ? metSnap.data() : {};
    setText("stat-visits", met.visitas || 0);

    // Contar productos activos directamente de la colección
    const productsSnap = await productsCol.get();
    setText("stat-products", productsSnap.size);
    // Sincronizar el contador almacenado con el valor real
    if ((met.productosActivos || 0) !== productsSnap.size) {
      metricsDoc.set({ productosActivos: productsSnap.size }, { merge: true });
    }

    // Contar vendedores aprobados
    const approvedSnap = await sellersCol.where("status", "==", "aprobado").get();
    setText("stat-sellers", approvedSnap.size);

    // Interacciones
    const intSnap = await interactionsCol.orderBy("fecha", "desc").limit(50).get();
    setText("stat-interactions", intSnap.size);

    const intList = document.getElementById("interaction-list");
    if (intList) {
      if (intSnap.empty) {
        intList.innerHTML = '<li style="color:var(--text-secondary)">No hay interacciones aún</li>';
      } else {
        intList.innerHTML = "";
        intSnap.forEach((doc) => {
          const d = doc.data();
          const li = document.createElement("li");
          li.innerHTML = `
            <span>
              <span class="interaction-product">${d.producto}</span>
              — vendedor: ${d.vendedor}
            </span>
            <span class="interaction-time">${formatDate(d.fecha)}</span>`;
          intList.appendChild(li);
        });
      }
    }

    // Vendedores pendientes
    const pendSnap = await sellersCol.where("status", "==", "pendiente").orderBy("creadoEn", "desc").get();
    const pendList = document.getElementById("pending-list");
    if (pendList) {
      if (pendSnap.empty) {
        pendList.innerHTML = '<li style="color:var(--text-secondary)">No hay solicitudes pendientes 🎉</li>';
      } else {
        pendList.innerHTML = "";
        pendSnap.forEach((doc) => {
          const s = doc.data();
          const li = document.createElement("li");
          li.className = "pending-item";
          li.innerHTML = `
            <div class="pending-info">
              <img src="${s.foto || 'https://placehold.co/48/e2e8f0/64748b?text=👤'}" alt="">
              <div>
                <div class="name">${s.nombre} <span class="badge badge-pending">Pendiente</span></div>
                <div class="details">📚 ${s.carrera} · 📱 ${s.telefono}</div>
                <div class="details" style="margin-top:0.25rem">🔐 Contraseña: <strong style="color:var(--accent);user-select:all">${s.password || 'Sin contraseña'}</strong></div>
              </div>
            </div>
            <div class="pending-actions">
              <button class="btn btn-success btn-sm" onclick="approveSeller('${doc.id}')">✅ Aprobar</button>
              <button class="btn btn-danger btn-sm" onclick="rejectSeller('${doc.id}')">❌ Rechazar</button>
            </div>`;
          pendList.appendChild(li);
        });
      }
    }

    // Vendedores aprobados
    const sellersList = document.getElementById("approved-sellers-list");
    if (sellersList) {
      if (approvedSnap.empty) {
        sellersList.innerHTML = '<li style="color:var(--text-secondary)">No hay vendedores aprobados</li>';
      } else {
        sellersList.innerHTML = "";
        approvedSnap.forEach((doc) => {
          const s = doc.data();
          const li = document.createElement("li");
          li.className = "pending-item";
          li.innerHTML = `
            <div class="pending-info">
              <img src="${s.foto || 'https://placehold.co/48/e2e8f0/64748b?text=👤'}" alt="">
              <div>
                <div class="name">${s.nombre} <span class="badge badge-approved">Aprobado</span></div>
                <div class="details">📚 ${s.carrera} · 📱 ${s.telefono}</div>
                <div class="details" style="margin-top:0.25rem">🔐 Contraseña: <strong style="color:var(--accent);user-select:all">${s.password || 'Sin contraseña'}</strong></div>
              </div>
            </div>
            <div class="pending-actions">
              <a href="perfil?id=${doc.id}" class="btn btn-primary btn-sm">👁 Ver perfil</a>
              <button class="btn btn-warning btn-sm" onclick="openPasswordModal('${doc.id}', '${(s.password || '').replace(/'/g, "\\'")}')">🔑 Cambiar contraseña</button>
              <button class="btn btn-danger btn-sm" onclick="removeSeller('${doc.id}')">🗑 Eliminar</button>
            </div>`;
          sellersList.appendChild(li);
        });
      }
    }

    // Ubbjotitos registrados
    const buyersList = document.getElementById("buyers-list");
    if (buyersList) {
      try {
        const buyersSnap = await buyersCol.orderBy("creadoEn", "desc").get();
        setText("stat-buyers", buyersSnap.size);
        if (buyersSnap.empty) {
          buyersList.innerHTML = '<li style="color:var(--text-secondary)">No hay ubbjotitos registrados</li>';
        } else {
          buyersList.innerHTML = "";
          buyersSnap.forEach((doc) => {
            const b = doc.data();
            const li = document.createElement("li");
            li.className = "pending-item buyer-item";
            li.setAttribute("data-search", `${(b.nombre || '').toLowerCase()} ${(b.grupo || '').toLowerCase()} ${(b.telefono || '').toLowerCase()}`);
            const fecha = b.creadoEn ? formatDate(b.creadoEn) : 'Sin fecha';
            li.innerHTML = `
              <div class="pending-info">
                <img src="${b.foto || 'https://placehold.co/48/e2e8f0/64748b?text=🐾'}" alt="">
                <div>
                  <div class="name">${b.nombre || 'Sin nombre'} <span class="badge badge-buyer">Ubbjotito</span></div>
                  <div class="details">📚 Grupo: <strong>${b.grupo || 'N/A'}</strong> · 📱 ${b.telefono || 'Sin teléfono'}</div>
                  <div class="details">🎓 ${b.carrera || 'Sin carrera'}</div>
                  <div class="details" style="margin-top:0.25rem;font-size:0.75rem;color:var(--text-secondary)">📅 Registrado: ${fecha}</div>
                </div>
              </div>
              <div class="pending-actions">
                <a href="https://wa.me/52${(b.telefono || '').replace(/\D/g, '')}" target="_blank" class="btn btn-success btn-sm">💬 WhatsApp</a>
                <button class="btn btn-danger btn-sm" onclick="deleteBuyer('${doc.id}')" title="Eliminar cuenta">🗑 Eliminar</button>
              </div>`;
            buyersList.appendChild(li);
          });
        }
      } catch (err) {
        console.error("Error cargando ubbjotitos:", err);
        buyersList.innerHTML = '<li style="color:var(--text-secondary)">Error cargando ubbjotitos</li>';
      }
    }

    // Quejas / Reportes
    const complaintsList = document.getElementById("complaints-list");
    if (complaintsList) {
      try {
        const compSnap = await complaintsCol.orderBy("fecha", "desc").limit(50).get();
        if (compSnap.empty) {
          complaintsList.innerHTML = '<li style="color:var(--text-secondary)">No hay reportes 🎉</li>';
        } else {
          complaintsList.innerHTML = "";
          compSnap.forEach((doc) => {
            const c = doc.data();
            const li = document.createElement("li");
            li.className = "pending-item complaint-item" + (c.leido ? "" : " complaint-new");
            li.innerHTML = `
              <div class="pending-info" style="flex:1">
                <div>
                  <div class="name">⚠️ ${c.asunto} ${!c.leido ? '<span class="badge badge-pending">Nuevo</span>' : ''}</div>
                  <div class="details">Contra: <strong>${c.vendedorNombre}</strong> · ${formatDate(c.fecha)}</div>
                  <div class="complaint-msg">${c.mensaje}</div>
                </div>
              </div>
              <div class="pending-actions">
                ${!c.leido ? `<button class="btn btn-primary btn-sm" onclick="markComplaintRead('${doc.id}')">✅ Marcar leído</button>` : '<span class="badge badge-approved">Leído</span>'}
                <button class="btn btn-danger btn-sm" onclick="deleteComplaint('${doc.id}')">🗑 Eliminar</button>
              </div>`;
            complaintsList.appendChild(li);
          });
        }
      } catch (err) {
        console.error("Error cargando quejas:", err);
        complaintsList.innerHTML = '<li style="color:var(--text-secondary)">Error cargando reportes</li>';
      }
    }

  } catch (err) {
    console.error("Error cargando admin:", err);
    showToast("Error cargando datos", "error");
  }
  setLoading(false);
}

async function approveSeller(id) {
  setLoading(true);
  try {
    await sellersCol.doc(id).update({
      status: "aprobado",
      aprobadoEn: firebase.firestore.FieldValue.serverTimestamp()
    });
    showToast("Vendedor aprobado ✅", "success");
    loadAdminData();
  } catch (err) {
    console.error("Error aprobando:", err);
    showToast("Error al aprobar", "error");
  }
  setLoading(false);
}

async function rejectSeller(id) {
  if (!confirm("¿Rechazar esta solicitud? Se eliminará permanentemente.")) return;
  setLoading(true);
  try {
    await sellersCol.doc(id).delete();
    showToast("Solicitud rechazada", "success");
    loadAdminData();
  } catch (err) {
    console.error("Error rechazando:", err);
    showToast("Error al rechazar", "error");
  }
  setLoading(false);
}

async function removeSeller(id) {
  if (!confirm("¿Eliminar este vendedor y todos sus productos?")) return;
  setLoading(true);
  try {
    // Eliminar productos asociados
    const prods = await productsCol.where("vendedorId", "==", id).get();
    const batch = db.batch();
    prods.forEach(doc => batch.delete(doc.ref));
    batch.delete(sellersCol.doc(id));
    await batch.commit();

    await metricsDoc.set(
      { productosActivos: firebase.firestore.FieldValue.increment(-prods.size) },
      { merge: true }
    );

    showToast("Vendedor eliminado", "success");
    loadAdminData();
  } catch (err) {
    console.error("Error eliminando vendedor:", err);
    showToast("Error al eliminar", "error");
  }
  setLoading(false);
}

// Eliminar Ubbjotito (comprador)
async function deleteBuyer(id) {
  if (!confirm("¿Eliminar esta cuenta de ubbjotito?")) return;
  setLoading(true);
  try {
    await buyersCol.doc(id).delete();
    showToast("Ubbjotito eliminado", "success");
    loadAdminData();
  } catch (err) {
    console.error("Error eliminando ubbjotito:", err);
    showToast("Error al eliminar", "error");
  }
  setLoading(false);
}

// Buscador de ubbjotitos
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("search-buyers");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase().trim();
      document.querySelectorAll("#buyers-list .buyer-item").forEach(item => {
        const searchData = item.getAttribute("data-search") || "";
        item.style.display = searchData.includes(query) ? "" : "none";
      });
    });
  }
});


// =============================================
// � UBBJOTITO — Perfil de comprador
// =============================================

function setupBuyerAuth() {
  const overlay = document.getElementById("buyer-auth-overlay");
  if (!overlay) return;

  // Tabs login/register
  const tabs = overlay.querySelectorAll(".buyer-tab");
  const loginForm = document.getElementById("buyer-login-form");
  const registerForm = document.getElementById("buyer-register-form");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      if (tab.dataset.tab === "login") {
        loginForm.style.display = "block";
        registerForm.style.display = "none";
      } else {
        loginForm.style.display = "none";
        registerForm.style.display = "block";
      }
    });
  });

  // Si ya hay sesión activa
  const savedBuyer = localStorage.getItem("buyer_id");
  if (savedBuyer) {
    overlay.style.display = "none";
    document.getElementById("buyer-profile-section").style.display = "block";
    loadBuyerProfile(savedBuyer);
    return;
  }

  // LOGIN
  const loginBtn = document.getElementById("buyer-login-btn");
  const loginPhone = document.getElementById("buyer-login-phone");
  const loginPass = document.getElementById("buyer-login-pass");

  loginBtn.addEventListener("click", async () => {
    const phone = loginPhone.value.trim().replace(/\D/g, "");
    const pass = loginPass.value;

    if (!phone || !pass) {
      showToast("Completa ambos campos", "error");
      return;
    }

    setLoading(true);
    try {
      const snap = await buyersCol.get();
      let foundDoc = null;

      snap.forEach((doc) => {
        const b = doc.data();
        const storedPhone = (b.telefono || "").replace(/\D/g, "");
        if (storedPhone.endsWith(phone) || phone.endsWith(storedPhone) || storedPhone === phone) {
          foundDoc = { id: doc.id, data: b };
        }
      });

      if (!foundDoc) {
        showToast("No se encontró una cuenta con ese número", "error");
        setLoading(false);
        return;
      }

      if (pass !== foundDoc.data.password) {
        showToast("Contraseña incorrecta", "error");
        setLoading(false);
        return;
      }

      localStorage.setItem("buyer_id", foundDoc.id);
      overlay.style.display = "none";
      document.getElementById("buyer-profile-section").style.display = "block";
      loadBuyerProfile(foundDoc.id);

    } catch (err) {
      console.error("Error en login comprador:", err);
      showToast("Error al iniciar sesión", "error");
    }
    setLoading(false);
  });

  loginPass.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loginBtn.click();
  });

  // REGISTER
  const regForm = document.getElementById("buyer-reg-form");
  regForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const nombre = document.getElementById("buyer-reg-name").value.trim();
      const grupo = document.getElementById("buyer-reg-group").value.trim();
      const codPais = document.getElementById("buyer-reg-code").value;
      const telefono = codPais + document.getElementById("buyer-reg-phone").value.trim().replace(/\D/g, "");
      const pass = document.getElementById("buyer-reg-pass").value;
      const pass2 = document.getElementById("buyer-reg-pass2").value;

      if (!nombre || !grupo || !telefono) {
        showToast("Completa todos los campos", "error");
        setLoading(false);
        return;
      }

      if (!pass || pass.length < 4) {
        showToast("La contraseña debe tener al menos 4 caracteres", "error");
        setLoading(false);
        return;
      }

      if (pass !== pass2) {
        showToast("Las contraseñas no coinciden", "error");
        setLoading(false);
        return;
      }

      const acceptPolicies = document.getElementById("buyer-accept-policies");
      if (acceptPolicies && !acceptPolicies.checked) {
        showToast("Debes aceptar las políticas de uso", "error");
        setLoading(false);
        return;
      }

      // Verificar que no exista ya ese número
      const existSnap = await buyersCol.get();
      let existe = false;
      existSnap.forEach((doc) => {
        const b = doc.data();
        if ((b.telefono || "").replace(/\D/g, "") === telefono.replace(/\D/g, "")) {
          existe = true;
        }
      });

      if (existe) {
        showToast("Ya existe una cuenta con ese número", "error");
        setLoading(false);
        return;
      }

      const docRef = await buyersCol.add({
        nombre,
        grupo,
        telefono,
        password: pass,
        carrera: "Ingeniería y Administración de la Industria Energética",
        foto: "",
        creadoEn: firebase.firestore.FieldValue.serverTimestamp()
      });

      localStorage.setItem("buyer_id", docRef.id);
      overlay.style.display = "none";
      document.getElementById("buyer-profile-section").style.display = "block";
      loadBuyerProfile(docRef.id);
      showToast("¡Cuenta creada! Bienvenido/a 🐾", "success");

    } catch (err) {
      console.error("Error registrando comprador:", err);
      showToast("Error al crear la cuenta", "error");
    }
    setLoading(false);
  });
}

async function loadBuyerProfile(buyerId) {
  setLoading(true);

  // Auto-registrar token de notificaciones del comprador
  if ('Notification' in window && Notification.permission !== 'denied') {
    (async () => {
      try {
        const bSnap = await buyersCol.doc(buyerId).get();
        if (bSnap.exists) {
          const bd = bSnap.data();
          saveClientNotifToken(buyerId, bd.nombre || 'Cliente', bd.telefono || '').catch(() => {});
        }
      } catch(e) {}
    })();
  }

  try {
    const doc = await buyersCol.doc(buyerId).get();
    if (!doc.exists) {
      showToast("Cuenta no encontrada", "error");
      localStorage.removeItem("buyer_id");
      location.reload();
      return;
    }

    const b = doc.data();

    // Llenar datos del perfil
    const avatar = document.getElementById("buyer-avatar");
    const name = document.getElementById("buyer-name");
    const group = document.getElementById("buyer-group");
    const editName = document.getElementById("buyer-edit-name");
    const editGroup = document.getElementById("buyer-edit-group");

    if (avatar) avatar.src = b.foto || "https://placehold.co/110/e2e8f0/64748b?text=🐾";
    if (name) name.textContent = b.nombre;
    if (group) group.textContent = `📋 Grupo: ${b.grupo}`;
    if (editName) editName.value = b.nombre;
    if (editGroup) editGroup.value = b.grupo;

    // Cambiar foto de perfil
    const photoInput = document.getElementById("buyer-photo-input");
    if (photoInput) {
      photoInput.onchange = async () => {
        const file = photoInput.files[0];
        if (!file) return;
        setLoading(true);
        try {
          const fotoUrl = await uploadImage(file, "compradores");
          await buyersCol.doc(buyerId).update({ foto: fotoUrl });
          if (avatar) avatar.src = fotoUrl;
          showToast("Foto actualizada ✅", "success");
        } catch (err) {
          console.error("Error actualizando foto:", err);
          showToast("Error al subir la foto", "error");
        }
        setLoading(false);
      };
    }

    // Guardar cambios del perfil
    const saveBtn = document.getElementById("buyer-save-profile");
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const newName = editName.value.trim();
        const newGroup = editGroup.value.trim();
        if (!newName || !newGroup) {
          showToast("Completa todos los campos", "error");
          return;
        }
        setLoading(true);
        try {
          await buyersCol.doc(buyerId).update({ nombre: newName, grupo: newGroup });
          if (name) name.textContent = newName;
          if (group) group.textContent = `📋 Grupo: ${newGroup}`;
          showToast("Perfil actualizado ✅", "success");
        } catch (err) {
          console.error("Error guardando perfil:", err);
          showToast("Error al guardar", "error");
        }
        setLoading(false);
      };
    }

    // Cerrar sesión
    const logoutBtn = document.getElementById("buyer-logout-btn");
    if (logoutBtn) {
      logoutBtn.onclick = () => {
        localStorage.removeItem("buyer_id");
        location.reload();
      };
    }

    // Cargar historial de compras
    await loadBuyerPurchases(buyerId);

    // Cargar conversaciones abiertas
    loadBuyerChats(buyerId);

  } catch (err) {
    console.error("Error cargando perfil comprador:", err);
    showToast("Error al cargar el perfil", "error");
  }
  setLoading(false);
}

async function loadBuyerPurchases(buyerId) {
  const list = document.getElementById("buyer-purchase-list");
  if (!list) return;

  try {
    const snap = await purchasesCol.where("compradorId", "==", buyerId).get();

    if (snap.empty) {
      list.innerHTML = '<li style="color:var(--text-secondary)">Aún no tienes compras registradas 🛍️</li>';
      return;
    }

    // Sort client-side by fecha desc
    const docs = snap.docs.slice().sort((a, b) => {
      const fa = a.data().fecha ? a.data().fecha.seconds : 0;
      const fb = b.data().fecha ? b.data().fecha.seconds : 0;
      return fb - fa;
    });

    list.innerHTML = "";
    docs.forEach((doc) => {
      const c = doc.data();
      const li = document.createElement("li");
      li.className = "pending-item purchase-item";

      const productos = (c.productos || []).map(p => 
        `<span class="purchase-product-item">• ${p.qty}x ${p.name} — ${formatPrice(p.price * p.qty)}</span>`
      ).join("");

      li.innerHTML = `
        <div class="pending-info" style="flex:1">
          <div>
            <div class="name">🛒 Pedido a <strong>${c.vendedorNombre || 'Vendedor'}</strong></div>
            <div class="details">${formatDate(c.fecha)}</div>
            <div class="purchase-products">${productos}</div>
            <div class="purchase-total">💰 Total: <strong>${formatPrice(c.total)}</strong></div>
            <div class="details">💳 ${c.metodoPago === 'transferencia' ? 'Transferencia' : 'Efectivo'}</div>
          </div>
        </div>`;
      list.appendChild(li);
    });

  } catch (err) {
    console.error("Error cargando compras:", err);
    list.innerHTML = '<li style="color:var(--text-secondary)">Error cargando historial</li>';
  }
}

/** Cargar conversaciones abiertas del comprador en ubbjotito */
let _buyerChatsUnsub = null; // Guardar referencia para desuscribir
function loadBuyerChats(buyerId) {
  const container = document.getElementById('buyer-chats-list');
  if (!container) return;

  // Desuscribir listener anterior si existe
  if (_buyerChatsUnsub) { _buyerChatsUnsub(); _buyerChatsUnsub = null; }

  const vendorCache = {}; // Cache info de vendedores

  // Escuchar mensajes donde este comprador participa
  _buyerChatsUnsub = messagesCol.where('compradorId', '==', buyerId)
    .onSnapshot(function(snap) {
      // SIEMPRE limpiar primero — sincrónico, sin await
      container.innerHTML = '';

      if (snap.empty) {
        container.innerHTML = '<p class="buyer-chats-empty">No tienes conversaciones aún. Visita un vendedor y envíale un mensaje 💬</p>';
        return;
      }

      // Ordenar por fecha desc y agrupar por vendedorId
      const allMsgs = [];
      snap.forEach(function(doc) { allMsgs.push({ id: doc.id, ...doc.data() }); });
      allMsgs.sort(function(a, b) { return (b.fecha ? b.fecha.seconds : 0) - (a.fecha ? a.fecha.seconds : 0); });

      const chatMap = new Map();
      allMsgs.forEach(function(m) {
        if (!chatMap.has(m.vendedorId)) {
          chatMap.set(m.vendedorId, { ...m, docId: m.id });
        }
      });

      chatMap.forEach(function(lastMsg, vendorId) {
        // Contar no leídos
        var unread = 0;
        allMsgs.forEach(function(m) {
          if (m.vendedorId === vendorId && m.from === 'vendedor' && !m.leidoPorComprador) unread++;
        });

        var vendorInfo = vendorCache[vendorId];
        var vendorName = vendorInfo ? vendorInfo.nombre : 'Cargando...';
        var vendorFoto = vendorInfo ? vendorInfo.foto : '';
        var initials = vendorName.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
        var timeStr = lastMsg.fecha ? new Date(lastMsg.fecha.seconds * 1000).toLocaleString('es-MX', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '';
        var previewText = lastMsg.texto || '';
        var isFromMe = lastMsg.from === 'comprador';

        var card = document.createElement('div');
        card.className = 'buyer-chat-card' + (unread > 0 ? ' has-unread' : '');
        card.setAttribute('data-vendor-id', vendorId);
        card.innerHTML =
          '<div class="buyer-chat-avatar">' +
            (vendorFoto ? '<img src="' + vendorFoto + '" alt="' + vendorName + '">' : '<span>' + initials + '</span>') +
          '</div>' +
          '<div class="buyer-chat-info">' +
            '<div class="buyer-chat-top">' +
              '<strong class="buyer-chat-name">' + vendorName + '</strong>' +
              '<span class="buyer-chat-time">' + timeStr + '</span>' +
            '</div>' +
            '<div class="buyer-chat-preview">' +
              (isFromMe ? '<span class="chat-you">Tú:</span> ' : '') +
              (previewText.length > 45 ? previewText.substring(0, 45) + '…' : previewText) +
            '</div>' +
          '</div>' +
          (unread > 0 ? '<span class="buyer-chat-unread">' + unread + '</span>' : '');

        card.addEventListener('click', function() { openBuyerConvPopup(buyerId, vendorId, vendorName); });
        container.appendChild(card);

        // Si no tenemos info del vendedor, cargarla async y actualizar la card in-place
        if (!vendorInfo) {
          sellersCol.doc(vendorId).get().then(function(vDoc) {
            var nombre = 'Vendedor', foto = '';
            if (vDoc.exists) {
              nombre = vDoc.data().nombre || 'Vendedor';
              foto = vDoc.data().foto || '';
            }
            vendorCache[vendorId] = { nombre: nombre, foto: foto };
            // Actualizar la card que ya está en el DOM
            var nameEl = card.querySelector('.buyer-chat-name');
            var avatarEl = card.querySelector('.buyer-chat-avatar');
            if (nameEl) nameEl.textContent = nombre;
            if (avatarEl) {
              var ini = nombre.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
              avatarEl.innerHTML = foto ? '<img src="' + foto + '" alt="' + nombre + '">' : '<span>' + ini + '</span>';
            }
          }).catch(function() {
            vendorCache[vendorId] = { nombre: 'Vendedor', foto: '' };
          });
        }
      });
    });
}

/** Abrir popup de chat desde ubbjotito */
function openBuyerConvPopup(buyerId, vendorId, vendorName) {
  const popup = document.getElementById('buyer-conv-popup');
  const popupName = document.getElementById('buyer-conv-popup-name');
  const msgContainer = document.getElementById('buyer-conv-messages');
  const input = document.getElementById('buyer-conv-input');
  const sendBtn = document.getElementById('buyer-conv-send');
  const closeBtn = document.getElementById('buyer-conv-popup-close');

  if (!popup) return;

  popupName.textContent = vendorName;
  popup.style.display = 'flex';
  msgContainer.innerHTML = '';

  const chatId = buyerId + '_' + vendorId;

  // Obtener nombre del comprador para indicador de typing
  let buyerName = 'Comprador';
  const bnEl = document.getElementById('buyer-name');
  if (bnEl && bnEl.textContent) buyerName = bnEl.textContent;

  // Typing debouncer
  const typingDebouncer = createTypingDebouncer(chatId, buyerId, buyerName);

  // Escuchar typing del vendedor
  const typingListener = listenTypingStatus(chatId, vendorId, msgContainer);

  // Detectar mensajes nuevos vs carga inicial
  let isFirstLoad = true;

  // Real-time listener
  const unsub = messagesCol.where('chatId', '==', chatId)
    .onSnapshot((snap) => {
      // Sonido para mensajes nuevos del vendedor
      if (!isFirstLoad) {
        snap.docChanges().forEach(function(change) {
          if (change.type === 'added' && change.doc.data().from === 'vendedor') {
            playNotificationSound();
          }
        });
      }

      const msgs = [];
      snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => (a.fecha ? a.fecha.seconds : 0) - (b.fecha ? b.fecha.seconds : 0));

      msgContainer.innerHTML = '';
      msgs.forEach(m => {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ' + (m.from === 'comprador' ? 'chat-mine' : 'chat-theirs');
        bubble.textContent = m.texto;
        msgContainer.appendChild(bubble);

        // Marcar como leído
        if (m.from === 'vendedor' && !m.leidoPorComprador) {
          messagesCol.doc(m.id).update({ leidoPorComprador: true });
        }
      });

      // Re-renderizar indicador de typing después de vaciar
      typingListener.renderIndicator();

      msgContainer.scrollTop = msgContainer.scrollHeight;
      isFirstLoad = false;
    }, (err) => console.error('Chat listener error:', err));

  // Send — always read from live DOM element by ID
  function sendMsg() {
    const liveInput = document.getElementById('buyer-conv-input');
    if (!liveInput) return;
    const text = liveInput.value.trim();
    if (!text) return;
    typingDebouncer.stop();
    messagesCol.add({
      chatId,
      compradorId: buyerId,
      vendedorId: vendorId,
      from: 'comprador',
      texto: text,
      leidoPorVendedor: false,
      leidoPorComprador: true,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    liveInput.value = '';
    liveInput.focus();
  }

  // Remove old listeners by cloning
  const newSend = sendBtn.cloneNode(true);
  sendBtn.parentNode.replaceChild(newSend, sendBtn);
  newSend.addEventListener('click', sendMsg);

  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
  newInput.addEventListener('input', function() { typingDebouncer.onInput(); });
  newInput.focus();

  // Close
  const newClose = closeBtn.cloneNode(true);
  closeBtn.parentNode.replaceChild(newClose, closeBtn);
  newClose.addEventListener('click', () => {
    popup.style.display = 'none';
    typingDebouncer.stop();
    typingListener.unsub();
    unsub();
  });
}

/** Guardar una compra en el historial del comprador */
async function savePurchase(seller, cartItems, totalPrice, paymentMethod) {
  const buyerId = localStorage.getItem("buyer_id");
  if (!buyerId) return;

  try {
    // Obtener el id del vendedor para las estadísticas
    const vendorSnap = await sellersCol.where("telefono", "==", seller.telefono).limit(1).get();
    const vendorId = vendorSnap.empty ? "" : vendorSnap.docs[0].id;

    // Obtener datos del comprador para guardarlos en el pedido
    let compradorNombre = "Comprador";
    let compradorGrupo = "";
    let compradorTelefono = "";
    try {
      const buyerDoc = await buyersCol.doc(buyerId).get();
      if (buyerDoc.exists) {
        const bd = buyerDoc.data();
        compradorNombre = bd.nombre || "Comprador";
        compradorGrupo = bd.grupo || "";
        compradorTelefono = bd.telefono || "";
      }
    } catch(e) { console.warn("No se pudo obtener datos del comprador", e); }

    await purchasesCol.add({
      compradorId: buyerId,
      compradorNombre,
      compradorGrupo,
      compradorTelefono,
      vendedorId: vendorId,
      vendedorTelefono: seller.telefono || "",
      vendedorNombre: seller.nombre || "Vendedor",
      productos: cartItems.map(i => ({ name: i.name, price: i.price, qty: i.qty })),
      total: totalPrice,
      metodoPago: paymentMethod,
      estado: "pendiente",
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Efecto confetti al enviar pedido
    if (typeof confetti === "function") {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 } });
    }

    // Guardar/refrescar token de notificaciones push automáticamente
    if ('Notification' in window && Notification.permission !== 'denied') {
      saveClientNotifToken(buyerId, compradorNombre, compradorTelefono).catch(() => {});
    }

  } catch (err) {
    console.error("Error guardando compra:", err);
  }
}



// =============================================
// 📊 ESTADÍSTICAS DEL VENDEDOR
// =============================================

async function loadVendorStats(sellerId) {
  try {
    const visitasSnap = await db.collection('visitas_perfil')
      .where('vendedorId', '==', sellerId).get();
    const totalVisits = visitasSnap.size;
    setText('stat-visits', totalVisits.toString());

    const pedidosSnap = await purchasesCol
      .where('vendedorId', '==', sellerId).get();
    let totalOrders = 0;
    let totalRevenue = 0;
    pedidosSnap.forEach(doc => {
      const d = doc.data();
      const estado = d.estado || 'pendiente';
      if (estado !== 'cancelado') totalOrders++;
      if (estado === 'entregado') totalRevenue += d.total || 0;
    });
    setText('stat-orders', totalOrders.toString());
    setText('stat-revenue', formatPrice(totalRevenue));

    const ratingSnap = await ratingsCol
      .where('vendedorId', '==', sellerId).get();
    let rTotal = 0, rCount = 0;
    ratingSnap.forEach(doc => { rTotal += doc.data().estrellas || 0; rCount++; });
    const avgRating = rCount > 0 ? (rTotal / rCount).toFixed(1) : '0';
    setText('stat-rating', avgRating);

    const now = new Date();
    const days = [];
    const dayCounts = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      days.push(key);
      dayCounts[key] = 0;
    }
    visitasSnap.forEach(doc => {
      const f = doc.data().fecha;
      if (f && f.toDate) {
        const key = f.toDate().toISOString().split('T')[0];
        if (dayCounts[key] !== undefined) dayCounts[key]++;
      }
    });

    const visitsChartEl = document.getElementById('visits-chart');
    if (visitsChartEl && typeof Chart !== 'undefined') {
      new Chart(visitsChartEl, {
        type: 'bar',
        data: {
          labels: days.map(d => { const p = d.split('-'); return p[2] + '/' + p[1]; }),
          datasets: [{
            label: 'Visitas',
            data: days.map(d => dayCounts[d]),
            backgroundColor: 'rgba(201,168,76,0.6)',
            borderColor: '#C9A84C',
            borderWidth: 1,
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, color: 'rgba(255,255,255,0.6)' }, grid: { color: 'rgba(255,255,255,0.08)' } },
            x: { ticks: { color: 'rgba(255,255,255,0.6)' }, grid: { display: false } }
          }
        }
      });
    }

    const ratingBuckets = [0, 0, 0, 0, 0];
    ratingSnap.forEach(doc => {
      const stars = doc.data().estrellas;
      if (stars >= 1 && stars <= 5) ratingBuckets[stars - 1]++;
    });

    const ratingsChartEl = document.getElementById('ratings-chart');
    if (ratingsChartEl && typeof Chart !== 'undefined') {
      new Chart(ratingsChartEl, {
        type: 'doughnut',
        data: {
          labels: ['1 \u2b50', '2 \u2b50', '3 \u2b50', '4 \u2b50', '5 \u2b50'],
          datasets: [{
            data: ratingBuckets,
            backgroundColor: ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e'],
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          plugins: {
            legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.7)', padding: 12, font: { size: 11 } } }
          }
        }
      });
    }
  } catch (err) {
    console.error('Error cargando estad\u00edsticas:', err);
  }
}


// =============================================
// 💬 CHAT INTERNO
// =============================================

function setupProfileChat(sellerId, seller) {
  const fab = document.getElementById('chat-fab');
  const fabBtn = document.getElementById('chat-fab-btn');
  const fabBadge = document.getElementById('chat-fab-badge');
  const popup = document.getElementById('chat-popup');
  const popupClose = document.getElementById('chat-popup-close');
  const popupName = document.getElementById('chat-popup-name');
  const msgContainer = document.getElementById('buyer-chat-messages');
  const input = document.getElementById('buyer-chat-input');
  const sendBtn = document.getElementById('buyer-chat-send');
  const buyerId = localStorage.getItem('buyer_id');

  if (!fab || !buyerId) return;

  // Show the floating bubble
  fab.style.display = 'block';
  if (seller && seller.nombre) {
    popupName.textContent = seller.nombre;
  }

  const chatId = buyerId + '_' + sellerId;
  let isOpen = false;

  // Obtener nombre del comprador para typing
  let buyerName = 'Comprador';
  (async function() {
    try {
      const bDoc = await buyersCol.doc(buyerId).get();
      if (bDoc.exists) buyerName = bDoc.data().nombre || 'Comprador';
    } catch(e) {}
  })();

  // Typing debouncer
  const typingDebouncer = createTypingDebouncer(chatId, buyerId, buyerName);

  // Escuchar typing del vendedor
  const typingListener = listenTypingStatus(chatId, sellerId, msgContainer);

  // Toggle popup
  fabBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    popup.style.display = isOpen ? 'flex' : 'none';
    if (isOpen) {
      input.focus();
      // Mark messages as read when opening
      fabBadge.style.display = 'none';
      fabBadge.textContent = '0';
    }
  });

  popupClose.addEventListener('click', () => {
    isOpen = false;
    popup.style.display = 'none';
    typingDebouncer.stop();
  });

  // Listen to messages in real-time
  let unreadCount = 0;
  let isFirstLoad = true;
  messagesCol.where('chatId', '==', chatId)
    .onSnapshot((snap) => {
      // Sonido para mensajes nuevos del vendedor
      if (!isFirstLoad) {
        snap.docChanges().forEach(function(change) {
          if (change.type === 'added' && change.doc.data().from === 'vendedor') {
            playNotificationSound();
          }
        });
      }

      // Sort client-side by fecha
      const msgs = [];
      snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
      msgs.sort((a, b) => {
        const fa = a.fecha ? a.fecha.seconds : 0;
        const fb = b.fecha ? b.fecha.seconds : 0;
        return fa - fb;
      });

      msgContainer.innerHTML = '';
      unreadCount = 0;
      if (msgs.length === 0) {
        msgContainer.innerHTML = '<p class="chat-empty">\u00a1Inicia la conversaci\u00f3n! \ud83d\udc4b</p>';
        isFirstLoad = false;
        return;
      }
      msgs.forEach(m => {
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble ' + (m.from === 'comprador' ? 'chat-mine' : 'chat-theirs');
        bubble.textContent = m.texto;
        msgContainer.appendChild(bubble);

        // Count unread from vendor
        if (m.from === 'vendedor' && !m.leidoPorComprador) {
          unreadCount++;
          if (isOpen) {
            messagesCol.doc(m.id).update({ leidoPorComprador: true });
          }
        }
      });
      msgContainer.scrollTop = msgContainer.scrollHeight;

      // Re-renderizar indicador de typing
      typingListener.renderIndicator();

      // Update badge
      if (!isOpen && unreadCount > 0) {
        fabBadge.textContent = unreadCount;
        fabBadge.style.display = 'flex';
      } else {
        fabBadge.style.display = 'none';
      }
      isFirstLoad = false;
    }, (err) => {
      console.error('Chat listener error:', err);
    });

  function sendMsg() {
    const text = input.value.trim();
    if (!text) return;
    typingDebouncer.stop();
    messagesCol.add({
      chatId: chatId,
      compradorId: buyerId,
      vendedorId: sellerId,
      from: 'comprador',
      texto: text,
      leidoPorVendedor: false,
      leidoPorComprador: true,
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
    input.value = '';
  }

  sendBtn.addEventListener('click', sendMsg);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMsg(); });
  input.addEventListener('input', function() { typingDebouncer.onInput(); });
}
function setupVendorChat(sellerId) {
  const headsContainer = document.getElementById('vendor-chat-heads');
  const popup = document.getElementById('vendor-chat-popup');
  const popupName = document.getElementById('vendor-chat-popup-name');
  const msgContainer = document.getElementById('vendor-chat-messages');
  const input = document.getElementById('vendor-chat-input');
  const sendBtn = document.getElementById('vendor-chat-send');
  const closeBtn = document.getElementById('vendor-chat-popup-close');
  const minimizeBtn = document.getElementById('vendor-chat-minimize');

  if (!headsContainer) return;

  let activeChat = null;
  let activeUnsub = null;
  let activeTypingDebouncer = null;
  let activeTypingListener = null;

  // Obtener nombre del vendedor para typing
  let sellerName = 'Vendedor';
  (async function() {
    try {
      const sDoc = await sellersCol.doc(sellerId).get();
      if (sDoc.exists) sellerName = sDoc.data().nombre || 'Vendedor';
    } catch(e) {}
  })();

  // Close popup
  if (closeBtn) closeBtn.addEventListener('click', () => {
    popup.style.display = 'none';
    if (activeUnsub) { activeUnsub(); activeUnsub = null; }
    if (activeTypingDebouncer) { activeTypingDebouncer.stop(); activeTypingDebouncer = null; }
    if (activeTypingListener) { activeTypingListener.unsub(); activeTypingListener = null; }
    activeChat = null;
    // Remove active state from heads
    headsContainer.querySelectorAll('.chat-head').forEach(h => h.classList.remove('active'));
  });

  // Minimize popup
  if (minimizeBtn) minimizeBtn.addEventListener('click', () => {
    popup.style.display = 'none';
  });

  // Listen for all messages to this vendor
  let isFirstVendorLoad = true;
  const buyerCache = {};
  messagesCol.where('vendedorId', '==', sellerId)
    .onSnapshot(function(snap) {
      // Sonido para mensajes nuevos del comprador
      if (!isFirstVendorLoad) {
        snap.docChanges().forEach(function(change) {
          if (change.type === 'added' && change.doc.data().from === 'comprador') {
            playNotificationSound();
          }
        });
      }

      const chats = {};
      let totalUnread = 0;

      // Sort desc by fecha for grouping (latest first)
      const allMsgs = [];
      snap.forEach(function(doc) { allMsgs.push({ id: doc.id, ...doc.data() }); });
      allMsgs.sort(function(a, b) { return (b.fecha ? b.fecha.seconds : 0) - (a.fecha ? a.fecha.seconds : 0); });

      allMsgs.forEach(function(m) {
        if (!chats[m.chatId]) {
          chats[m.chatId] = { compradorId: m.compradorId, lastMsg: m, unread: 0 };
        }
        if (m.from === 'comprador' && !m.leidoPorVendedor) {
          chats[m.chatId].unread++;
          totalUnread++;
        }
      });

      // Update page title
      if (totalUnread > 0) {
        document.title = '(' + totalUnread + ') UBBJ Tienda \u2014 Panel';
      } else {
        document.title = 'UBBJ Tienda \u2014 Panel del Vendedor';
      }

      // Build chat heads — sincrónico, sin await
      const chatIds = Object.keys(chats);
      headsContainer.innerHTML = '';

      for (var i = 0; i < Math.min(chatIds.length, 8); i++) {
        (function(cid) {
          const chat = chats[cid];
          const cachedName = buyerCache[chat.compradorId];
          const buyerName = cachedName || 'Comprador';

          const head = document.createElement('div');
          head.className = 'chat-head' + (chat.unread > 0 ? ' has-unread' : '') + (activeChat === cid ? ' active' : '');

          const initials = buyerName.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
          head.innerHTML = '<span>' + initials + '</span>' +
            '<span class="chat-head-name">' + buyerName + '</span>' +
            (chat.unread > 0 ? '<span class="chat-head-badge">' + chat.unread + '</span>' : '');

          head.addEventListener('click', function() {
            var currentName = buyerCache[chat.compradorId] || buyerName;
            openVendorChatPopup(sellerId, chat.compradorId, cid, currentName);
            headsContainer.querySelectorAll('.chat-head').forEach(function(h) { h.classList.remove('active'); });
            head.classList.add('active');
          });

          headsContainer.appendChild(head);

          // Si no hay cache, cargar async y actualizar in-place
          if (!cachedName) {
            buyersCol.doc(chat.compradorId).get().then(function(bDoc) {
              var nombre = bDoc.exists ? (bDoc.data().nombre || 'Comprador') : 'Comprador';
              buyerCache[chat.compradorId] = nombre;
              var nameEl = head.querySelector('.chat-head-name');
              if (nameEl) nameEl.textContent = nombre;
              var ini = nombre.split(' ').map(function(w) { return w[0]; }).join('').substring(0, 2).toUpperCase();
              var spanEl = head.querySelector('span');
              if (spanEl) spanEl.textContent = ini;
            }).catch(function() { buyerCache[chat.compradorId] = 'Comprador'; });
          }
        })(chatIds[i]);
      }

      isFirstVendorLoad = false;
    });

  function openVendorChatPopup(vendorId, buyerId, chatId, buyerName) {
    if (!popup) return;
    activeChat = chatId;

    popupName.textContent = buyerName;
    popup.style.display = 'flex';

    // Limpiar listeners anteriores
    if (activeUnsub) activeUnsub();
    if (activeTypingDebouncer) { activeTypingDebouncer.stop(); activeTypingDebouncer = null; }
    if (activeTypingListener) { activeTypingListener.unsub(); activeTypingListener = null; }

    // Typing: vendedor escribe, comprador ve
    activeTypingDebouncer = createTypingDebouncer(chatId, vendorId, sellerName);
    activeTypingListener = listenTypingStatus(chatId, buyerId, msgContainer);

    let isFirstPopupLoad = true;

    activeUnsub = messagesCol.where('chatId', '==', chatId)
      .onSnapshot((snap) => {
        // Sonido para mensajes nuevos del comprador en chat abierto
        if (!isFirstPopupLoad) {
          snap.docChanges().forEach(function(change) {
            if (change.type === 'added' && change.doc.data().from === 'comprador') {
              playNotificationSound();
            }
          });
        }

        const msgs = [];
        snap.forEach(doc => msgs.push({ id: doc.id, ...doc.data() }));
        msgs.sort((a, b) => (a.fecha ? a.fecha.seconds : 0) - (b.fecha ? b.fecha.seconds : 0));

        msgContainer.innerHTML = '';
        msgs.forEach(m => {
          const bubble = document.createElement('div');
          bubble.className = 'chat-bubble ' + (m.from === 'vendedor' ? 'chat-mine' : 'chat-theirs');
          bubble.textContent = m.texto;
          msgContainer.appendChild(bubble);
          // Mark as read
          if (m.from === 'comprador' && !m.leidoPorVendedor) {
            messagesCol.doc(m.id).update({ leidoPorVendedor: true });
          }
        });
        // Re-renderizar indicador de typing
        if (activeTypingListener) activeTypingListener.renderIndicator();

        msgContainer.scrollTop = msgContainer.scrollHeight;
        isFirstPopupLoad = false;
      }, (err) => console.error('Vendor chat listener error:', err));

    function sendMsg() {
      const text = input.value.trim();
      if (!text) return;
      if (activeTypingDebouncer) activeTypingDebouncer.stop();
      messagesCol.add({
        chatId: chatId,
        compradorId: buyerId,
        vendedorId: vendorId,
        from: 'vendedor',
        texto: text,
        leidoPorVendedor: true,
        leidoPorComprador: false,
        fecha: firebase.firestore.FieldValue.serverTimestamp()
      });
      input.value = '';
    }

    sendBtn.onclick = sendMsg;
    input.onkeydown = (e) => { if (e.key === 'Enter') sendMsg(); };
    input.oninput = function() { if (activeTypingDebouncer) activeTypingDebouncer.onInput(); };
    input.focus();
  }
}

// Standalone openVendorChatModal kept for backward compat
function openVendorChatModal() {}


// =============================================
// \ud83d\udccb PEDIDOS PENDIENTES DEL VENDEDOR
// =============================================

async function loadVendorOrders(sellerId) {
  const ordersList = document.getElementById('vendor-orders-list');
  const historyList = document.getElementById('vendor-orders-history');
  const badge = document.getElementById('orders-pending-badge');
  const historyBadge = document.getElementById('history-count-badge');
  const historyToggle = document.getElementById('toggle-history-btn');
  const historyArrow = document.getElementById('history-arrow');
  if (!ordersList) return;

  // Toggle history visibility
  if (historyToggle && historyList) {
    historyToggle.addEventListener('click', () => {
      const isHidden = historyList.style.display === 'none';
      historyList.style.display = isHidden ? 'flex' : 'none';
      if (historyArrow) historyArrow.textContent = isHidden ? '\u25b2' : '\u25bc';
    });
  }

  purchasesCol.where('vendedorId', '==', sellerId)
    .onSnapshot(async (snap) => {
      ordersList.innerHTML = '';
      if (historyList) historyList.innerHTML = '';
      let pendingCount = 0;
      let historyCount = 0;

      if (snap.empty) {
        ordersList.innerHTML = '<p class="empty-orders-msg">No tienes pedidos pendientes \ud83c\udf89</p>';
        if (historyList) historyList.innerHTML = '<p class="empty-orders-msg">No hay pedidos en el historial</p>';
        if (badge) badge.style.display = 'none';
        if (historyBadge) historyBadge.textContent = '0';
        return;
      }

      // Sort client-side by fecha desc
      const docs = snap.docs.slice().sort((a, b) => {
        const fa = a.data().fecha ? a.data().fecha.seconds : 0;
        const fb = b.data().fecha ? b.data().fecha.seconds : 0;
        return fb - fa;
      });

      for (const doc of docs) {
        const order = doc.data();
        const estado = order.estado || 'pendiente';
        const isPending = estado === 'pendiente';
        if (isPending) pendingCount++;
        else historyCount++;

        // Get buyer info — prefer stored data, fallback to fetching
        let buyerName = order.compradorNombre || 'Comprador';
        let buyerGroup = order.compradorGrupo || '';
        let buyerPhone = order.compradorTelefono || '';
        if (!order.compradorNombre && order.compradorId) {
          try {
            const bDoc = await buyersCol.doc(order.compradorId).get();
            if (bDoc.exists) {
              const bd = bDoc.data();
              buyerName = bd.nombre || 'Comprador';
              buyerGroup = bd.grupo || '';
              buyerPhone = bd.telefono || '';
            }
          } catch(e) {}
        }

        // Format date
        let dateStr = '';
        if (order.fecha && order.fecha.toDate) {
          const d = order.fecha.toDate();
          dateStr = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }) + ' ' +
                    d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        }

        const card = document.createElement('div');
        card.className = 'order-card order-' + estado;

        let itemsHtml = '';
        if (order.productos && Array.isArray(order.productos)) {
          order.productos.forEach(p => {
            itemsHtml += '<li><span>' + p.qty + 'x ' + p.name + '</span><span>' + formatPrice(p.price * p.qty) + '</span></li>';
          });
        }

        const payIcon = order.metodoPago === 'transferencia' ? '🏦' : '💵';
        const statusLabel = estado === 'pendiente' ? '⏳ PENDIENTE' : estado === 'entregado' ? '✅ ENTREGADO' : '❌ CANCELADO';

        // Build buyer info line
        let buyerInfoHtml = '';
        if (buyerGroup) buyerInfoHtml += '<span class="order-buyer-detail">📋 ' + buyerGroup + '</span>';
        if (buyerPhone) buyerInfoHtml += '<span class="order-buyer-detail">📱 ' + buyerPhone + '</span>';

        card.innerHTML =
          '<div class="order-header">' +
            '<div class="order-buyer-info">' +
              '<span class="order-buyer">👤 ' + buyerName + '</span>' +
              (buyerInfoHtml ? '<div class="order-buyer-details">' + buyerInfoHtml + '</div>' : '') +
            '</div>' +
            '<span class="order-date">' + dateStr + '</span>' +
          '</div>' +
          '<ul class="order-items">' + itemsHtml + '</ul>' +
          '<div class="order-footer">' +
            '<span class="order-total">' + payIcon + ' ' + formatPrice(order.total || 0) + '</span>' +
            '<span class="order-status-badge ' + estado + '">' + statusLabel + '</span>' +
          '</div>' +
          (isPending ?
            '<div class="order-actions">' +
              '<button class="order-btn order-btn-complete" data-id="' + doc.id + '">✅ Marcar entregado</button>' +
              '<button class="order-btn order-btn-cancel" data-id="' + doc.id + '">❌ Cancelar</button>' +
            '</div>' : '') +
          (buyerPhone ?
            '<div class="order-actions">' +
              '<a class="order-btn order-btn-contact" href="https://wa.me/' + buyerPhone + '?text=' + encodeURIComponent('Hola ' + buyerName + ', sobre tu pedido en UBBJ Tienda...') + '" target="_blank" rel="noopener">💬 Contactar cliente</a>' +
            '</div>' : '');

        // Add event listeners for buttons
        card.querySelectorAll('.order-btn-complete').forEach(btn => {
          btn.addEventListener('click', async () => {
            await purchasesCol.doc(btn.dataset.id).update({ estado: 'entregado' });
          });
        });
        card.querySelectorAll('.order-btn-cancel').forEach(btn => {
          btn.addEventListener('click', async () => {
            if (confirm('\u00bfCancelar este pedido?')) {
              await purchasesCol.doc(btn.dataset.id).update({ estado: 'cancelado' });
            }
          });
        });

        // Append to the right list
        if (isPending) {
          ordersList.appendChild(card);
        } else if (historyList) {
          historyList.appendChild(card);
        }
      }

      // Show empty messages if needed
      if (pendingCount === 0) {
        ordersList.innerHTML = '<p class="empty-orders-msg">No tienes pedidos pendientes \ud83c\udf89</p>';
      }
      if (historyCount === 0 && historyList) {
        historyList.innerHTML = '<p class="empty-orders-msg">No hay pedidos en el historial</p>';
      }

      // Update badges
      if (badge) {
        badge.textContent = pendingCount;
        badge.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
      }
      if (historyBadge) {
        historyBadge.textContent = historyCount;
      }
    });
}


// =============================================
// � PWA INSTALL PROMPT
// =============================================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // No mostrar si el usuario ya lo cerró recientemente (7 días)
  const dismissed = localStorage.getItem('pwa-install-dismissed');
  if (dismissed && (Date.now() - parseInt(dismissed, 10)) < 7 * 24 * 60 * 60 * 1000) return;

  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'block';
});

document.addEventListener('click', (e) => {
  if (e.target.id === 'pwa-install-btn' || e.target.closest('#pwa-install-btn')) {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') {
        console.log('✅ PWA instalada');
      }
      deferredPrompt = null;
      const banner = document.getElementById('pwa-install-banner');
      if (banner) banner.style.display = 'none';
    });
  }

  if (e.target.id === 'pwa-install-close' || e.target.closest('#pwa-install-close')) {
    const banner = document.getElementById('pwa-install-banner');
    if (banner) banner.style.display = 'none';
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }
});

window.addEventListener('appinstalled', () => {
  console.log('✅ UBBJ Tienda instalada como PWA');
  const banner = document.getElementById('pwa-install-banner');
  if (banner) banner.style.display = 'none';
  deferredPrompt = null;
});

// =============================================
// �🚀 INICIALIZACIÓN
// =============================================

document.addEventListener("DOMContentLoaded", () => {
  trackVisit();

  // ---- PWA: Registrar Service Worker único ----
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/firebase-messaging-sw.js").catch((err) =>
      console.warn("SW registro falló:", err)
    );
  }

  // Menú hamburguesa mobile
  const toggle = document.getElementById("menu-toggle");
  const navLinks = document.getElementById("nav-links");
  if (toggle && navLinks) {
    toggle.addEventListener("click", () => navLinks.classList.toggle("open"));
    navLinks.querySelectorAll("a").forEach((a) =>
      a.addEventListener("click", () => navLinks.classList.remove("open"))
    );
  }

  const page = document.body.getAttribute("data-page");

  // Splash screen para catálogo — efecto cortina
  if (page === "catalogo") {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      setTimeout(() => {
        splash.classList.add("split-open");
        // Eliminar del DOM cuando la transición termine
        splash.querySelector(".splash-left").addEventListener("transitionend", () => splash.remove(), { once: true });
      }, 1200);
    }
  }

  switch (page) {
    case "catalogo":
      loadSellers();
      setupSellerSearch();
      setupHowModal();
      setupComplaintModal();
      break;
    case "vender":
      setupRegisterForm();
      break;
    case "perfil":
      loadProfile();
      break;
    case "perfilvendedor":
      setupVendorAuth();
      break;
    case "admin":
      setupAdminAuth();
      break;
    case "ubbjotito":
      setupBuyerAuth();
      break;
  }
});


// =============================================
// ⚠️ GESTIÓN DE QUEJAS — admin
// =============================================

async function markComplaintRead(id) {
  try {
    await complaintsCol.doc(id).update({ leido: true });
    showToast("Marcado como leído", "success");
    loadAdminData();
  } catch (err) {
    console.error("Error:", err);
    showToast("Error al actualizar", "error");
  }
}

async function deleteComplaint(id) {
  if (!confirm("¿Eliminar este reporte?")) return;
  try {
    await complaintsCol.doc(id).delete();
    showToast("Reporte eliminado", "success");
    loadAdminData();
  } catch (err) {
    console.error("Error:", err);
    showToast("Error al eliminar", "error");
  }
}


// =============================================
// 🔑 GESTIÓN DE CONTRASEÑAS — admin
// =============================================

function openPasswordModal(sellerId, currentPass) {
  // Eliminar modal previo si existe
  const existing = document.getElementById("password-modal");
  if (existing) existing.remove();

  const modal = document.createElement("div");
  modal.id = "password-modal";
  modal.className = "login-overlay";
  modal.style.display = "flex";
  modal.innerHTML = `
    <div class="login-box">
      <h2>🔑 Contraseña del vendedor</h2>
      <p style="margin-bottom:0.5rem">Asigna o cambia la contraseña que el vendedor usará para acceder a su panel.</p>
      <input type="text" id="modal-pass-input" placeholder="Nueva contraseña" value="${currentPass}">
      <div style="display:flex;gap:0.5rem;margin-top:0.75rem">
        <button class="btn btn-primary" onclick="saveVendorPassword('${sellerId}')" style="flex:1">💾 Guardar</button>
        <button class="btn btn-outline" onclick="closePasswordModal()" style="flex:1">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function closePasswordModal() {
  const modal = document.getElementById("password-modal");
  if (modal) modal.remove();
}

async function saveVendorPassword(sellerId) {
  const input = document.getElementById("modal-pass-input");
  const newPass = input ? input.value.trim() : "";

  if (!newPass) {
    showToast("La contraseña no puede estar vacía", "error");
    return;
  }

  setLoading(true);
  try {
    await sellersCol.doc(sellerId).update({ password: newPass });
    showToast("Contraseña guardada ✅", "success");
    closePasswordModal();
    loadAdminData();
  } catch (err) {
    console.error("Error guardando contraseña:", err);
    showToast("Error al guardar", "error");
  }
  setLoading(false);
}
