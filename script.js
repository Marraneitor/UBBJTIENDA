// Datos de productos
const products = [
    {
        id: 1,
        name: "Laptop Premium",
        description: "Laptop de alta gama para profesionales",
        price: 1299.99,
        icon: "💻"
    },
    {
        id: 2,
        name: "Smartphone Pro",
        description: "Teléfono inteligente de última generación",
        price: 899.99,
        icon: "📱"
    },
    {
        id: 3,
        name: "Auriculares Bluetooth",
        description: "Sonido premium con cancelación de ruido",
        price: 199.99,
        icon: "🎧"
    },
    {
        id: 4,
        name: "Tablet Digital",
        description: "Tablet versátil para trabajo y entretenimiento",
        price: 499.99,
        icon: "📲"
    },
    {
        id: 5,
        name: "Smartwatch",
        description: "Reloj inteligente con múltiples funciones",
        price: 299.99,
        icon: "⌚"
    },
    {
        id: 6,
        name: "Cámara Digital",
        description: "Cámara profesional de alta resolución",
        price: 799.99,
        icon: "📷"
    }
];

// Carrito de compras
let cart = [];

// Inicializar la aplicación
document.addEventListener('DOMContentLoaded', function() {
    renderProducts();
    updateCartDisplay();
});

// Renderizar productos en la página
function renderProducts() {
    const productsContainer = document.getElementById('products-container');
    
    products.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card';
        productCard.innerHTML = `
            <div class="product-icon">${product.icon}</div>
            <div class="product-name">${product.name}</div>
            <div class="product-description">${product.description}</div>
            <div class="product-price">$${product.price.toFixed(2)}</div>
            <button class="btn btn-secondary" onclick="addToCart(${product.id})">
                Agregar al Carrito
            </button>
        `;
        productsContainer.appendChild(productCard);
    });
}

// Agregar producto al carrito
function addToCart(productId) {
    const product = products.find(p => p.id === productId);
    
    const existingItem = cart.find(item => item.id === productId);
    
    if (existingItem) {
        existingItem.quantity++;
    } else {
        cart.push({
            ...product,
            quantity: 1
        });
    }
    
    updateCartDisplay();
    showNotification('Producto agregado al carrito');
}

// Eliminar producto del carrito
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    updateCartDisplay();
    showNotification('Producto eliminado del carrito');
}

// Actualizar cantidad de producto
function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    
    if (item) {
        item.quantity += change;
        
        if (item.quantity <= 0) {
            removeFromCart(productId);
        } else {
            updateCartDisplay();
        }
    }
}

// Actualizar visualización del carrito
function updateCartDisplay() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartCount = document.getElementById('cart-count');
    const cartTotal = document.getElementById('cart-total');
    const checkoutBtn = document.getElementById('checkout-btn');
    
    // Actualizar contador en el menú
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
    cartCount.textContent = totalItems;
    
    // Si el carrito está vacío
    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-cart">Tu carrito está vacío</p>';
        cartTotal.textContent = '0';
        checkoutBtn.style.display = 'none';
        return;
    }
    
    // Renderizar items del carrito
    cartItemsContainer.innerHTML = '';
    cart.forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        cartItem.innerHTML = `
            <div class="cart-item-info">
                <div class="cart-item-name">${item.icon} ${item.name}</div>
                <div class="cart-item-price">$${item.price.toFixed(2)} x ${item.quantity}</div>
            </div>
            <div class="cart-item-actions">
                <button class="btn btn-secondary" onclick="updateQuantity(${item.id}, -1)">-</button>
                <span>${item.quantity}</span>
                <button class="btn btn-secondary" onclick="updateQuantity(${item.id}, 1)">+</button>
                <button class="btn btn-danger" onclick="removeFromCart(${item.id})">Eliminar</button>
            </div>
        `;
        cartItemsContainer.appendChild(cartItem);
    });
    
    // Calcular y mostrar total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    cartTotal.textContent = total.toFixed(2);
    checkoutBtn.style.display = 'inline-block';
}

// Mostrar notificación
function showNotification(message) {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        background-color: #28a745;
        color: white;
        padding: 1rem 2rem;
        border-radius: 5px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 1000;
        animation: slideIn 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // Eliminar notificación después de 3 segundos
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Procesar pago
document.getElementById('checkout-btn').addEventListener('click', function() {
    if (cart.length === 0) {
        alert('Tu carrito está vacío');
        return;
    }
    
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    alert(`¡Gracias por tu compra!\nTotal: $${total.toFixed(2)}`);
    
    // Vaciar carrito
    cart = [];
    updateCartDisplay();
});

// Agregar estilos de animación
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
