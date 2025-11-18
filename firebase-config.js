// Firebase Configuration - Replace with your actual Firebase config
const firebaseConfig = {
    apiKey: "your-api-key-here",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "123456789",
    appId: "your-app-id"
};

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} catch (error) {
    console.error('Firebase initialization error:', error);
    showError('Failed to initialize app. Please refresh the page.');
}

const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence
db.enablePersistence()
  .catch((err) => {
      console.log('Firebase persistence error:', err);
  });

// ImgBB API Key for QR code storage
const IMGBB_API_KEY = 'your-imgbb-api-key-here'; // Get from https://imgbb.com/

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
    console.error(message);
    // You can implement a toast notification system here
    alert(message);
};

const showSuccess = (message) => {
    console.log(message);
    // You can implement a toast notification system here
    alert(message);
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
