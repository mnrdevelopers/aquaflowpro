// PWA functionality for AquaFlow Pro
class PWAHandler {
    constructor() {
        this.deferredPrompt = null;
        this.init();
    }

    init() {
        this.registerServiceWorker();
        this.setupInstallPrompt();
        this.setupOfflineDetection();
        this.checkStandaloneMode();
    }

    // Register Service Worker
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/aquaflowpro/sw.js');
                console.log('Service Worker registered: ', registration);
                
                // Check for updates
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    console.log('Service Worker update found!');
                    
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            this.showUpdateNotification();
                        }
                    });
                });
            } catch (error) {
                console.error('Service Worker registration failed: ', error);
            }
        }
    }

    // Handle install prompt
    setupInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferredPrompt = e;
            this.showInstallPrompt();
        });

        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
            this.deferredPrompt = null;
            this.hideInstallPrompt();
            this.showSuccess('App installed successfully!');
        });
    }

    // Show install prompt
    showInstallPrompt() {
        // Don't show if already installed or in standalone mode
        if (this.isInStandaloneMode()) return;
        
        // Don't show multiple prompts
        if (document.getElementById('installPrompt')) return;

        const installPrompt = document.createElement('div');
        installPrompt.id = 'installPrompt';
        installPrompt.innerHTML = `
            <div class="install-prompt">
                <div class="install-content">
                    <i class="fas fa-download"></i>
                    <div>
                        <h4>Install AquaFlow Pro</h4>
                        <p>Install for better experience and offline access</p>
                    </div>
                </div>
                <div class="install-actions">
                    <button class="btn btn-secondary" onclick="pwaHandler.hideInstallPrompt()">
                        Later
                    </button>
                    <button class="btn btn-primary" onclick="pwaHandler.installApp()">
                        Install
                    </button>
                </div>
            </div>
        `;
        
        document.body.appendChild(installPrompt);
        
        // Auto-hide after 15 seconds
        setTimeout(() => {
            this.hideInstallPrompt();
        }, 15000);
    }

    hideInstallPrompt() {
        const prompt = document.getElementById('installPrompt');
        if (prompt) {
            prompt.remove();
        }
    }

    async installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            
            if (outcome === 'accepted') {
                console.log('User accepted the install prompt');
            } else {
                console.log('User dismissed the install prompt');
            }
            
            this.deferredPrompt = null;
            this.hideInstallPrompt();
        }
    }

    // Offline detection
    setupOfflineDetection() {
        window.addEventListener('online', () => {
            this.updateOnlineStatus(true);
            this.syncOfflineData();
        });

        window.addEventListener('offline', () => {
            this.updateOnlineStatus(false);
        });

        // Initial status
        this.updateOnlineStatus(navigator.onLine);
    }

    updateOnlineStatus(online) {
        const statusElement = document.getElementById('connectionStatus');
        if (statusElement) {
            if (online) {
                statusElement.innerHTML = '<i class="fas fa-wifi"></i> Online';
                statusElement.className = 'status-online';
                this.hideOfflineNotification();
            } else {
                statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
                statusElement.className = 'status-offline';
                this.showOfflineNotification();
            }
        }
    }

    showOfflineNotification() {
        if (!document.getElementById('offlineNotification')) {
            const notification = document.createElement('div');
            notification.id = 'offlineNotification';
            notification.className = 'offline-notification';
            notification.innerHTML = `
                <i class="fas fa-wifi-slash"></i>
                <span>You are currently offline. Some features may be limited.</span>
                <button class="btn-close" onclick="pwaHandler.hideOfflineNotification()">
                    <i class="fas fa-times"></i>
                </button>
            `;
            document.body.appendChild(notification);
        }
    }

    hideOfflineNotification() {
        const notification = document.getElementById('offlineNotification');
        if (notification) {
            notification.remove();
        }
    }

    // Sync data when back online
    async syncOfflineData() {
        console.log('Syncing offline data...');
        this.showSuccess('Back online! Syncing data...');
        
        // Reload app data if app exists
        if (window.app && typeof window.app.loadInitialData === 'function') {
            try {
                await window.app.loadInitialData();
                this.showSuccess('Data synced successfully!');
            } catch (error) {
                console.error('Sync failed:', error);
            }
        }
    }

    // Check if app is running in standalone mode
    isInStandaloneMode() {
        return (window.matchMedia('(display-mode: standalone)').matches) ||
               (window.navigator.standalone) ||
               (document.referrer.includes('android-app://'));
    }

    checkStandaloneMode() {
        if (this.isInStandaloneMode()) {
            console.log('Running in standalone mode');
            document.body.classList.add('standalone-mode');
        }
    }

    // Show update notification
    showUpdateNotification() {
        if (!document.getElementById('updateNotification')) {
            const notification = document.createElement('div');
            notification.id = 'updateNotification';
            notification.className = 'update-notification';
            notification.innerHTML = `
                <div class="update-content">
                    <i class="fas fa-sync-alt"></i>
                    <div>
                        <h4>Update Available</h4>
                        <p>A new version of AquaFlow Pro is available.</p>
                    </div>
                </div>
                <div class="update-actions">
                    <button class="btn btn-primary" onclick="pwaHandler.updateApp()">
                        Update
                    </button>
                    <button class="btn btn-secondary" onclick="pwaHandler.hideUpdateNotification()">
                        Later
                    </button>
                </div>
            `;
            document.body.appendChild(notification);
        }
    }

    hideUpdateNotification() {
        const notification = document.getElementById('updateNotification');
        if (notification) {
            notification.remove();
        }
    }

    updateApp() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                window.location.reload();
            });
        }
    }

    // Request notification permission
    async requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    console.log('Notification permission granted');
                    this.showLocalNotification('Welcome to AquaFlow Pro!', 'You will receive important updates and reminders.');
                }
                return permission;
            } catch (error) {
                console.error('Notification permission error:', error);
            }
        }
        return Notification.permission;
    }

    // Show local notification
    showLocalNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const options = {
                body: body,
                icon: '/aquaflowpro/icons/icon-192x192.png',
                badge: '/aquaflowpro/icons/icon-72x72.png',
                tag: 'aquaflow-notification'
            };
            
            new Notification(title, options);
        }
    }

    // Utility function to show success messages
    showSuccess(message) {
        // Use existing showSuccess function or create a simple one
        if (typeof showSuccess === 'function') {
            showSuccess(message);
        } else {
            console.log('Success:', message);
        }
    }
}

// Initialize PWA
const pwaHandler = new PWAHandler();
