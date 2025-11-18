// Firebase Configuration - Replace with your actual Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyCqT81J9D6JJChtfwlpXgc8DE0bDkWy4ls",
  authDomain: "aquaflowpro-2ae5a.firebaseapp.com",
  projectId: "aquaflowpro-2ae5a",
  storageBucket: "aquaflowpro-2ae5a.firebasestorage.app",
  messagingSenderId: "898374055700",
  appId: "1:898374055700:web:ed500d8948db9d0df33401",
  measurementId: "G-7DPYRDT1F1"
};

// Utility functions - Define them FIRST
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
    // Simple alert for now - you can replace with toast notifications
    alert('Error: ' + message);
};

const showSuccess = (message) => {
    console.log('Success:', message);
    alert('Success: ' + message);
};

// ImgBB API Key for QR code storage
const IMGBB_API_KEY = 'your-imgbb-api-key-here'; // Get from https://imgbb.com/

// Initialize Firebase
let db, auth;

try {
    // Check if Firebase is available
    if (typeof firebase === 'undefined') {
        throw new Error('Firebase SDK not loaded. Please check your internet connection.');
    }
    
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    
    // Initialize Firebase services
    db = firebase.firestore();
    auth = firebase.auth();
    
    // Enable offline persistence
    db.enablePersistence()
      .catch((err) => {
          console.log('Firebase persistence error:', err);
      });
      
    console.log('Firebase initialized successfully');
    
} catch (error) {
    console.error('Firebase initialization error:', error);
    showError('Failed to initialize app. Please refresh the page.');
}

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

// Initialize connection status when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
});
