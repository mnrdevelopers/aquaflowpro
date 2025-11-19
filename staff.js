// Staff-specific Application Class
class StaffApp {
    constructor() {
        this.customers = [];
        this.deliveries = [];
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
        const user = authManager.getCurrentUser();
        this.userData = authManager.getUserData(); 
        
        console.log('Staff Auth check - User:', user ? 'present' : 'absent', 'UserData:', this.userData ? 'loaded' : 'missing');
        
        if (!user) {
            console.log('No user found, redirecting to auth.html');
            window.location.href = 'auth.html';
            return false;
        }
        
        if (!this.userData || this.userData.role !== 'staff') {
            console.log('Not a staff user, redirecting to main app');
            window.location.href = 'app.html';
            return false;
        }
        
        this.authUserId = user.uid;
        this.userId = this.userData.ownerId; // Business Owner ID
        
        if (!this.userId) {
            showError('Configuration Error: Staff account has no linked Business Owner.');
            return false;
        }

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

        if (this.customers.length === 0) {
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
        const pageCustomers = this.customers.slice(startIndex, endIndex);

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

        container.innerHTML = html;
    }

    displayDeliveries() {
        const container = document.getElementById('deliveriesListContainer');
        if (!container) return;

        if (this.deliveries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-truck-loading"></i>
                    <h3>No Deliveries Recorded</h3>
                    <p>Scan QR codes to record deliveries.</p>
                </div>
            `;
            return;
        }

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

        html += this.deliveries.map(delivery => {
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

        container.innerHTML = html;
    }

    filterCustomers(searchTerm) {
        // Similar to main app but simplified
    }

    // Scanner functions (same as main app)
    openScanner() {
        this.showModal('scannerModal');
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

function viewCustomerDetails(customerId) {
    // Implementation similar to main app
}

function quickDelivery(customerId) {
    // Implementation similar to main app
}
