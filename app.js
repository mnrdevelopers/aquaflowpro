// Main Application Class
class AquaFlowApp {
    constructor() {
        this.customers = [];
        this.filteredCustomers = [];
        this.deliveries = [];
        this.filteredDeliveries = []; // For the delivery list view
        this.notifications = [];
        this.payments = []; 
        this.staffMembers = []; // Added for staff management
        this.currentView = 'dashboard';
        this.scannerActive = false;
        this.currentCustomerId = null;
        
        // User Identity and Role Management
        this.userId = null; // This will store the DATA OWNER ID (Business Owner ID)
        this.authUserId = null; // This stores the actual logged-in user ID
        this.userData = null;
        this.userRole = 'owner'; // Default role
        
        this.html5QrCode = null;
        
        // Pagination State
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.deliveryPage = 1; // Pagination for deliveries view

        this.init();
    }

    async init() {
        console.log('App initialization started');
        
        await this.waitForAuthState();
        
        const authDataReady = await this.checkAuthentication();
        
        if (!authDataReady) {
            console.log('Authentication check failed, stopping app initialization');
            return;
        }

        this.setupEventListeners();
        await this.loadInitialData();
        this.updateUI();
        console.log('App initialization completed successfully');
    }

    async waitForAuthState() {
        let attempts = 0;
        const maxAttempts = 50; 
        
        while (!authManager.isAuthStateReady() && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (attempts >= maxAttempts) {
            console.warn('Auth state not ready after max attempts, proceeding anyway');
        }
    }

    async checkAuthentication() {
        const user = authManager.getCurrentUser();
        this.userData = authManager.getUserData(); 
        
        console.log('Auth check - User:', user ? 'present' : 'absent', 'UserData:', this.userData ? 'loaded' : 'missing');
        
        if (!user) {
            console.log('No user found, redirecting to auth.html');
            window.location.href = 'auth.html';
            return false;
        }
        
        this.authUserId = user.uid;

        // Check if email is verified
        if (user && !user.emailVerified) {
            const banner = document.getElementById('verificationBanner');
            if (banner) banner.style.display = 'block';
        }
        
        if (!this.userData) {
            console.log('User data missing, attempting to load directly...');
            await authManager.loadUserData(user);
            this.userData = authManager.getUserData();
        }

        if (!this.userData) {
             console.error('CRITICAL: User data unavailable. Using fallback.');
             this.userData = { role: 'owner', businessName: 'AquaFlow Pro', defaultPrice: 20 };
        }
        
        // ROLE MANAGEMENT
        this.userRole = this.userData.role || 'owner';
        
        if (this.userRole === 'staff') {
            // If Staff, we use the Owner's ID for data access
            this.userId = this.userData.ownerId;
            if (!this.userId) {
                showError('Configuration Error: Staff account has no linked Business Owner.');
                return false;
            }
            console.log('Staff Login: Accessing data for Owner ID:', this.userId);
            
            // We need to fetch the OWNER'S settings (Business Name, Price) to override Staff's view
            await this.fetchOwnerSettings();
        } else {
            // If Owner, we use their own ID
            this.userId = user.uid;
        }
        
        return true;
    }

    async fetchOwnerSettings() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const ownerDoc = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).get();
            if (ownerDoc.exists) {
                const ownerData = ownerDoc.data();
                // Merge owner settings into local userData for UI consistency
                this.userData.businessName = ownerData.businessName;
                this.userData.defaultPrice = ownerData.defaultPrice;
                this.userData.businessPhone = ownerData.businessPhone;
            }
        } catch (error) {
            console.error('Error fetching owner settings:', error);
        }
    }

    setupEventListeners() {
        // Customer search
        const searchInput = document.getElementById('customerSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterCustomers(e.target.value));
        }

        // Close modals on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }

    async loadInitialData() {
        await Promise.all([
            this.loadCustomers(),
            this.loadCurrentMonthDeliveries(), 
            this.loadNotifications(),
            this.loadPayments() 
        ]);
        this.updateDashboard();
        console.log('App initialization complete.');
    }

    async loadCustomers() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            if (!this.userId) {
                throw new Error('User ID is undefined. Cannot load customers.');
            }
            
            // Using this.userId (which might be Owner ID)
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
            this.loadCustomerSelect();
            
        } catch (error) {
            console.error('Error loading customers:', error);
            showError('Failed to load customers'); 
        }
    }

    async loadCurrentMonthDeliveries() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            if (!this.userId) {
                throw new Error('User ID is undefined. Cannot load deliveries.');
            }
            
            const deliveriesCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries');
            
            const snapshot = await deliveriesCollectionRef
                .orderBy('timestamp', 'desc')
                .limit(500) 
                .get();
            
            this.deliveries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            // Initialize filtered deliveries for the new view
            this.filteredDeliveries = [...this.deliveries];
            
        } catch (error) {
            console.error('Error loading deliveries:', error);
            showError('Failed to load recent deliveries.');
        }
    }

    async loadNotifications() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            if (!this.userId) return;

            // Staff and Owners share notifications of the business
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

    async loadPayments() {
        // Only owners strictly need to see payments, but staff might see bills status.
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            if (!this.userId) return;

            const paymentsRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('payments');
            
            const snapshot = await paymentsRef
                .orderBy('paidAt', 'desc')
                .limit(100)
                .get();
                
            this.payments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
        } catch (error) {
            console.error('Error loading payments:', error);
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
                createdBy: this.authUserId // Track who created it
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
            if (!this.userId) return;

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

    // ==========================================
    // DELIVERY MANAGEMENT (CRUD)
    // ==========================================

    displayDeliveries() {
        const container = document.getElementById('deliveriesListContainer');
        if (!container) return;

        if (this.filteredDeliveries.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-truck-loading"></i>
                    <h3>No Deliveries Found</h3>
                    <p>Scan a QR code or record a delivery to see it here.</p>
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
                            <th>Actions</th>
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
                    <td>
                        <button class="btn btn-sm btn-outline" onclick="app.editDelivery('${delivery.id}')" title="Edit/Delete">
                            <i class="fas fa-edit"></i>
                        </button>
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

    filterDeliveries(searchTerm) {
        if (!searchTerm) {
            this.filteredDeliveries = [...this.deliveries];
        } else {
            const lower = searchTerm.toLowerCase();
            this.filteredDeliveries = this.deliveries.filter(delivery => {
                const customer = this.customers.find(c => c.id === delivery.customerId);
                return customer && customer.name.toLowerCase().includes(lower);
            });
        }
        this.deliveryPage = 1;
        this.displayDeliveries();
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

    editDelivery(deliveryId) {
        const delivery = this.deliveries.find(d => d.id === deliveryId);
        if (!delivery) return;

        const customer = this.customers.find(c => c.id === delivery.customerId);
        const date = delivery.timestamp && delivery.timestamp.seconds 
            ? new Date(delivery.timestamp.seconds * 1000).toLocaleString() 
            : 'N/A';

        document.getElementById('editDeliveryId').value = delivery.id;
        document.getElementById('editDeliveryCustomerId').value = delivery.customerId;
        document.getElementById('editDeliveryCustomerName').value = customer ? customer.name : 'Unknown';
        document.getElementById('editDeliveryDate').value = date;
        document.getElementById('editDeliveryQuantity').value = delivery.quantity;

        this.showModal('editDeliveryModal');
    }

    async updateDelivery(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Updating...';

        try {
            const deliveryId = document.getElementById('editDeliveryId').value;
            const customerId = document.getElementById('editDeliveryCustomerId').value;
            const newQuantity = parseInt(document.getElementById('editDeliveryQuantity').value);
            
            const deliveryIndex = this.deliveries.findIndex(d => d.id === deliveryId);
            if (deliveryIndex === -1) throw new Error('Delivery not found');

            const oldQuantity = this.deliveries[deliveryIndex].quantity;
            const diff = newQuantity - oldQuantity;
            
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            if (diff !== 0) {
                // Update Delivery
                await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries').doc(deliveryId).update({
                    quantity: newQuantity
                });

                // Update Customer Stats
                await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).update({
                    totalCans: firebase.firestore.FieldValue.increment(diff)
                });

                // Update Local Data
                this.deliveries[deliveryIndex].quantity = newQuantity;
                const customer = this.customers.find(c => c.id === customerId);
                if (customer) {
                    customer.totalCans = (customer.totalCans || 0) + diff;
                }
            }

            showSuccess('Delivery updated successfully');
            this.closeModal('editDeliveryModal');
            this.filterDeliveries(document.getElementById('deliverySearch').value); // Refresh view
            this.updateDashboard();

        } catch (error) {
            console.error('Error updating delivery:', error);
            showError('Failed to update delivery');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Delivery';
        }
    }

    async confirmDeleteDelivery() {
        if (this.userRole === 'staff') {
            showError('Only the business owner can delete deliveries.');
            return;
        }

        if(!confirm('Are you sure you want to delete this delivery? This will revert the can count for the customer.')) return;
        
        const deliveryId = document.getElementById('editDeliveryId').value;
        const customerId = document.getElementById('editDeliveryCustomerId').value;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        try {
            const delivery = this.deliveries.find(d => d.id === deliveryId);
            if (!delivery) throw new Error('Delivery not found');

            // Delete Delivery
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries').doc(deliveryId).delete();

            // Revert Customer Stats
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).update({
                totalCans: firebase.firestore.FieldValue.increment(-delivery.quantity),
                totalDeliveries: firebase.firestore.FieldValue.increment(-1)
            });

            // Update Local Data
            this.deliveries = this.deliveries.filter(d => d.id !== deliveryId);
            this.filteredDeliveries = this.filteredDeliveries.filter(d => d.id !== deliveryId);
            
            const customer = this.customers.find(c => c.id === customerId);
            if (customer) {
                customer.totalCans = Math.max(0, (customer.totalCans || 0) - delivery.quantity);
                customer.totalDeliveries = Math.max(0, (customer.totalDeliveries || 0) - 1);
            }

            showSuccess('Delivery deleted successfully');
            this.closeModal('editDeliveryModal');
            this.displayDeliveries(); // Refresh view
            this.updateDashboard();

        } catch (error) {
            console.error('Error deleting delivery:', error);
            showError('Failed to delete delivery');
        }
    }

    // ==========================================
    // CUSTOMER MANAGEMENT
    // ==========================================

    displayCustomers() {
        const container = document.getElementById('customersList');
        if (!container) return;

        if (this.filteredCustomers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No Customers Found</h3>
                    <p>Try adjusting your search or add a new customer.</p>
                    <button class="btn btn-primary" onclick="showAddCustomerModal()">
                        <i class="fas fa-user-plus"></i> Add Customer
                    </button>
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
                            <th>Type</th>
                            <th>Contact</th>
                            <th>Stats</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        html += pageCustomers.map(customer => {
            const totalCans = customer.totalCans || 0;
            const price = customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 'N/A');
            
            return `
                <tr>
                    <td class="fw-bold">${customer.name}</td>
                    <td><span class="customer-type badge">${this.getCustomerTypeIcon(customer.type)}</span></td>
                    <td>
                        <div class="text-sm"><i class="fas fa-phone text-muted"></i> ${customer.phone}</div>
                        <div class="text-xs text-muted">${customer.address.substring(0, 20)}${customer.address.length > 20 ? '...' : ''}</div>
                    </td>
                    <td>
                        <div class="text-sm"><strong>${totalCans}</strong> Cans</div>
                        <div class="text-xs text-success">₹${price}/can</div>
                    </td>
                    <td>
                        <div class="action-buttons-row">
                            <button class="btn btn-sm btn-primary" onclick="quickDelivery('${customer.id}')" title="Deliver">
                                <i class="fas fa-truck"></i>
                            </button>
                            <button class="btn btn-sm btn-secondary" onclick="generateCustomerQR('${customer.id}')" title="QR Code">
                                <i class="fas fa-qrcode"></i>
                            </button>
                            <button class="btn btn-sm btn-outline" onclick="viewCustomerDetails('${customer.id}')" title="Details">
                                <i class="fas fa-eye"></i>
                            </button>
                            ${this.userRole === 'owner' ? `
                            <button class="btn btn-sm btn-outline" onclick="editCustomer('${customer.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
                            </button>
                            ` : ''}
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

    async addCustomer(e) {
        e.preventDefault();
        
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        const customerData = {
            name: document.getElementById('customerName').value,
            phone: document.getElementById('customerPhone').value,
            address: document.getElementById('customerAddress').value,
            type: document.getElementById('customerType').value,
            pricePerCan: parseInt(document.getElementById('customerPrice').value) || (this.userData ? this.userData.defaultPrice : 20),
            createdBy: this.authUserId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            totalCans: 0, 
            totalDeliveries: 0
        };
        
        if (!this.userId) {
            showError('Authentication failed. Please sign in again.');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn.disabled) return; 

        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

        try {
            const docRef = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').add(customerData);
            customerData.id = docRef.id;
            
            this.customers.push(customerData);
            this.filteredCustomers.push(customerData); 

            try {
                await this.generateAndStoreQRCode(docRef.id, customerData);
            } catch (qrError) {
                console.error('QR code generation failed:', qrError);
                showError('Customer added but QR code generation failed');
            }

            await this.addNotification('New Customer Added', `Added customer: ${customerData.name} (by ${this.userRole})`, 'success');

            e.target.reset();
            this.closeModal('addCustomerModal');
            
            this.filterCustomers(''); 
            this.displayCustomers();
            this.loadCustomerSelect();
            this.updateDashboard();
            
            showSuccess('Customer added successfully!');
            
        } catch (error) {
            console.error('Error adding customer:', error);
            showError('Failed to add customer');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

    editCustomer(customerId) {
        if (this.userRole === 'staff') {
            showError('Only the business owner can edit customers.');
            return;
        }

        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) {
            showError('Customer not found');
            return;
        }

        document.getElementById('editCustomerId').value = customer.id;
        document.getElementById('editCustomerName').value = customer.name;
        document.getElementById('editCustomerPhone').value = customer.phone;
        document.getElementById('editCustomerAddress').value = customer.address;
        document.getElementById('editCustomerType').value = customer.type || 'home';
        document.getElementById('editCustomerPrice').value = customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);

        this.showModal('editCustomerModal');
    }

    async updateCustomer(e) {
        e.preventDefault();
        
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const customerId = document.getElementById('editCustomerId').value;

        const customerData = {
            name: document.getElementById('editCustomerName').value,
            phone: document.getElementById('editCustomerPhone').value,
            address: document.getElementById('editCustomerAddress').value,
            type: document.getElementById('editCustomerType').value,
            pricePerCan: parseInt(document.getElementById('editCustomerPrice').value) || (this.userData ? this.userData.defaultPrice : 20),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).update(customerData);
            
            const customerIndex = this.customers.findIndex(c => c.id === customerId);
            if (customerIndex !== -1) {
                this.customers[customerIndex] = { ...this.customers[customerIndex], ...customerData };
            }

            const filteredIndex = this.filteredCustomers.findIndex(c => c.id === customerId);
            if (filteredIndex !== -1) {
                this.filteredCustomers[filteredIndex] = { ...this.filteredCustomers[filteredIndex], ...customerData };
            }

            await this.addNotification('Customer Updated', `Updated customer: ${customerData.name}`, 'info');

            this.closeModal('editCustomerModal');
            this.displayCustomers();
            this.loadCustomerSelect();
            
            showSuccess('Customer updated successfully!');
            
        } catch (error) {
            console.error('Error updating customer:', error);
            showError('Failed to update customer');
        }
    }

    async deleteCustomer(customerId) {
        if (this.userRole === 'staff') {
            showError('Only the business owner can delete customers.');
            return;
        }

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        try {
            const customer = this.customers.find(c => c.id === customerId);
            if (!customer) {
                showError('Customer not found');
                return;
            }

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).delete();

            const deliveriesSnapshot = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries')
                .where('customerId', '==', customerId)
                .get();
            
            const deletePromises = deliveriesSnapshot.docs.map(doc => doc.ref.delete());
            await Promise.all(deletePromises);

            this.customers = this.customers.filter(c => c.id !== customerId);
            this.filteredCustomers = this.filteredCustomers.filter(c => c.id !== customerId);
            this.deliveries = this.deliveries.filter(d => d.customerId !== customerId);
            this.filteredDeliveries = this.filteredDeliveries.filter(d => d.customerId !== customerId);

            await this.addNotification('Customer Deleted', `Deleted customer: ${customer.name}`, 'warning');

            this.displayCustomers();
            this.loadCustomerSelect();
            this.updateDashboard();
            this.closeModal('deleteConfirmModal');
            
            showSuccess('Customer deleted successfully!');
            
        } catch (error) {
            console.error('Error deleting customer:', error);
            showError('Failed to delete customer');
        }
    }

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

    async generateAndStoreQRCode(customerId, customerData) {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            // QR Data uses the OWNER'S ID so any staff can scan it
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
    
    async generateCustomerQR(customerId) {
        try {
            const customer = this.customers.find(c => c.id === customerId);
            if (!customer) {
                showError('Customer not found.');
                return;
            }
            
            if (!customer.qrCodeUrl) {
                if(confirm("QR Code not generated yet. Generate now?")) {
                     showSuccess("Generating QR Code...");
                     await this.generateAndStoreQRCode(customerId, customer);
                     await this.loadCustomers();
                     const updatedCustomer = this.customers.find(c => c.id === customerId);
                     if(updatedCustomer && updatedCustomer.qrCodeUrl) {
                         this.printQRWindow(updatedCustomer);
                     }
                }
                return;
            }

            this.printQRWindow(customer);
            
        } catch (error) {
            console.error('Error displaying QR code:', error);
            showError('Failed to display QR code.');
        }
    }

    printQRWindow(customer) {
        const qrWindow = window.open('', '_blank');
        if(!qrWindow) {
             showError('Pop-up blocked. Please allow pop-ups to print QR code.');
             return;
        }
        
        const businessName = this.userData?.businessName || 'AquaFlow Pro';
        
        qrWindow.document.write(`
            <html>
                <head>
                    <title>QR Card - ${customer.name}</title>
                    <style>
                        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
                        body { 
                            font-family: 'Inter', sans-serif; 
                            background: #f3f4f6;
                            display: flex;
                            flex-direction: column;
                            align-items: center;
                            justify-content: center;
                            min-height: 100vh;
                            margin: 0;
                            padding: 20px;
                        }
                        .card {
                            background: white;
                            width: 350px;
                            border-radius: 16px;
                            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                            overflow: hidden;
                            text-align: center;
                            border: 1px solid #e5e7eb;
                        }
                        .card-header {
                            background: linear-gradient(135deg, #0066ff 0%, #0047b3 100%);
                            color: white;
                            padding: 24px 20px;
                        }
                        .business-name {
                            font-size: 1.5rem;
                            font-weight: 700;
                            margin: 0;
                            line-height: 1.2;
                        }
                        .card-subtitle {
                            font-size: 0.875rem;
                            opacity: 0.9;
                            margin-top: 4px;
                        }
                        .card-body {
                            padding: 30px 20px;
                        }
                        .qr-image {
                            width: 220px;
                            height: 220px;
                            object-fit: contain;
                            border: 2px solid #f3f4f6;
                            border-radius: 12px;
                            margin-bottom: 20px;
                            padding: 10px;
                        }
                        .customer-name {
                            font-size: 1.25rem;
                            font-weight: 700;
                            color: #111827;
                            margin: 0 0 8px 0;
                        }
                        .customer-details {
                            color: #6b7280;
                            font-size: 0.9rem;
                            line-height: 1.5;
                        }
                        .scan-instruction {
                            margin-top: 20px;
                            padding-top: 20px;
                            border-top: 1px dashed #e5e7eb;
                            font-size: 0.8rem;
                            color: #9ca3af;
                            text-transform: uppercase;
                            letter-spacing: 1px;
                            font-weight: 600;
                        }
                        .btn-print { 
                            background: #0066ff; 
                            color: white; 
                            padding: 12px 24px; 
                            border: none; 
                            cursor: pointer; 
                            font-size: 16px; 
                            margin-top: 30px; 
                            border-radius: 8px; 
                            font-weight: 600;
                            box-shadow: 0 4px 6px rgba(0,102,255,0.3);
                            transition: transform 0.2s;
                        }
                        .btn-print:hover { transform: translateY(-2px); }
                        
                        @media print {
                            body { background: white; padding: 0; justify-content: flex-start; margin-top: 20px; }
                            .card { box-shadow: none; border: 2px solid #e5e7eb; }
                            .btn-print { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <div class="card-header">
                            <h1 class="business-name">${businessName}</h1>
                            <div class="card-subtitle">Water Delivery Service</div>
                        </div>
                        <div class="card-body">
                            <img src="${customer.qrCodeUrl}" alt="QR Code" class="qr-image">
                            
                            <h2 class="customer-name">${customer.name}</h2>
                            <div class="customer-details">
                                <div>${customer.phone}</div>
                                <div>${customer.address}</div>
                            </div>
                            
                            <div class="scan-instruction">
                                <svg style="width:16px;height:16px;vertical-align:middle;margin-right:4px" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path></svg>
                                Scan to Record Delivery
                            </div>
                        </div>
                    </div>
                    <button class="btn-print" onclick="window.print()">Print Card</button>
                </body>
            </html>
        `);
        qrWindow.document.close();
    }

    loadCustomerSelect() {
        const select = document.getElementById('billCustomer');
        if (!select) return;

        while (select.options.length > 1) {
            select.remove(1);
        }

        this.customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = `${customer.name} - ${customer.phone}`;
            select.appendChild(option);
        });
    }

    // Scanner Functions
    openScanner() {
        this.showModal('scannerModal');
    }

    closeScanner() {
        this.closeModal('scannerModal');
        this.stopScanner();
    }

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

    async confirmDelivery() {
        if (!this.currentCustomerId) {
            showError('No customer selected.');
            return;
        }

        const quantityInput = document.getElementById('deliveryQuantity');
        const quantity = parseInt(quantityInput ? quantityInput.value : 1) || 1;
        
        if (quantity < 1) {
            showError('Please enter a valid quantity.');
            return;
        }
        
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        try {
            const deliveryData = {
                customerId: this.currentCustomerId,
                quantity: quantity,
                timestamp: new Date(),
                month: getCurrentMonth(),
                recordedBy: this.authUserId, // Track which staff recorded it
                recordedByName: this.userRole === 'staff' ? 'Staff' : 'Owner' 
            };

            const docRef = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries').add(deliveryData);
            deliveryData.id = docRef.id;
            
            const customerRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(this.currentCustomerId);
            await customerRef.update({
                totalCans: firebase.firestore.FieldValue.increment(quantity),
                totalDeliveries: firebase.firestore.FieldValue.increment(1)
            });

            const customer = this.customers.find(c => c.id === this.currentCustomerId);
            if (customer) {
                customer.totalCans = (customer.totalCans || 0) + quantity;
                customer.totalDeliveries = (customer.totalDeliveries || 0) + 1;
            }

            const filteredCust = this.filteredCustomers.find(c => c.id === this.currentCustomerId);
            if (filteredCust) {
                filteredCust.totalCans = (filteredCust.totalCans || 0) + quantity;
            }

            this.deliveries.unshift(deliveryData); // Add to local list for recent display
            this.filteredDeliveries.unshift(deliveryData);

            await this.addNotification('Delivery Recorded', `Delivered ${quantity} can(s) to ${customer?.name || 'customer'}`, 'delivery');
            
            showSuccess(`Delivery recorded: ${quantity} can(s) delivered`);
            this.closeScanner();
            this.updateDashboard();
            this.displayCustomers(); 
            
        } catch (error) {
            console.error('Error recording delivery:', error);
            showError('Failed to record delivery.');
        }
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

    showManualCustomerSelect() {
        const scannerView = document.getElementById('scannerView');
        if (!scannerView) return;
        
        const customerSelectHTML = `
            <div class="manual-customer-select">
                <h4>Select Customer</h4>
                <select id="manualCustomerSelect" class="form-input">
                    <option value="">Choose a customer...</option>
                    ${this.customers.map(customer => 
                        `<option value="${customer.id}">${customer.name} - ${customer.phone}</option>`
                    ).join('')}
                </select>
                <div class="form-actions" style="margin-top: 1rem;">
                    <button class="btn btn-success" onclick="confirmManualCustomer()">
                        <i class="fas fa-check"></i> Select Customer
                    </button>
                    <button class="btn btn-secondary" onclick="resetScanner()">
                        <i class="fas fa-times"></i> Cancel
                    </button>
                </div>
            </div>
        `;
        
        scannerView.innerHTML = customerSelectHTML;
        const qrReader = document.getElementById('qrReader');
        if (qrReader) qrReader.classList.add('hidden');
    }

    showView(viewName) {
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        const activeView = document.getElementById(viewName + 'View');
        if (activeView) {
            activeView.classList.add('active');
            this.currentView = viewName;
        }

        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const navItem = document.querySelector(`.bottom-nav .nav-item[onclick="showView('${viewName}')"]`);
        if (navItem) {
            navItem.classList.add('active');
        }

        // View specific initializations
        if (viewName === 'reports') {
            this.generateReports();
        }
        if (viewName === 'deliveries') {
            this.filteredDeliveries = [...this.deliveries];
            this.deliveryPage = 1;
            this.displayDeliveries();
        }
    }

    // Dashboard Functions
    updateDashboard() {
        this.updateStats();
        this.updateRecentDeliveries();
    }

    updateStats() {
        const totalCustomersEl = document.getElementById('totalCustomers');
        if (totalCustomersEl) totalCustomersEl.textContent = this.customers.length;
        
        const today = new Date().toDateString();
        const todayDeliveries = this.deliveries.filter(d => 
            d.timestamp && new Date(d.timestamp.seconds * 1000).toDateString() === today
        );
        let todayCans = 0;
        todayDeliveries.forEach(d => todayCans += d.quantity || 1);
        
        const todayDeliveriesEl = document.getElementById('todayDeliveries');
        if (todayDeliveriesEl) todayDeliveriesEl.textContent = todayCans;
        
        const currentMonth = getCurrentMonth();
        const monthlyDeliveries = this.deliveries.filter(d => d.month === currentMonth);
        let monthlyRevenue = 0;
        
        monthlyDeliveries.forEach(delivery => {
            const customer = this.customers.find(c => c.id === delivery.customerId);
            const price = customer?.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);
            monthlyRevenue += (delivery.quantity || 1) * price;
        });
        
        const monthlyRevenueEl = document.getElementById('monthlyRevenue');
        if (monthlyRevenueEl) monthlyRevenueEl.textContent = formatCurrency(monthlyRevenue);
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
            const price = customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);
            const amount = (delivery.quantity || 1) * price;
            
            return `
                <div class="activity-item">
                    <div class="activity-icon">
                        <i class="fas fa-truck"></i>
                    </div>
                    <div class="activity-info">
                        <h4>${customer.name}</h4>
                        <p>${delivery.quantity} can(s) • ${deliveryDate.toLocaleDateString()}</p>
                    </div>
                    ${this.userRole === 'owner' ? `<div class="activity-amount">${formatCurrency(amount)}</div>` : ''}
                </div>
            `;
        }).join('');
    }

    // Billing Functions
    async generateBills() {
        const monthInput = document.getElementById('billMonth');
        const customerSelect = document.getElementById('billCustomer');
        
        if (!monthInput || !customerSelect) return;
        
        const month = monthInput.value;
        const customerId = customerSelect.value;
        
        if (!month) {
            showError('Please select a month.');
            return;
        }

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        try {
            let bills = [];
            
            if (customerId === 'all') {
                bills = await this.calculateMonthlyBills(month, appId);
            } else {
                const bill = await this.calculateCustomerBill(customerId, month, appId);
                bills = bill ? [bill] : [];
            }

            this.displayBills(bills);
            
        } catch (error) {
            console.error('Error generating bills:', error);
            showError('Failed to generate bills.');
        }
    }

    async calculateMonthlyBills(month, appId) {
        const bills = [];
        
        for (const customer of this.customers) {
            const bill = await this.calculateCustomerBill(customer.id, month, appId);
            if (bill && bill.totalCans > 0) {
                bills.push(bill);
            }
        }
        
        return bills;
    }

    async calculateCustomerBill(customerId, month, appId) {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return null;

        const monthlyDeliveries = this.deliveries.filter(d => 
            d.customerId === customerId && d.month === month
        );

        const totalCans = monthlyDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);

        if (totalCans === 0) return null;

        const pricePerCan = customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);
        const totalAmount = totalCans * pricePerCan;

        const isPaid = this.payments.some(p => 
            p.customerId === customerId && p.month === month
        );

        return {
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerAddress: customer.address,
            month: month,
            totalCans: totalCans,
            pricePerCan: pricePerCan,
            totalAmount: totalAmount,
            deliveries: monthlyDeliveries.length,
            isPaid: isPaid
        };
    }

    displayBills(bills) {
        const container = document.getElementById('billsList');
        const results = document.getElementById('billingResults');
        
        if (!container || !results) return;

        if (bills.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-file-invoice"></i>
                    <p>No bills found for selected period</p>
                </div>
            `;
        } else {
            container.innerHTML = bills.map(bill => `
                <div class="bill-card">
                    <div class="bill-header">
                        <div class="customer-name">${bill.customerName}</div>
                        <span class="bill-month">${bill.month}</span>
                    </div>
                    <div class="bill-details">
                        <div><i class="fas fa-phone"></i> ${bill.customerPhone}</div>
                        <div><i class="fas fa-tint"></i> ${bill.totalCans} cans × ₹${bill.pricePerCan}</div>
                        <div><i class="fas fa-truck"></i> ${bill.deliveries} deliveries</div>
                    </div>
                    <div class="bill-amount">${formatCurrency(bill.totalAmount)}</div>
                    <div class="bill-actions">
                        ${bill.isPaid ? 
                            `<button class="btn btn-success" disabled>
                                <i class="fas fa-check-double"></i> PAID
                            </button>` : 
                            `<button class="btn btn-primary" onclick="markBillPaid('${bill.customerId}', '${bill.month}', ${bill.totalAmount})">
                                <i class="fas fa-check"></i> Mark Paid
                            </button>`
                        }
                         <button class="btn" style="background-color: #25D366; color: white;" onclick="app.sendWhatsAppReminder('${bill.customerId}', '${bill.month}', ${bill.totalAmount}, ${bill.totalCans})" title="Send WhatsApp Reminder">
                            <i class="fab fa-whatsapp"></i> Remind
                        </button>
                        <button class="btn btn-secondary" onclick="printBill('${bill.customerId}', '${bill.month}')">
                            <i class="fas fa-print"></i> Print
                        </button>
                    </div>
                </div>
            `).join('');
        }
        
        results.classList.remove('hidden');
    }

    sendWhatsAppReminder(customerId, month, amount, totalCans) {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return;

        // Robust Phone Number Formatting
        let phone = customer.phone.replace(/\D/g, ''); // Remove non-digits
        
        // Remove leading zero if present
        if (phone.startsWith('0')) {
            phone = phone.substring(1);
        }
        
        // Add country code (India default) if missing
        if (phone.length === 10) {
            phone = '91' + phone;
        }
        
        // Basic validation
        if (phone.length < 10) {
             showError('Invalid phone number format for WhatsApp.');
             return;
        }

        const businessName = this.userData.businessName || 'AquaFlow Pro';
        const contactInfo = this.userData.businessPhone || 'the business owner';
        
        // Create Message
        const message = `Hello ${customer.name},
Your water delivery bill for ${month} is *₹${amount}* (${totalCans} cans).

Please pay via Cash or PhonePe.
Contact us at: ${contactInfo}

Thank you,
${businessName}`;

        // Use api.whatsapp.com for better cross-platform compatibility
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(message)}`;
        
        const win = window.open(whatsappUrl, '_blank');
        
        if (!win) {
            window.location.href = whatsappUrl;
        }
    }

    async markBillPaid(customerId, month, amount) {
        if (!confirm(`Mark bill as paid for ${month}? Amount: ${formatCurrency(amount)}`)) return;

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            const paymentData = {
                customerId,
                month,
                amount,
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                recordedBy: this.authUserId
            };

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('payments').add(paymentData);
            
            this.payments.push(paymentData);
            
            await this.addNotification('Payment Received', `Payment of ${formatCurrency(amount)} received for ${month}`, 'payment');
            
            showSuccess('Payment recorded successfully!');
            
            this.generateBills();
            
        } catch (error) {
            console.error('Error recording payment:', error);
            showError('Failed to record payment');
        }
    }

    generateReports() {
        const monthlyReport = document.getElementById('monthlyReport');
        const topCustomersReport = document.getElementById('topCustomersReport');
        
        if (!monthlyReport || !topCustomersReport) return;

        const currentMonth = getCurrentMonth();
        const monthlyDeliveries = this.deliveries.filter(d => d.month === currentMonth);
        const totalMonthlyCans = monthlyDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);
        
        let monthlyRevenue = 0;
        monthlyDeliveries.forEach(delivery => {
            const customer = this.customers.find(c => c.id === delivery.customerId);
            const price = customer?.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);
            monthlyRevenue += (delivery.quantity || 1) * price;
        });

        monthlyReport.innerHTML = `
            <div style="text-align: center; width: 100%;">
                <div style="font-size: 2rem; font-weight: bold; color: var(--primary);">${formatCurrency(monthlyRevenue)}</div>
                <div style="color: var(--gray-600); margin-bottom: 1rem;">Total Revenue (${currentMonth})</div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem;">
                    <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: bold;">${totalMonthlyCans}</div>
                        <div style="font-size: 0.8rem;">Cans Delivered</div>
                    </div>
                    <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
                        <div style="font-size: 1.5rem; font-weight: bold;">${monthlyDeliveries.length}</div>
                        <div style="font-size: 0.8rem;">Trips Made</div>
                    </div>
                </div>
            </div>
        `;

        const sortedCustomers = [...this.customers]
            .sort((a, b) => (b.totalCans || 0) - (a.totalCans || 0))
            .slice(0, 5);

        if (sortedCustomers.length === 0 || !sortedCustomers[0].totalCans) {
             topCustomersReport.innerHTML = '<p style="text-align: center; color: var(--gray-500);">No data available yet</p>';
        } else {
            topCustomersReport.innerHTML = `
                <div style="width: 100%;">
                    ${sortedCustomers.map((customer, index) => `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.8rem 0; border-bottom: 1px solid var(--gray-200);">
                            <div style="display: flex; align-items: center; gap: 1rem;">
                                <div style="width: 30px; height: 30px; background: var(--primary); color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold;">${index + 1}</div>
                                <div>
                                    <div style="font-weight: 600;">${customer.name}</div>
                                    <div style="font-size: 0.8rem; color: var(--gray-500);">${this.getCustomerTypeIcon(customer.type)}</div>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-weight: bold; color: var(--primary);">${customer.totalCans || 0} cans</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }

    async saveSettings(e) {
        e.preventDefault();
        
        if (this.userRole === 'staff') {
            showError('Staff members cannot change business settings.');
            return;
        }

        const businessName = document.getElementById('settingsBusinessName').value;
        const defaultPrice = parseInt(document.getElementById('settingsDefaultPrice').value);
        const businessPhone = document.getElementById('settingsBusinessPhone').value;

        try {
             const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
             await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).update({
                 businessName,
                 defaultPrice,
                 businessPhone, // Save the contact number
                 updatedAt: firebase.firestore.FieldValue.serverTimestamp()
             });
             
             // Update local user data
             if (this.userData) {
                 this.userData.businessName = businessName;
                 this.userData.defaultPrice = defaultPrice;
                 this.userData.businessPhone = businessPhone;
             } else {
                 this.userData = { businessName, defaultPrice, businessPhone };
             }
             
             this.updateUI();
             this.closeModal('settingsModal');
             showSuccess('Settings saved successfully');
        } catch(error) {
            console.error(error);
            showError('Failed to save settings');
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
            if (error.code === 'auth/requires-recent-login') {
                showError('Please logout and login again to change your password.');
            } else {
                showError('Failed to update password.');
            }
        }
    }
    
    async resendVerificationEmail() {
        try {
            const user = auth.currentUser;
            if (user) {
                await user.sendEmailVerification();
                showSuccess('Verification email sent!');
            }
        } catch (error) {
            console.error('Error sending verification email:', error);
            if(error.code === 'auth/too-many-requests') {
                showError('Too many requests. Please try again later.');
            } else {
                showError('Failed to send email.');
            }
        }
    }
    
    // Added Staff Management Methods inside class
    async loadStaffMembers() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            // Query all users where ownerId matches current user ID (staff members)
            const staffSnapshot = await db.collection('artifacts').doc(appId).collection('users')
                .where('ownerId', '==', this.userId)
                .where('role', '==', 'staff')
                .get();
                
            this.staffMembers = staffSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.displayStaffMembers();
        } catch (error) {
            console.error('Error loading staff members:', error);
        }
    }

    displayStaffMembers() {
        const container = document.getElementById('staffMembersList');
        if (!container) return;

        if (!this.staffMembers || this.staffMembers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <p>No staff members added yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.staffMembers.map(staff => `
            <div class="staff-member-item">
                <div class="staff-info">
                    <div class="staff-name">${staff.ownerName}</div>
                    <div class="staff-email">${staff.email}</div>
                    <div class="staff-join-date">Joined: ${staff.createdAt?.toDate?.().toLocaleDateString() || 'N/A'}</div>
                </div>
                <div class="staff-actions">
                    <button class="btn btn-sm btn-danger" onclick="removeStaffMember('${staff.id}')">
                        <i class="fas fa-trash"></i> Remove
                    </button>
                </div>
            </div>
        `).join('');
    }

    async removeStaffMember(staffId) {
        if (!confirm('Are you sure you want to remove this staff member?')) return;
        
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            await db.collection('artifacts').doc(appId).collection('users').doc(staffId).delete();
            
            // Remove from local array
            this.staffMembers = this.staffMembers.filter(staff => staff.id !== staffId);
            this.displayStaffMembers();
            
            showSuccess('Staff member removed successfully');
        } catch (error) {
            console.error('Error removing staff member:', error);
            showError('Failed to remove staff member');
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
        
        // Trigger staff load when settings modal is opened
        if (modalId === 'settingsModal' && this.userRole === 'owner') {
            this.loadStaffMembers();
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
        
        // Settings Inputs
        const settingsBusinessName = document.getElementById('settingsBusinessName');
        const settingsDefaultPrice = document.getElementById('settingsDefaultPrice');
        const settingsBusinessPhone = document.getElementById('settingsBusinessPhone');
        const settingsBusinessId = document.getElementById('settingsBusinessId');

        if (settingsBusinessName && this.userData) {
            settingsBusinessName.value = this.userData.businessName || '';
        }
        if (settingsDefaultPrice && this.userData) {
            settingsDefaultPrice.value = this.userData.defaultPrice || 20;
        }
        if (settingsBusinessPhone && this.userData) {
            settingsBusinessPhone.value = this.userData.businessPhone || '';
        }
        if (settingsBusinessId && this.userId) {
            settingsBusinessId.value = this.userId; // Show User ID for sharing
        }

        // ROLE-BASED UI UPDATES
        const isStaff = this.userRole === 'staff';
        
        // Role Badge
        const roleBadge = document.getElementById('userRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = isStaff ? 'Staff' : 'Owner';
            roleBadge.className = isStaff ? 'badge bg-secondary' : 'badge bg-primary';
            roleBadge.style.display = 'inline-block';
        }
        
        // Hide/Show Elements based on data-role="owner"
        document.querySelectorAll('[data-role="owner"]').forEach(el => {
            if (isStaff) {
                el.style.display = 'none';
                el.classList.add('hidden');
            } else {
                el.style.display = '';
                el.classList.remove('hidden');
            }
        });
        
        this.showView(this.currentView);
    }
}

let app;

document.addEventListener('DOMContentLoaded', function() {
    app = new AquaFlowApp();
});

function showView(viewName) {
    if (app) app.showView(viewName);
}

function showAddCustomerModal() {
    if (app) app.showModal('addCustomerModal');
}

function closeModal(modalId) {
    if (app) app.closeModal(modalId);
}

function openScanner() {
    if (app) app.openScanner();
}

function closeScanner() {
    if (app) app.closeScanner();
}

function initializeScanner() {
    if (app) app.initializeScanner();
}

function confirmDelivery() {
    if (app) app.confirmDelivery();
}

function resetScanner() {
    if (app) app.resetScanner();
}

function showManualCustomerSelect() {
    if (app) app.showManualCustomerSelect();
}

function confirmManualCustomer() {
    if (!app) return;
    
    const select = document.getElementById('manualCustomerSelect');
    if (!select) return;
    
    const customerId = select.value;
    
    if (!customerId) {
        showError('Please select a customer');
        return;
    }
    
    const customer = app.customers.find(c => c.id === customerId);
    if (customer) {
        app.showDeliveryForm(customerId, customer);
    }
}

function showManualQRInput() {
    const scannerView = document.getElementById('scannerView');
    if (!scannerView) return;
    
    scannerView.innerHTML = `
        <div class="manual-qr-input">
            <h4>Enter QR Code Manually</h4>
            <input type="text" id="manualQRInput" class="form-input" placeholder="Paste QR code data here...">
            <div class="form-actions" style="margin-top: 1rem;">
                <button class="btn btn-success" onclick="processManualQR()">
                    <i class="fas fa-check"></i> Process QR Code
                </button>
                <button class="btn btn-secondary" onclick="resetScanner()">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    const qrReader = document.getElementById('qrReader');
    if (qrReader) qrReader.classList.add('hidden');
}

function processManualQR() {
    if (!app) return;
    
    const qrInput = document.getElementById('manualQRInput');
    if (!qrInput) return;
    
    const qrData = qrInput.value.trim();
    
    if (!qrData) {
        showError('Please enter QR code data');
        return;
    }
    
    app.handleScannedQR(qrData);
}

function quickDelivery(customerId) {
    const quantity = parseInt(prompt('Enter number of cans:', '1')) || 1;
    if (quantity > 0 && app) {
        const customer = app.customers.find(c => c.id === customerId);
        if (customer) {
            app.showDeliveryForm(customerId, customer);
            const quantityInput = document.getElementById('deliveryQuantity');
            if (quantityInput) quantityInput.value = quantity;
            app.showModal('scannerModal');
        }
    }
}

async function generateCustomerQR(customerId) {
    if (app) app.generateCustomerQR(customerId);
}

function generateBills() {
    if (app) app.generateBills();
}

function markBillPaid(customerId, month, amount) {
    if (app) app.markBillPaid(customerId, month, amount);
}

function printBill(customerId, month) {
    window.print();
}

function viewCustomerDetails(customerId) {
    if (app) app.viewCustomerDetails(customerId);
}

function editCustomer(customerId) {
    if (app) app.editCustomer(customerId);
}

function updateCustomer(e) {
    if (app) app.updateCustomer(e);
}

function deleteCustomer(customerId) {
    if (app) app.deleteCustomer(customerId);
}

function confirmDeleteCustomer() {
    const customerId = document.getElementById('customerToDelete').value;
    if (customerId && app) {
        app.deleteCustomer(customerId);
    }
}

function editCustomerFromDetails() {
    const customerId = document.getElementById('currentCustomerId').value;
    app.closeModal('customerDetailsModal');
    editCustomer(customerId);
}

function deleteCustomerFromDetails() {
    const customerId = document.getElementById('currentCustomerId').value;
    app.closeModal('customerDetailsModal');
    deleteCustomer(customerId);
}

function showNotifications() {
    if (app) {
        app.showView('notifications'); 
        app.loadNotifications();
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        if (!app || !app.userId) return;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        await db.collection('artifacts').doc(appId).collection('users').doc(app.userId).collection('notifications').doc(notificationId).update({
            read: true
        });
        await app.loadNotifications();
    } catch (error) { console.error(error); }
}

async function deleteNotification(notificationId) {
    try {
        if (!app || !app.userId) return;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        await db.collection('artifacts').doc(appId).collection('users').doc(app.userId).collection('notifications').doc(notificationId).delete();
        await app.loadNotifications();
    } catch (error) { console.error(error); }
}

async function clearAllNotifications() {
    if (!app) return;
    app.clearAllNotifications();
}

function showAllDeliveries() {
    showError('All deliveries view coming soon!');
}

function showSettings() {
    if (app) app.showModal('settingsModal');
}

function saveSettings(e) {
    if (app) app.saveSettings(e);
}

function logout() {
    authManager.logout();
}

function addCustomer(e) {
    if (app) app.addCustomer(e);
}

function copyBusinessId() {
    const input = document.getElementById('settingsBusinessId');
    input.select();
    document.execCommand('copy');
    showSuccess('Business ID copied to clipboard!');
}

// Global wrapper for removing staff members
function removeStaffMember(staffId) {
    if (app) app.removeStaffMember(staffId);
}
