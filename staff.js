// Staff-specific Application Class
class StaffApp {
    constructor() {
        this.customers = [];
        this.filteredCustomers = [];
        this.deliveries = [];
        this.filteredDeliveries = [];
        this.notifications = [];
        this.currentView = 'dashboard';
        this.scannerActive = false;
        this.currentCustomerId = null;
        
        this.userId = null; // Business Owner ID
        this.authUserId = null; // Staff's own auth ID
        this.userData = null;
        this.userRole = 'staff';
        
        this.html5QrCode = null;
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.deliveryPage = 1;

        this.init();
    }

    async init() {
        console.log('Staff App initialization started');
        
        await this.waitForAuthState();
        
        const authDataReady = await this.checkAuthentication();
        
        if (!authDataReady) {
            console.log('Authentication check failed, stopping app initialization');
            return;
        }

        this.setupEventListeners();
        await this.loadInitialData();
        this.updateUI();
        console.log('Staff App initialization completed successfully');
    }

    async waitForAuthState() {
        let attempts = 0;
        const maxAttempts = 50; 
        
        while (!authManager.isAuthStateReady() && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
    }

   async checkAuthentication() {
    console.log('Staff App: Starting authentication check...');
    
    const user = authManager.getCurrentUser();
    this.userData = authManager.getUserData(); 
    
    console.log('Staff Auth check - User:', user ? 'present' : 'absent', 'UserData:', this.userData ? 'loaded' : 'missing');
    
    if (!user) {
        console.log('No user found, redirecting to auth.html');
        window.location.replace('auth.html');
        return false;
    }

    // CRITICAL FIX: Load user data if missing with retry logic
    if (!this.userData || !this.userData.role) {
        console.log('Staff: User data missing, loading directly...');
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts && (!this.userData || !this.userData.role)) {
            await authManager.loadUserData(user);
            this.userData = authManager.getUserData();
            attempts++;
            
            if (!this.userData || !this.userData.role) {
                console.log(`Staff: Retry ${attempts}/${maxAttempts} for user data`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }
    
    // Double check after load attempt
    if (!this.userData || !this.userData.role) {
        console.error('CRITICAL: Staff User data unavailable after retries.');
        showError("Failed to load staff profile. Please check internet and try again.");
        // Don't redirect to prevent loops - let user manually logout
        return false;
    }
    
    if (this.userData.role !== 'staff') {
        console.log('Not a staff user, redirecting to main app');
        window.location.replace('app.html');
        return false;
    }
    
    this.authUserId = user.uid;
    this.userId = this.userData.ownerId; // Business Owner ID
    
    if (!this.userId) {
        showError('Configuration Error: Staff account has no linked Business Owner.');
        return false;
    }

    console.log('Staff authentication check passed');
    
    // Fetch owner settings for business name
    await this.fetchOwnerSettings();
    return true;
}

    async fetchOwnerSettings() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const ownerDoc = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).get();
            if (ownerDoc.exists) {
                const ownerData = ownerDoc.data();
                this.userData.businessName = ownerData.businessName;
                this.userData.businessPhone = ownerData.businessPhone;
                this.userData.defaultPrice = ownerData.defaultPrice;
            }
        } catch (error) {
            console.error('Error fetching owner settings:', error);
        }
    }

    setupEventListeners() {
        const searchInput = document.getElementById('customerSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterCustomers(e.target.value));
        }

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }

    async loadInitialData() {
        await Promise.all([
            this.loadCustomers(),
            this.loadMyDeliveries(),
            this.loadNotifications()
        ]);
        this.updateDashboard();
    }

    async loadCustomers() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const customersCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers');
            
            const snapshot = await customersCollectionRef
                .orderBy('name')
                .get();
            
