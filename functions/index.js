const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// =============================================
// 🔔 NOTIFICAR AL CLIENTE cuando su pedido cambia de estado
// Se dispara cuando se actualiza un doc en la colección "compras"
// =============================================
exports.notifyClientOnOrderUpdate = functions.firestore
  .document('compras/{purchaseId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    // Solo notificar si cambió el estado
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

    // Buscar tokens del comprador
    const compradorId = after.compradorId || '';
    if (!compradorId) return null;

    const tokensSnap = await db.collection('notifTokens')
      .where('tipo', '==', 'comprador')
      .where('compradorId', '==', compradorId)
      .get();

    if (tokensSnap.empty) {
      console.log('No hay tokens para el comprador:', compradorId);
      return null;
    }

    const tokens = tokensSnap.docs.map(doc => doc.data().token).filter(Boolean);
    if (tokens.length === 0) return null;

    console.log(`📨 Enviando notificación a ${tokens.length} dispositivo(s) del comprador`);

    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      webpush: {
        notification: {
          icon: 'https://ubbjtienda.vercel.app/Logoubbj.png',
          badge: 'https://ubbjtienda.vercel.app/Logoubbj.png',
          vibrate: [200, 100, 200, 100, 200]
        }
      },
      tokens
    });

    console.log(`✅ Enviadas: ${response.successCount}/${tokens.length}`);

    // Limpiar tokens inválidos
    const batch = db.batch();
    response.responses.forEach((resp, i) => {
      if (!resp.success) {
        const tokenDoc = tokensSnap.docs.find(d => d.data().token === tokens[i]);
        if (tokenDoc) batch.delete(tokenDoc.ref);
      }
    });
    await batch.commit();

    return null;
  });

// =============================================
// 🔔 NOTIFICAR AL VENDEDOR cuando recibe un pedido nuevo
// Se dispara cuando se crea un doc en "compras"
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

    // Buscar tokens del vendedor
    const tokensSnap = await db.collection('notifTokens')
      .where('tipo', '==', 'vendedor')
      .where('vendedorId', '==', vendedorId)
      .get();

    if (tokensSnap.empty) {
      console.log('No hay tokens para el vendedor:', vendedorId);
      return null;
    }

    const tokens = tokensSnap.docs.map(doc => doc.data().token).filter(Boolean);
    if (tokens.length === 0) return null;

    console.log(`📨 Enviando notificación a ${tokens.length} dispositivo(s) del vendedor`);

    const response = await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      webpush: {
        notification: {
          icon: 'https://ubbjtienda.vercel.app/Logoubbj.png',
          badge: 'https://ubbjtienda.vercel.app/Logoubbj.png',
          vibrate: [200, 100, 200, 100, 200]
        }
      },
      tokens
    });

    console.log(`✅ Enviadas: ${response.successCount}/${tokens.length}`);

    // Limpiar tokens inválidos
    const batch = db.batch();
    response.responses.forEach((resp, i) => {
      if (!resp.success) {
        const tokenDoc = tokensSnap.docs.find(d => d.data().token === tokens[i]);
        if (tokenDoc) batch.delete(tokenDoc.ref);
      }
    });
    await batch.commit();

    return null;
  });
