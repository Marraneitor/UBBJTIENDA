const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// Helper para enviar notificaciones y limpiar tokens inválidos
async function sendPushNotification(tokensSnap, title, body, dataPayload = {}) {
  const tokens = tokensSnap.docs.map(doc => doc.data().token).filter(Boolean);
  if (tokens.length === 0) return;

  console.log(`📨 Enviando notificación a ${tokens.length} dispositivo(s)`);

  const clickUrl = dataPayload.url || 'https://ubbjtienda.vercel.app/';

  const response = await admin.messaging().sendEachForMulticast({
    notification: { title, body },
    data: dataPayload,
    webpush: {
      headers: { Urgency: 'high' },
      notification: {
        icon: 'https://ubbjtienda.vercel.app/Logoubbj.png',
        badge: 'https://ubbjtienda.vercel.app/Logoubbj.png',
        vibrate: [200, 100, 200],
        requireInteraction: true
      },
      fcmOptions: {
        link: clickUrl
      }
    },
    tokens
  });

  console.log(`✅ Enviadas: ${response.successCount}/${tokens.length}`);

  // Log errores individuales para debugging
  response.responses.forEach((resp, i) => {
    if (!resp.success) {
      console.error(`❌ Token ${i} falló:`, resp.error?.code, resp.error?.message);
    }
  });

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
    console.log('🔵 NUEVO MENSAJE detectado:', JSON.stringify(msg));
    const from = msg.from;
    const texto = msg.texto || '';

    if (!from || !texto) {
      console.log('⚠️ Mensaje sin from o texto, saliendo');
      return null;
    }

    let targetType, targetId, senderName;

    if (from === 'comprador') {
      targetType = 'vendedor';
      targetId = msg.vendedorId || '';
      console.log(`🔵 Comprador envió mensaje. vendedorId objetivo: "${targetId}"`);
      try {
        const buyerDoc = await db.collection('compradores').doc(msg.compradorId || '').get();
        senderName = buyerDoc.exists ? buyerDoc.data().nombre : 'Un cliente';
      } catch(e) { senderName = 'Un cliente'; }
    } else if (from === 'vendedor') {
      targetType = 'comprador';
      targetId = msg.compradorId || '';
      console.log(`🔵 Vendedor envió mensaje. compradorId objetivo: "${targetId}"`);
      try {
        const sellerDoc = await db.collection('vendedores').doc(msg.vendedorId || '').get();
        senderName = sellerDoc.exists ? sellerDoc.data().nombre : 'Un vendedor';
      } catch(e) { senderName = 'Un vendedor'; }
    } else {
      console.log(`⚠️ from desconocido: "${from}"`);
      return null;
    }

    if (!targetId) {
      console.log('⚠️ targetId vacío, saliendo');
      return null;
    }

    const tokenField = targetType === 'vendedor' ? 'vendedorId' : 'compradorId';
    console.log(`🔵 Buscando tokens: tipo="${targetType}", ${tokenField}="${targetId}"`);

    const tokensSnap = await db.collection('notifTokens')
      .where('tipo', '==', targetType)
      .where(tokenField, '==', targetId)
      .get();

    console.log(`🔵 Tokens encontrados: ${tokensSnap.size}`);
    tokensSnap.docs.forEach((doc, i) => {
      const d = doc.data();
      console.log(`🔵 Token ${i}: tipo=${d.tipo}, vendedorId=${d.vendedorId||'N/A'}, compradorId=${d.compradorId||'N/A'}, token=${(d.token||'').substring(0,20)}...`);
    });

    if (tokensSnap.empty) {
      console.log('⚠️ No hay tokens para el destinatario');
      return null;
    }

    const title = `💬 Mensaje de ${senderName}`;
    const body = texto.length > 100 ? texto.substring(0, 100) + '...' : texto;

    let chatUrl = 'https://ubbjtienda.vercel.app/';
    if (from === 'comprador') {
      chatUrl = 'https://ubbjtienda.vercel.app/perfilvendedor';
    } else if (from === 'vendedor') {
      const vendedorId = msg.vendedorId || '';
      if (vendedorId) {
        chatUrl = `https://ubbjtienda.vercel.app/perfil?id=${vendedorId}&openchat=1`;
      }
    }

    console.log(`🔵 Enviando: title="${title}", body="${body}", url="${chatUrl}"`);
    await sendPushNotification(tokensSnap, title, body, { url: chatUrl });
    return null;
  });