            this.customers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.filteredCustomers = [...this.customers];
            this.displayCustomers();
            
        } catch (error) {
            console.error('Error loading customers:', error);
            showError('Failed to load customers'); 
        }
    }

    async loadMyDeliveries() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const deliveriesCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries');
            
            // Load deliveries recorded by this staff member
            const snapshot = await deliveriesCollectionRef
                .where('recordedBy', '==', this.authUserId)
                .orderBy('timestamp', 'desc')
                .limit(200)
                .get();
            
            this.deliveries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.filteredDeliveries = [...this.deliveries];
            
        } catch (error) {
            console.error('Error loading deliveries:', error);
            showError('Failed to load deliveries.');
        }
    }

    async loadNotifications() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const notificationsRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('notifications');
            
            const snapshot = await notificationsRef
                .orderBy('timestamp', 'desc')
                .limit(50)
                .get();
            
            this.notifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.updateNotificationBadge();
            this.displayNotifications();
            
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    async addNotification(title, message, type = 'info') {
         try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            const notificationData = {
                title: title,
                message: message,
                type: type,
                read: false,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: this.authUserId
            };

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('notifications').add(notificationData);
            await this.loadNotifications();
            
        } catch (error) {
            console.error('Error adding notification:', error);
        }
    }

    async clearAllNotifications() {
        if (!confirm('Are you sure you want to clear all notifications?')) return;

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const notificationsRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('notifications');
            const snapshot = await notificationsRef.get();

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();
            await this.loadNotifications();
            showSuccess('All notifications cleared');
        } catch (error) {
            console.error('Error clearing notifications:', error);
            showError('Failed to clear notifications');
        }
    }
    
    updateNotificationBadge() {
        const unreadCount = this.notifications.filter(notification => !notification.read).length;
        const badge = document.getElementById('notificationCount');
        
        if (badge) {
            if (unreadCount > 0) {
                badge.textContent = unreadCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }
    }

    displayNotifications() {
        const container = document.getElementById('notificationsList');
        if (!container) return;

        if (this.notifications.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-bell-slash"></i>
                    <h3>No Notifications</h3>
                    <p>You're all caught up!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.notifications.map(notification => {
            const timestamp = notification.timestamp?.toDate ? notification.timestamp.toDate() : new Date();
            const timeAgo = this.getTimeAgo(timestamp);
            
            return `
                <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}">
                    <div class="notification-icon ${notification.type}">
                        <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="notification-content">
                        <h4>${notification.title || 'Notification'}</h4>
                        <p>${notification.message || ''}</p>
                        <span class="notification-time">${timeAgo}</span>
                    </div>
                    <div class="notification-actions">
                        ${!notification.read ? `
                            <button class="btn btn-icon" onclick="markNotificationAsRead('${notification.id}')" title="Mark as read">
                                <i class="fas fa-check"></i>
                            </button>
                        ` : ''}
                        <button class="btn btn-icon" onclick="deleteNotification('${notification.id}')" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    getNotificationIcon(type) {
        const icons = {
            'info': 'info-circle',
            'success': 'check-circle',
            'warning': 'exclamation-triangle',
            'error': 'exclamation-circle',
            'delivery': 'truck',
            'payment': 'rupee-sign'
        };
        return icons[type] || 'bell';
    }

    getTimeAgo(date) {
        if (!date) return '';
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
        return date.toLocaleDateString();
    }

    // Staff-specific dashboard updates
    updateDashboard() {
        this.updateStats();
        this.updateRecentDeliveries();
    }

    updateStats() {
        const today = new Date().toDateString();
        const todayMyDeliveries = this.deliveries.filter(d => {
            if (!d.timestamp || !d.timestamp.seconds) return false;
            const deliveryDate = new Date(d.timestamp.seconds * 1000).toDateString();
            return deliveryDate === today;
        });
        
        const todayMyDeliveriesEl = document.getElementById('todayMyDeliveries');
        if (todayMyDeliveriesEl) todayMyDeliveriesEl.textContent = todayMyDeliveries.length;
        
        const totalCustomersEl = document.getElementById('totalCustomers');
        if (totalCustomersEl) totalCustomersEl.textContent = this.customers.length;
    }

    updateRecentDeliveries() {
        const container = document.getElementById('recentDeliveriesList');
        if (!container) return;

        const recentDeliveries = this.deliveries.slice(0, 5);
        
        if (recentDeliveries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-truck"></i>
                    <p>No recent deliveries</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recentDeliveries.map(delivery => {
            const customer = this.customers.find(c => c.id === delivery.customerId);
            if (!customer) return '';
            
            if (!delivery.timestamp || !delivery.timestamp.seconds) return '';
            
            const deliveryDate = new Date(delivery.timestamp.seconds * 1000);
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas fa-truck"></i>
                    </div>
                    <div class="activity-info">
                        <h4>${customer.name}</h4>
                        <p>${delivery.quantity} can(s) • ${deliveryDate.toLocaleDateString()}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Display methods (similar to main app but simplified)
    displayCustomers() {
        const container = document.getElementById('customersList');
        if (!container) return;

        if (this.filteredCustomers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No Customers Found</h3>
                    <p>No customers available in the system.</p>
                </div>
            `;
            return;
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageCustomers = this.filteredCustomers.slice(startIndex, endIndex);
        const totalPages = Math.ceil(this.filteredCustomers.length / this.itemsPerPage);

        let html = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Contact</th>
                            <th>Address</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        html += pageCustomers.map(customer => {
            return `
                <tr>
                    <td class="fw-bold">${customer.name}</td>
                    <td>${customer.phone}</td>
                    <td class="text-sm text-muted">${customer.address.substring(0, 30)}${customer.address.length > 30 ? '...' : ''}</td>
                    <td>
                        <div class="action-buttons-row">
                            <button class="btn btn-sm btn-primary" onclick="quickDelivery('${customer.id}')" title="Deliver">
                                <i class="fas fa-truck"></i>
                            </button>
                            <button class="btn btn-sm btn-outline" onclick="viewCustomerDetails('${customer.id}')" title="Details">
                                <i class="fas fa-eye"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        if (totalPages > 0) {
            html += `
                <div class="pagination-controls">
                    <button class="btn btn-sm btn-secondary" ${this.currentPage === 1 ? 'disabled' : ''} onclick="app.changePage(-1)">
                        <i class="fas fa-chevron-left"></i> Prev
                    </button>
                    <span class="page-info">Page ${this.currentPage} of ${totalPages}</span>
                    <button class="btn btn-sm btn-secondary" ${this.currentPage >= totalPages ? 'disabled' : ''} onclick="app.changePage(1)">
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    displayDeliveries() {
        const container = document.getElementById('deliveriesListContainer');
        if (!container) return;

        if (this.filteredDeliveries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-truck-loading"></i>
                    <h3>No Deliveries Recorded</h3>
                    <p>Scan QR codes to record deliveries.</p>
                </div>
            `;
            return;
        }
        
        const startIndex = (this.deliveryPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageDeliveries = this.filteredDeliveries.slice(startIndex, endIndex);
        const totalPages = Math.ceil(this.filteredDeliveries.length / this.itemsPerPage);

        let html = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Customer</th>
                            <th>Date</th>
                            <th>Qty</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        html += pageDeliveries.map(delivery => {
            const customer = this.customers.find(c => c.id === delivery.customerId);
            const customerName = customer ? customer.name : 'Unknown';
            const date = delivery.timestamp && delivery.timestamp.seconds 
                ? new Date(delivery.timestamp.seconds * 1000).toLocaleString() 
                : 'N/A';
            
            return `
                <tr>
                    <td class="fw-bold">${customerName}</td>
                    <td class="text-sm text-muted">${date}</td>
                    <td class="fw-bold">${delivery.quantity} Cans</td>
                </tr>
            `;
        }).join('');

        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        if (totalPages > 0) {
            html += `
                <div class="pagination-controls">
                    <button class="btn btn-sm btn-secondary" ${this.deliveryPage === 1 ? 'disabled' : ''} onclick="app.changeDeliveryPage(-1)">
                        <i class="fas fa-chevron-left"></i> Prev
                    </button>
                    <span class="page-info">Page ${this.deliveryPage} of ${totalPages}</span>
                    <button class="btn btn-sm btn-secondary" ${this.deliveryPage >= totalPages ? 'disabled' : ''} onclick="app.changeDeliveryPage(1)">
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    }
    
    changeDeliveryPage(delta) {
        const totalPages = Math.ceil(this.filteredDeliveries.length / this.itemsPerPage);
        const newPage = this.deliveryPage + delta;
        
        if (newPage >= 1 && newPage <= totalPages) {
            this.deliveryPage = newPage;
            this.displayDeliveries();
            document.getElementById('deliveriesView').scrollTop = 0;
        }
    }

    filterCustomers(searchTerm) {
        if (!searchTerm) {
            this.filteredCustomers = [...this.customers];
        } else {
            const lower = searchTerm.toLowerCase();
            this.filteredCustomers = this.customers.filter(customer =>
                customer.name.toLowerCase().includes(lower) ||
                customer.phone.includes(searchTerm) ||
                customer.address.toLowerCase().includes(lower)
            );
        }
        this.currentPage = 1;
        this.displayCustomers();
    }
    
    changePage(delta) {
        const totalPages = Math.ceil(this.filteredCustomers.length / this.itemsPerPage);
        const newPage = this.currentPage + delta;
        
        if (newPage >= 1 && newPage <= totalPages) {
            this.currentPage = newPage;
            this.displayCustomers();
            const view = document.getElementById('customersView');
            if(view) view.scrollTop = 0;
        }
    }

    getCustomerTypeIcon(type) {
        const icons = {
            'home': '🏠 Home',
            'shop': '🏪 Shop', 
            'office': '🏢 Office',
            'hotel': '🏨 Hotel',
            'restaurant': '🍴 Restaurant'
        };
        return icons[type] || '👤 General';
    }

    // Scanner functions (same as main app)
    openScanner() {
        this.showModal('scannerModal');
    }

    closeScanner() {
        this.closeModal('scannerModal');
        this.stopScanner();
    }

    async confirmDelivery() {
        // Similar to main app but with staff tracking
        if (!this.currentCustomerId) {
            showError('No customer selected.');
            return;
        }

        const quantityInput = document.getElementById('deliveryQuantity');
        const quantity = parseInt(quantityInput ? quantityInput.value : 1) || 1;
        
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        try {
            const deliveryData = {
                customerId: this.currentCustomerId,
                quantity: quantity,
                timestamp: new Date(),
                month: getCurrentMonth(),
                recordedBy: this.authUserId,
                recordedByName: this.userData.ownerName || 'Staff'
            };

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries').add(deliveryData);

            // Update customer stats
            const customerRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(this.currentCustomerId);
            await customerRef.update({
                totalCans: firebase.firestore.FieldValue.increment(quantity),
                totalDeliveries: firebase.firestore.FieldValue.increment(1)
            });

            const customer = this.customers.find(c => c.id === this.currentCustomerId);
            showSuccess(`Delivery recorded: ${quantity} can(s) to ${customer?.name || 'customer'}`);
            
            this.closeScanner();
            await this.loadMyDeliveries();
            this.updateDashboard();
            
        } catch (error) {
            console.error('Error recording delivery:', error);
            showError('Failed to record delivery.');
        }
    }

    // Other methods similar to main app but simplified
    showView(viewName) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        const activeView = document.getElementById(viewName + 'View');
        if (activeView) {
            activeView.classList.add('active');
            this.currentView = viewName;
        }

        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const navItem = document.querySelector(`.bottom-nav .nav-item[onclick="showView('${viewName}')"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        if (viewName === 'deliveries') {
            this.displayDeliveries();
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
        
        // For settings modal, populate staff info
        if (modalId === 'settingsModal') {
            this.populateStaffSettings();
        }
    }

    populateStaffSettings() {
        const user = authManager.getCurrentUser();
        if (user) {
            document.getElementById('staffEmail').value = user.email;
        }
        if (this.userData) {
            document.getElementById('staffBusinessName').value = this.userData.businessName || 'Unknown Business';
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }

    updateUI() {
        const businessNameElement = document.getElementById('businessName');
        if (businessNameElement && this.userData) {
            businessNameElement.textContent = this.userData.businessName;
        }
    }

    async changePassword() {
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmNewPassword) {
            showError('Passwords do not match.');
            return;
        }

        if (newPassword.length < 6) {
            showError('Password must be at least 6 characters long.');
            return;
        }

        try {
            const user = auth.currentUser;
            await user.updatePassword(newPassword);
            showSuccess('Password updated successfully!');
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmNewPassword').value = '';
        } catch (error) {
            console.error('Change password error:', error);
            showError('Failed to update password.');
        }
    }
    
    async generateAndStoreQRCode(customerId, customerData) {
        // Staff can't generate QR codes in the current logic, but keeping implementation safe
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const qrData = `AQUAFLOW:${customerId}:${this.userId}`;
            
            const canvas = document.createElement('canvas');
            if (typeof QRCode === 'undefined' || !QRCode.toCanvas) {
                console.warn('QRCode library not loaded.');
                return;
            }
            
            await QRCode.toCanvas(canvas, qrData, {
                width: 400, 
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' }
            });

            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const apiKey = await getImgBBApiKey();
            
            const formData = new FormData();
            formData.append('image', blob);
            formData.append('key', apiKey);

            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).update({
                    qrCodeUrl: result.data.url,
                    qrCodeData: qrData
                });
                return result.data.url;
            } else {
                throw new Error(result.error.message || 'Failed to upload QR code');
            }
            
        } catch (error) {
            console.error('Error generating QR code:', error);
            throw error;
        }
    }
    
    // Scanner logic
    loadQRScript() {
        return new Promise((resolve, reject) => {
            if (typeof Html5Qrcode !== 'undefined') {
                resolve();
                return;
            }
            console.log('Loading QR script dynamically...');
            const script = document.createElement('script');
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js";
            script.onload = () => {
                console.log('QR script loaded successfully');
                resolve();
            };
            script.onerror = () => reject(new Error('Failed to load QR script'));
            document.head.appendChild(script);
        });
    }

    async initializeScanner() {
        try {
            await this.loadQRScript();

            if (typeof Html5Qrcode === 'undefined') {
                throw new Error('QR Scanner library not loaded');
            }

            const placeholder = document.getElementById('scannerPlaceholder');
            const qrReader = document.getElementById('qrReader');
            
            if (placeholder) placeholder.classList.add('hidden');
            if (qrReader) qrReader.classList.remove('hidden');
            
            this.html5QrCode = new Html5Qrcode("qrReader");
            
            const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };

            await this.html5QrCode.start(
                { facingMode: "environment" },
                config,
                (decodedText) => { this.onScanSuccess(decodedText); },
                (errorMessage) => { console.log('Scan failed:', errorMessage); }
            );
            
        } catch (error) {
            console.error('Scanner initialization error:', error);
            this.handleScannerError(error);
        }
    }

    onScanSuccess(decodedText) {
        this.handleScannedQR(decodedText);
        this.stopScanner();
        const qrReader = document.getElementById('qrReader');
        if (qrReader) qrReader.classList.add('hidden');
    }

    handleScannerError(error) {
        let errorMessage = 'Failed to start camera. ';
        showError(errorMessage);
        this.showManualEntryOption();
    }

    stopScanner() {
        if (this.html5QrCode && this.html5QrCode.isScanning) {
            this.html5QrCode.stop().then(() => { this.html5QrCode.clear(); }).catch(err => {});
        }
    }

    showManualEntryOption() {
        const scannerPlaceholder = document.getElementById('scannerPlaceholder');
        if (!scannerPlaceholder) return;
        scannerPlaceholder.classList.remove('hidden');
        const qrReader = document.getElementById('qrReader');
        if (qrReader) qrReader.classList.add('hidden');
    }

    async handleScannedQR(qrData) {
        if (!qrData.startsWith('AQUAFLOW:')) {
            showError('Invalid QR code.');
            this.resetScanner();
            return;
        }

        const [, customerId, businessId] = qrData.split(':');
        
        // Verify if the QR belongs to the current business context (this.userId is the Owner ID)
        if (businessId !== this.userId) {
            showError('This QR code belongs to another business.');
            this.resetScanner();
            return;
        }

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const customerDoc = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).get();
            
            if (!customerDoc.exists) {
                showError('Customer not found.');
                this.resetScanner();
                return;
            }

            const customer = customerDoc.data();
            this.showDeliveryForm(customerId, customer);
            
        } catch (error) {
            console.error('Error finding customer:', error);
            this.resetScanner();
        }
    }

    showDeliveryForm(customerId, customer) {
        this.currentCustomerId = customerId;
        
        const customerName = document.getElementById('scannedCustomerName');
        const customerPhone = document.getElementById('scannedCustomerPhone');
        const customerAddress = document.getElementById('scannedCustomerAddress');

        if (customerName) customerName.textContent = customer.name || 'N/A';
        if (customerPhone) customerPhone.textContent = customer.phone || 'N/A';
        if (customerAddress) customerAddress.textContent = customer.address || 'N/A';
        
        const qrReader = document.getElementById('qrReader');
        const deliveryForm = document.getElementById('deliveryForm');
        
        if (qrReader) qrReader.classList.add('hidden');
        if (deliveryForm) deliveryForm.classList.remove('hidden');
    }

    resetScanner() {
        this.stopScanner();
        const deliveryForm = document.getElementById('deliveryForm');
        const scannerPlaceholder = document.getElementById('scannerPlaceholder');
        const qrReader = document.getElementById('qrReader');
        
        if (deliveryForm) deliveryForm.classList.add('hidden');
        if (scannerPlaceholder) scannerPlaceholder.classList.remove('hidden');
        if (qrReader) qrReader.classList.add('hidden');
        
        this.currentCustomerId = null;
        const quantityInput = document.getElementById('deliveryQuantity');
        if (quantityInput) quantityInput.value = '1';
    }
    
    // Additional helpers
    async viewCustomerDetails(customerId) {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) {
            showError('Customer not found');
            return;
        }

        const customerDeliveries = this.deliveries.filter(d => d.customerId === customerId);
        const totalCans = customer.totalCans || customerDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);
        const totalDeliveries = customer.totalDeliveries || customerDeliveries.length;
        
        const currentMonth = getCurrentMonth();
        const monthlyDeliveries = customerDeliveries.filter(d => d.month === currentMonth);
        const monthlyCans = monthlyDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);

        document.getElementById('detailCustomerName').textContent = customer.name;
        document.getElementById('detailCustomerPhone').textContent = customer.phone;
        document.getElementById('detailCustomerAddress').textContent = customer.address;
        document.getElementById('detailCustomerType').textContent = this.getCustomerTypeIcon(customer.type);
        document.getElementById('detailCustomerPrice').textContent = `₹${customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 20)}`;
        document.getElementById('detailTotalDeliveries').textContent = totalDeliveries;
        document.getElementById('detailTotalCans').textContent = totalCans;
        document.getElementById('detailThisMonth').textContent = `${monthlyCans} cans`;

        document.getElementById('currentCustomerId').value = customerId;

        this.showModal('customerDetailsModal');
    }
}

let staffApp;

document.addEventListener('DOMContentLoaded', function() {
    staffApp = new StaffApp();
});

// Global functions for HTML onclick handlers
function showView(viewName) {
    if (staffApp) staffApp.showView(viewName);
}

function showSettings() {
    if (staffApp) staffApp.showModal('settingsModal');
}

function closeModal(modalId) {
    if (staffApp) staffApp.closeModal(modalId);
}

function openScanner() {
    if (staffApp) staffApp.openScanner();
}

function closeScanner() {
    if (staffApp) staffApp.closeScanner();
}

function confirmDelivery() {
    if (staffApp) staffApp.confirmDelivery();
}

function changePassword() {
    if (staffApp) staffApp.changePassword();
}

function initializeScanner() {
    if (staffApp) staffApp.initializeScanner();
}

function resetScanner() {
    if (staffApp) staffApp.resetScanner();
}

// Missing global functions that were causing the ReferenceErrors
function showNotifications() {
    if (staffApp) {
        staffApp.showView('notifications'); 
        staffApp.loadNotifications();
    }
}

function clearAllNotifications() {
    if (staffApp) staffApp.clearAllNotifications();
}

async function markNotificationAsRead(notificationId) {
    try {
        if (!staffApp || !staffApp.userId) return;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        await db.collection('artifacts').doc(appId).collection('users').doc(staffApp.userId).collection('notifications').doc(notificationId).update({
            read: true
        });
        await staffApp.loadNotifications();
    } catch (error) { console.error(error); }
}

async function deleteNotification(notificationId) {
    try {
        if (!staffApp || !staffApp.userId) return;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        await db.collection('artifacts').doc(appId).collection('users').doc(staffApp.userId).collection('notifications').doc(notificationId).delete();
        await staffApp.loadNotifications();
    } catch (error) { console.error(error); }
}

function viewCustomerDetails(customerId) {
    if (staffApp) staffApp.viewCustomerDetails(customerId);
}

function editCustomerFromDetails() {
    // Staff cannot edit, but button might exist in reused modal
    showError("Staff cannot edit customer details.");
}

function deleteCustomerFromDetails() {
    // Staff cannot delete
    showError("Staff cannot delete customers.");
}

function quickDelivery(customerId) {
    const quantity = parseInt(prompt('Enter number of cans:', '1')) || 1;
    if (quantity > 0 && staffApp) {
        const customer = staffApp.customers.find(c => c.id === customerId);
        if (customer) {
            staffApp.showDeliveryForm(customerId, customer);
            const quantityInput = document.getElementById('deliveryQuantity');
            if (quantityInput) quantityInput.value = quantity;
            staffApp.showModal('scannerModal');
        }
    }
}

function generateCustomerQR(customerId) {
    // Staff usually just views it, but we can allow view if generated
    // Logic handled inside generateCustomerQR if we wanted to add it to staffApp
    showError("Only owners can manage QR codes.");
}

function logout() {
    authManager.logout();
}
