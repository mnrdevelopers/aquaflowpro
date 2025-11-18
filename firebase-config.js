// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCqT81J9D6JJChtfwlpXgc8DE0bDkWy4ls",
  authDomain: "aquaflowpro-2ae5a.firebaseapp.com",
  projectId: "aquaflowpro-2ae5a",
  storageBucket: "aquaflowpro-2ae5a.firebasestorage.app",
  messagingSenderId: "898374055700",
  appId: "1:898374055700:web:ed500d8948db9d0df33401",
  measurementId: "G-7DPYRDT1F1"
};

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Firebase initialization error:', error);
}

const db = firebase.firestore();
const auth = firebase.auth();

// CRITICAL: Configure auth persistence FIRST
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log('Auth persistence set to LOCAL');
  })
  .catch((error) => {
    console.error('Error setting auth persistence:', error);
  });

// Enable offline persistence with better error handling
db.enablePersistence()
  .catch((err) => {
      console.log('Firebase persistence error:', err);
  });

// ImgBB API Key for QR code storage
const IMGBB_API_KEY = 'bbfde58b1da5fc9ee9d7d6a591852f71';

// Utility functions
const getCurrentMonth = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const getToday = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

const formatCurrency = (amount) => {
    return '₹' + parseInt(amount).toLocaleString('en-IN');
};

const showError = (message) => {
    console.error('Error:', message);
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #dc3545;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-weight: 600;
        max-width: 300px;
        text-align: center;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 4000);
};

const showSuccess = (message) => {
    console.log('Success:', message);
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: #28a745;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        font-weight: 600;
        max-width: 300px;
        text-align: center;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 4000);
};

// Network status monitoring
const updateConnectionStatus = () => {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        if (navigator.onLine) {
            statusElement.innerHTML = '<i class="fas fa-circle"></i> Online';
            statusElement.className = 'status-online';
        } else {
            statusElement.innerHTML = '<i class="fas fa-circle"></i> Offline';
            statusElement.className = 'status-offline';
        }
    }
};

window.addEventListener('online', updateConnectionStatus);
window.addEventListener('offline', updateConnectionStatus);

// Initialize connection status
document.addEventListener('DOMContentLoaded', updateConnectionStatus);
