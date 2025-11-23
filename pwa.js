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
        // New: Check specifically for iOS
        this.checkIOS();
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

    // Handle install prompt (Android/Desktop)
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

    // Show install prompt (Android/Desktop)
    showInstallPrompt() {
        if (this.isInStandaloneMode()) return;
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
    }

    hideInstallPrompt() {
        const prompt = document.getElementById('installPrompt');
        if (prompt) prompt.remove();
    }

    async installApp() {
        if (this.deferredPrompt) {
            this.deferredPrompt.prompt();
            const { outcome } = await this.deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('User accepted the install prompt');
            }
            this.deferredPrompt = null;
            this.hideInstallPrompt();
        }
    }

    // === NEW: iOS Specific Logic ===
    checkIOS() {
        // Detects iPhone, iPad, iPod, or iPad pretending to be Mac (new iPadOS)
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
        
        // Only show if not already installed and on iOS
        if (isIOS && !this.isInStandaloneMode()) {
            // Check if user previously dismissed it
            if (!sessionStorage.getItem('iosInstallDismissed')) {
                setTimeout(() => this.showIOSInstallPrompt(), 3000);
            }
        }
    }

    showIOSInstallPrompt() {
        if (document.getElementById('iosInstallPrompt')) return;

        const prompt = document.createElement('div');
        prompt.id = 'iosInstallPrompt';
        // Reusing install-prompt class for consistent styling, but with specific iOS content
        prompt.innerHTML = `
            <div class="install-prompt" style="border-color: #0066ff;">
                <div class="install-content">
                    <i class="fas fa-share-square" style="font-size: 1.5rem;"></i>
                    <div>
                        <h4>Install on iPhone</h4>
                        <p style="font-size: 0.85rem;">Tap the <strong>Share</strong> button <i class="fas fa-share-square"></i> and select <strong>"Add to Home Screen"</strong> <i class="fas fa-plus-square"></i></p>
                    </div>
                </div>
                <div class="install-actions">
                    <button class="btn btn-sm btn-secondary" onclick="pwaHandler.dismissIOSPrompt()">
                        Got it
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(prompt);
    }

    dismissIOSPrompt() {
        const prompt = document.getElementById('iosInstallPrompt');
        if (prompt) prompt.remove();
        sessionStorage.setItem('iosInstallDismissed', 'true');
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
        if (notification) notification.remove();
    }

    // Sync data when back online
    async syncOfflineData() {
        console.log('Syncing offline data...');
        if (window.app && typeof window.app.loadInitialData === 'function') {
            try {
                await window.app.loadInitialData();
                this.showSuccess('Back online! Data synced.');
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
        if (notification) notification.remove();
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

    showLocalNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            const options = {
                body: body,
                icon: '/aquaflowpro/icons/icon-192x192.png',
                badge: '/aquaflowpro/icons/icon-72x72.png',
                tag: 'aquaflow-notification'
            };
            
            // Check if service worker registration is available for mobile notifications
            if ('serviceWorker' in navigator && navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then(registration => {
                    registration.showNotification(title, options);
                });
            } else {
                new Notification(title, options);
            }
        }
    }

    showSuccess(message) {
        if (typeof showSuccess === 'function') {
            showSuccess(message);
        } else {
            console.log('Success:', message);
        }
    }
}

// Initialize PWA
const pwaHandler = new PWAHandler();
