const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Helper para enviar notificaciones y limpiar tokens inválidos
// Usa mensajes data-only para control total del display en el SW
async function sendPushNotification(tokensSnap, title, body, dataPayload = {}) {
  const tokens = tokensSnap.docs.map(doc => doc.data().token).filter(Boolean);
  if (tokens.length === 0) return;

  console.log(`📨 Enviando notificación a ${tokens.length} dispositivo(s)`);

  // Enviar como data-only (sin notification field) para que
  // firebase-messaging-sw.js maneje todo y podamos controlar el click
  const response = await admin.messaging().sendEachForMulticast({
    data: {
      title,
      body,
      ...dataPayload
    },
    webpush: {
      headers: { Urgency: 'high' }
    },
    tokens
  });

  console.log(`✅ Enviadas: ${response.successCount}/${tokens.length}`);

  // Limpiar tokens inválidos
  const batch = db.batch();
  let cleaned = 0;
  response.responses.forEach((resp, i) => {
    if (!resp.success) {
      const tokenDoc = tokensSnap.docs.find(d => d.data().token === tokens[i]);
      if (tokenDoc) { batch.delete(tokenDoc.ref); cleaned++; }
    }
  });
  if (cleaned > 0) await batch.commit();
}

// =============================================
// 🔔 NOTIFICAR AL CLIENTE cuando su pedido cambia de estado
// =============================================
exports.notifyClientOnOrderUpdate = functions.firestore
  .document('compras/{purchaseId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.estado === after.estado) return null;

    let title, body;
    if (after.estado === 'entregado') {
      title = '✅ ¡Tu pedido está listo!';
      body = `Tu pedido de $${after.total || 0} está listo. ¡Pasa a recogerlo!`;
    } else if (after.estado === 'cancelado') {
      title = '❌ Pedido cancelado';
      body = `Tu pedido con ${after.vendedorNombre || 'el vendedor'} ha sido cancelado.`;
    } else {
      return null;
    }

    const compradorId = after.compradorId || '';
    if (!compradorId) return null;

    const tokensSnap = await db.collection('notifTokens')
      .where('tipo', '==', 'comprador')
      .where('compradorId', '==', compradorId)
      .get();

    if (tokensSnap.empty) return null;
    await sendPushNotification(tokensSnap, title, body, { url: 'https://ubbjtienda.vercel.app/ubbjotito' });
    return null;
  });

// =============================================
// 🔔 NOTIFICAR AL VENDEDOR cuando recibe un pedido nuevo
// =============================================
exports.notifySellerOnNewOrder = functions.firestore
  .document('compras/{purchaseId}')
  .onCreate(async (snap, context) => {
    const order = snap.data();
    const vendedorId = order.vendedorId || '';
    if (!vendedorId) return null;

    const items = (order.productos || []).map(i => `${i.qty}x ${i.name}`).join(', ');
    const title = '🛒 ¡Nuevo pedido!';
    const body = `${order.compradorNombre || 'Un cliente'} pidió: ${items} — $${order.total || 0}`;

    const tokensSnap = await db.collection('notifTokens')
      .where('tipo', '==', 'vendedor')
      .where('vendedorId', '==', vendedorId)
      .get();

    if (tokensSnap.empty) return null;
    await sendPushNotification(tokensSnap, title, body, { url: 'https://ubbjtienda.vercel.app/perfilvendedor' });
    return null;
  });

// =============================================
// 💬 NOTIFICAR cuando alguien envía un MENSAJE en el chat
// =============================================
exports.notifyOnNewMessage = functions.firestore
  .document('mensajes/{messageId}')
  .onCreate(async (snap, context) => {
    const msg = snap.data();
    const from = msg.from; // 'comprador' o 'vendedor'
    const texto = msg.texto || '';

    if (!from || !texto) return null;

    let targetType, targetId, senderName;

    if (from === 'comprador') {
      // Comprador envió → notificar al vendedor
      targetType = 'vendedor';
      targetId = msg.vendedorId || '';
      try {
        const buyerDoc = await db.collection('compradores').doc(msg.compradorId || '').get();
        senderName = buyerDoc.exists ? buyerDoc.data().nombre : 'Un cliente';
      } catch(e) { senderName = 'Un cliente'; }
    } else if (from === 'vendedor') {
      // Vendedor envió → notificar al comprador
      targetType = 'comprador';
      targetId = msg.compradorId || '';
      try {
        const sellerDoc = await db.collection('vendedores').doc(msg.vendedorId || '').get();
        senderName = sellerDoc.exists ? sellerDoc.data().nombre : 'Un vendedor';
      } catch(e) { senderName = 'Un vendedor'; }
    } else {
      return null;
    }

    if (!targetId) return null;

    const tokenField = targetType === 'vendedor' ? 'vendedorId' : 'compradorId';
    const tokensSnap = await db.collection('notifTokens')
      .where('tipo', '==', targetType)
      .where(tokenField, '==', targetId)
      .get();

    if (tokensSnap.empty) return null;

    const title = `💬 Mensaje de ${senderName}`;
    const body = texto.length > 100 ? texto.substring(0, 100) + '...' : texto;

    // Construir URL para abrir la conversación al hacer clic
    let chatUrl = 'https://ubbjtienda.vercel.app/';
    if (from === 'comprador') {
      // El vendedor recibe la notif → abrir su panel
      chatUrl = 'https://ubbjtienda.vercel.app/perfilvendedor';
    } else if (from === 'vendedor') {
      // El comprador recibe la notif → abrir perfil del vendedor con chat
      const vendedorId = msg.vendedorId || '';
      if (vendedorId) {
        chatUrl = `https://ubbjtienda.vercel.app/perfil?id=${vendedorId}&openchat=1`;
      }
    }

    await sendPushNotification(tokensSnap, title, body, { url: chatUrl });
    return null;
  });
