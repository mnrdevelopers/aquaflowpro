// Main Application Class
class AquaFlowApp {
    constructor() {
        this.customers = [];
        this.deliveries = [];
        this.notifications = [];
        this.payments = []; // New: Track payments locally
        this.currentView = 'dashboard';
        this.scannerActive = false;
        this.currentCustomerId = null;
        this.userId = null;
        this.userData = null;
        this.html5QrCode = null;
        this.init();
    }

    async init() {
        console.log('App initialization started');
        
        // CRITICAL FIX: Wait for auth state to be ready
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
        const maxAttempts = 50; // 5 seconds max wait
        
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
            // User is definitely signed out
            console.log('No user found, redirecting to auth.html');
            window.location.href = 'auth.html';
            return false;
        }
        
        this.userId = user.uid;
        
        // CRITICAL FIX: More tolerant approach - if userData is missing but user exists,
        // try to load it directly instead of immediately failing
        if (!this.userData) {
            console.log('User data missing, attempting to load directly...');
            await authManager.loadUserData(user);
            this.userData = authManager.getUserData();
            
            if (!this.userData) {
                console.error('CRITICAL: User is signed in, but user data is unavailable even after reload. User ID:', this.userId);
                // Instead of blocking completely, use safe defaults and continue
                this.userData = {
                    businessName: 'AquaFlow Pro',
                    defaultPrice: 20
                };
                showError('User data loading issue. Using default settings.');
            }
        }
        
        return true;
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
        // Use Promise.all to load data concurrently and provide better user experience
        await Promise.all([
            this.loadCustomers(),
            this.loadCurrentMonthDeliveries(), // Changed to load whole month
            this.loadNotifications(),
            this.loadPayments() // New: Load payment history
        ]);
        this.updateDashboard();
        
        console.log('App initialization complete.');
    }

    async loadCustomers() {
        try {
            // Use the global __app_id variable for Firestore path
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            // Ensure this.userId is defined before querying
            if (!this.userId) {
                throw new Error('User ID is undefined. Cannot load customers.');
            }
            
            // CRITICAL FIX: Use the secure, Canvas-compliant Firestore path
            const customersCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers');
            
            const snapshot = await customersCollectionRef
                .orderBy('name')
                .get();
            
            this.customers = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
            this.displayCustomers();
            this.loadCustomerSelect();
            
        } catch (error) {
            console.error('Error loading customers:', error);
            showError('Failed to load customers'); 
        }
    }

    // Renamed and Updated to load entire current month for accurate Reports/Billing
    async loadCurrentMonthDeliveries() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            if (!this.userId) {
                throw new Error('User ID is undefined. Cannot load deliveries.');
            }
            
            const deliveriesCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries');
            
            const currentMonth = getCurrentMonth();
            
            // FIX: Query by 'month' string which is stored on delivery (e.g. "2023-10")
            // This ensures we get ALL deliveries for the current month, not just last 7 days
            const snapshot = await deliveriesCollectionRef
                .where('month', '==', currentMonth)
                .orderBy('timestamp', 'desc')
                .limit(500) // Safety limit
                .get();
            
            this.deliveries = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            
        } catch (error) {
            console.error('Error loading deliveries:', error);
            showError('Failed to load recent deliveries.');
        }
    }

    async loadNotifications() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            if (!this.userId) return;

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

    // NEW: Load Payments
    async loadPayments() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            if (!this.userId) return;

            const paymentsRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('payments');
            
            // Load recent payments
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
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('notifications').add(notificationData);
            
            // Reload notifications
            await this.loadNotifications();
            
        } catch (error) {
            console.error('Error adding notification:', error);
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
            
            const title = notification.title || 'Notification';
            const message = notification.message || '';

            return `
                <div class="notification-item ${notification.read ? '' : 'unread'}" data-id="${notification.id}">
                    <div class="notification-icon ${notification.type}">
                        <i class="fas fa-${this.getNotificationIcon(notification.type)}"></i>
                    </div>
                    <div class="notification-content">
                        <h4>${title}</h4>
                        <p>${message}</p>
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

    // Customer Management
    displayCustomers() {
        const container = document.getElementById('customersList');
        if (!container) return;

        if (this.customers.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-users"></i>
                    <h3>No Customers Yet</h3>
                    <p>Add your first customer to start managing deliveries</p>
                    <button class="btn btn-primary" onclick="showAddCustomerModal()">
                        <i class="fas fa-user-plus"></i> Add First Customer
                    </button>
                </div>
            `;
            return;
        }

        container.innerHTML = this.customers.map(customer => {
            // FIX: Use the aggregated totalCans from the customer document
            // Fallback to 0 if it doesn't exist yet
            const totalCans = customer.totalCans || 0;
            
            const price = customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 'N/A');
            
            return `
                <div class="customer-card">
                    <div class="customer-header">
                        <div class="customer-name">${customer.name}</div>
                        <span class="customer-type">${this.getCustomerTypeIcon(customer.type)}</span>
                    </div>
                    <div class="customer-details">
                        <div><i class="fas fa-phone"></i> ${customer.phone}</div>
                        <div><i class="fas fa-map-marker-alt"></i> ${customer.address}</div>
                        <div><i class="fas fa-tint"></i> <strong>${totalCans}</strong> total cans delivered • ₹${price}/can</div>
                    </div>
                    <div class="customer-actions">
                        <button class="btn btn-primary" onclick="quickDelivery('${customer.id}')">
                            <i class="fas fa-truck"></i> Deliver
                        </button>
                        <button class="btn btn-secondary" onclick="generateCustomerQR('${customer.id}')">
                            <i class="fas fa-qrcode"></i> QR Code
                        </button>
                        <button class="btn btn-outline" onclick="viewCustomerDetails('${customer.id}')">
                            <i class="fas fa-eye"></i> View
                        </button>
                        <button class="btn btn-outline" onclick="editCustomer('${customer.id}')">
                            <i class="fas fa-edit"></i> Edit
                        </button>
                    </div>
                </div>
            `;
        }).join('');
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
        const filtered = this.customers.filter(customer =>
            customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            customer.phone.includes(searchTerm) ||
            customer.address.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        const container = document.getElementById('customersList');
        if (filtered.length === 0) {
            container.innerHTML = '<div class="empty-state">No customers found matching your search</div>';
            return;
        }

        const originalCustomers = this.customers;
        this.customers = filtered;
        this.displayCustomers();
        this.customers = originalCustomers;
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
            userId: this.userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            totalCans: 0, // Initialize counters
            totalDeliveries: 0
        };
        
        if (!this.userId) {
            showError('Authentication failed. Please sign in again.');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn.disabled || submitBtn.classList.contains('disabled')) return; 

        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adding...';

        try {
            const docRef = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').add(customerData);
            customerData.id = docRef.id;
            
            this.customers.push(customerData);

            try {
                await this.generateAndStoreQRCode(docRef.id, customerData);
            } catch (qrError) {
                console.error('QR code generation failed:', qrError);
                showError('Customer added but QR code generation failed');
            }

            await this.addNotification('New Customer Added', `Added customer: ${customerData.name}`, 'success');

            e.target.reset();
            this.closeModal('addCustomerModal');
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
                // Preserve existing counters when updating info
                this.customers[customerIndex] = { ...this.customers[customerIndex], ...customerData };
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
            this.deliveries = this.deliveries.filter(d => d.customerId !== customerId);

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

        // Calculate customer statistics
        const customerDeliveries = this.deliveries.filter(d => d.customerId === customerId);
        // Use persisted total if available, else fallback to loaded deliveries
        const totalCans = customer.totalCans || customerDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);
        const totalDeliveries = customer.totalDeliveries || customerDeliveries.length;
        
        const currentMonth = getCurrentMonth();
        const monthlyDeliveries = customerDeliveries.filter(d => d.month === currentMonth);
        const monthlyCans = monthlyDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);

        // Populate details modal
        document.getElementById('detailCustomerName').textContent = customer.name;
        document.getElementById('detailCustomerPhone').textContent = customer.phone;
        document.getElementById('detailCustomerAddress').textContent = customer.address;
        document.getElementById('detailCustomerType').textContent = this.getCustomerTypeIcon(customer.type);
        document.getElementById('detailCustomerPrice').textContent = `₹${customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 20)}`;
        document.getElementById('detailTotalDeliveries').textContent = totalDeliveries;
        document.getElementById('detailTotalCans').textContent = totalCans;
        document.getElementById('detailThisMonth').textContent = `${monthlyCans} cans`;

        // Store customer ID for actions
        document.getElementById('currentCustomerId').value = customerId;

        this.showModal('customerDetailsModal');
    }

    async generateAndStoreQRCode(customerId, customerData) {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            const qrData = `AQUAFLOW:${customerId}:${this.userId}`;
            
            const canvas = document.createElement('canvas');
            if (typeof QRCode === 'undefined' || !QRCode.toCanvas) {
                console.warn('QRCode library not loaded.');
                return;
            }
            
            await QRCode.toCanvas(canvas, qrData, {
                width: 300,
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

    async initializeScanner() {
        try {
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
        // ... (Error handling logic remains same)
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

        const [, customerId, userId] = qrData.split(':');
        
        if (userId !== this.userId) {
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
        if (customerName) customerName.textContent = customer.name;
        
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
                userId: this.userId
            };

            // 1. Add delivery record
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries').add(deliveryData);
            
            // 2. FIX: Update customer Total Cans and Total Deliveries counters atomically
            const customerRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(this.currentCustomerId);
            await customerRef.update({
                totalCans: firebase.firestore.FieldValue.increment(quantity),
                totalDeliveries: firebase.firestore.FieldValue.increment(1)
            });

            // Update local state for immediate UI feedback
            const customer = this.customers.find(c => c.id === this.currentCustomerId);
            if (customer) {
                customer.totalCans = (customer.totalCans || 0) + quantity;
                customer.totalDeliveries = (customer.totalDeliveries || 0) + 1;
            }

            await this.addNotification('Delivery Recorded', `Delivered ${quantity} can(s) to ${customer?.name || 'customer'}`, 'delivery');
            
            showSuccess(`Delivery recorded: ${quantity} can(s) delivered`);
            this.closeScanner();
            
            // Reload data to ensure consistency
            await this.loadCurrentMonthDeliveries();
            this.updateDashboard();
            this.displayCustomers(); // Refresh customer list to show new totals
            
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

    // View Management
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

        // Generate reports if viewing reports
        if (viewName === 'reports') {
            this.generateReports();
        }
    }

    // Dashboard Functions
    updateDashboard() {
        this.updateStats();
        this.updateRecentDeliveries();
    }

    updateStats() {
        // Total customers
        const totalCustomersEl = document.getElementById('totalCustomers');
        if (totalCustomersEl) totalCustomersEl.textContent = this.customers.length;
        
        // Today's deliveries
        const today = new Date().toDateString();
        const todayDeliveries = this.deliveries.filter(d => 
            d.timestamp && new Date(d.timestamp.seconds * 1000).toDateString() === today
        );
        let todayCans = 0;
        todayDeliveries.forEach(d => todayCans += d.quantity || 1);
        
        const todayDeliveriesEl = document.getElementById('todayDeliveries');
        if (todayDeliveriesEl) todayDeliveriesEl.textContent = todayCans;
        
        // Monthly revenue
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
                    <div class="activity-amount">${formatCurrency(amount)}</div>
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

        // Use local deliveries array which now contains full month data
        const monthlyDeliveries = this.deliveries.filter(d => 
            d.customerId === customerId && d.month === month
        );

        const totalCans = monthlyDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);

        if (totalCans === 0) return null;

        const pricePerCan = customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);
        const totalAmount = totalCans * pricePerCan;

        // Check if already paid
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
                        <button class="btn btn-secondary" onclick="printBill('${bill.customerId}', '${bill.month}')">
                            <i class="fas fa-print"></i> Print
                        </button>
                    </div>
                </div>
            `).join('');
        }
        
        results.classList.remove('hidden');
    }

    // NEW: Mark bill as paid
    async markBillPaid(customerId, month, amount) {
        if (!confirm(`Mark bill as paid for ${month}? Amount: ${formatCurrency(amount)}`)) return;

        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            const paymentData = {
                customerId,
                month,
                amount,
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                userId: this.userId
            };

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('payments').add(paymentData);
            
            // Update local state
            this.payments.push(paymentData);
            
            await this.addNotification('Payment Received', `Payment of ${formatCurrency(amount)} received for ${month}`, 'payment');
            
            showSuccess('Payment recorded successfully!');
            
            // Refresh bills display
            this.generateBills();
            
        } catch (error) {
            console.error('Error recording payment:', error);
            showError('Failed to record payment');
        }
    }

    // NEW: Generate Reports
    generateReports() {
        const monthlyReport = document.getElementById('monthlyReport');
        const topCustomersReport = document.getElementById('topCustomersReport');
        
        if (!monthlyReport || !topCustomersReport) return;

        // 1. Monthly Performance Report
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

        // 2. Top Customers Report
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

    // ... (Existing methods: saveSettings, showModal, closeModal, updateUI)
    
    // NEW METHOD: Save settings to Firestore
    async saveSettings(e) {
        e.preventDefault();
        const businessName = document.getElementById('settingsBusinessName').value;
        const defaultPrice = parseInt(document.getElementById('settingsDefaultPrice').value);

        try {
             const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
             await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).update({
                 businessName,
                 defaultPrice,
                 updatedAt: firebase.firestore.FieldValue.serverTimestamp()
             });
             
             // Update local state
             if (this.userData) {
                 this.userData.businessName = businessName;
                 this.userData.defaultPrice = defaultPrice;
             } else {
                 this.userData = { businessName, defaultPrice };
             }
             
             this.updateUI();
             this.closeModal('settingsModal');
             showSuccess('Settings saved successfully');
        } catch(error) {
            console.error(error);
            showError('Failed to save settings');
        }
    }

    // Utility Functions
    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }

    updateUI() {
        // Update business name
        const businessNameElement = document.getElementById('businessName');
        if (businessNameElement && this.userData) {
            businessNameElement.textContent = this.userData.businessName;
        }
        
        // Update settings modal inputs
        const settingsBusinessName = document.getElementById('settingsBusinessName');
        const settingsDefaultPrice = document.getElementById('settingsDefaultPrice');
        if (settingsBusinessName && this.userData) {
            settingsBusinessName.value = this.userData.businessName || '';
        }
        if (settingsDefaultPrice && this.userData) {
            settingsDefaultPrice.value = this.userData.defaultPrice || 20;
        }
        
        // Show the initial view
        this.showView(this.currentView);
    }
}

// Global functions for HTML event handlers
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
    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        const customerDoc = await db.collection('artifacts').doc(appId).collection('users').doc(app.userId).collection('customers').doc(customerId).get();
        if (!customerDoc.exists) {
            showError('Customer not found.');
            return;
        }

        const customer = customerDoc.data();
        
        if (!customer.qrCodeUrl) {
            showError('QR code not generated yet. Please wait or contact support.');
            return;
        }

        // Open QR code in new window for printing
        const qrWindow = window.open('', '_blank');
        qrWindow.document.write(`
            <html>
                <head>
                    <title>QR Code - ${customer.name}</title>
                    <style>
                        body { 
                            font-family: Arial, sans-serif; 
                            text-align: center; 
                            padding: 2rem;
                            background: white;
                        }
                        .qr-container { 
                            margin: 2rem auto; 
                            max-width: 400px;
                        }
                        .customer-info {
                            margin-bottom: 2rem;
                            padding: 1rem;
                            background: #f8f9fa;
                            border-radius: 8px;
                        }
                        .print-btn {
                            background: #0066ff;
                            color: white;
                            padding: 12px 24px;
                            border: none;
                            border-radius: 8px;
                            cursor: pointer;
                            font-size: 16px;
                            margin-top: 1rem;
                        }
                    </style>
                </head>
                <body>
                    <h2>${customer.name} - Delivery QR Code</h2>
                    <div class="customer-info">
                        <p><strong>Phone:</strong> ${customer.phone}</p>
                        <p><strong>Address:</strong> ${customer.address}</p>
                        <p><strong>Type:</strong> ${customer.type}</p>
                    </div>
                    <div class="qr-container">
                        <img src="${customer.qrCodeUrl}" alt="QR Code" style="max-width: 100%; border: 2px solid #333; padding: 1rem; background: white;">
                        <p><small>Scan this QR code at customer's location to record delivery</small></p>
                    </div>
                    <button class="print-btn" onclick="window.print()">Print QR Code</button>
                </body>
            </html>
        `);
        qrWindow.document.close();
        
    } catch (error) {
        console.error('Error displaying QR code:', error);
        showError('Failed to display QR code.');
    }
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

// CRUD Operations for Customers
function viewCustomerDetails(customerId) {
    if (app) app.viewCustomerDetails(customerId);
}

function editCustomer(customerId) {
    const customer = app.customers.find(c => c.id === customerId);
    if (!customer) {
        showError('Customer not found');
        return;
    }

    // Populate edit form
    document.getElementById('editCustomerId').value = customer.id;
    document.getElementById('editCustomerName').value = customer.name;
    document.getElementById('editCustomerPhone').value = customer.phone;
    document.getElementById('editCustomerAddress').value = customer.address;
    document.getElementById('editCustomerType').value = customer.type || 'home';
    document.getElementById('editCustomerPrice').value = customer.pricePerCan || (app.userData ? app.userData.defaultPrice : 20);

    app.showModal('editCustomerModal');
}

function updateCustomer(e) {
    if (app) app.updateCustomer(e);
}

function deleteCustomer(customerId) {
    const customer = app.customers.find(c => c.id === customerId);
    if (!customer) {
        showError('Customer not found');
        return;
    }

    // Show confirmation modal
    document.getElementById('deleteCustomerName').textContent = customer.name;
    document.getElementById('customerToDelete').value = customerId;
    app.showModal('deleteConfirmModal');
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

// Notifications Functions - UPDATED TO FIX VIEW BUG
function showNotifications() {
    if (app) {
        // FIX: Pass 'notifications' instead of 'notificationsView' to avoid double 'View' suffix
        app.showView('notifications'); 
        app.loadNotifications(); // Refresh data when opening
    }
}

async function markNotificationAsRead(notificationId) {
    try {
        // FIX: Add safety check for app and userId
        if (!app || !app.userId) {
            console.error('App not initialized or user not logged in');
            return;
        }
        
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        await db.collection('artifacts').doc(appId).collection('users').doc(app.userId).collection('notifications').doc(notificationId).update({
            read: true
        });

        // Reload notifications
        await app.loadNotifications();
        
    } catch (error) {
        console.error('Error marking notification as read:', error);
        showError('Failed to mark notification as read');
    }
}

async function deleteNotification(notificationId) {
    try {
        // FIX: Add safety check for app and userId
        if (!app || !app.userId) {
            console.error('App not initialized or user not logged in');
            return;
        }

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        await db.collection('artifacts').doc(appId).collection('users').doc(app.userId).collection('notifications').doc(notificationId).delete();

        // Reload notifications
        await app.loadNotifications();
        
    } catch (error) {
        console.error('Error deleting notification:', error);
        showError('Failed to delete notification');
    }
}

async function clearAllNotifications() {
    if (!confirm('Are you sure you want to clear all notifications? This action cannot be undone.')) {
        return;
    }

    // FIX: Add safety check for app and userId
    if (!app || !app.userId) {
        console.error('App not initialized or user not logged in');
        return;
    }

    try {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const notificationsRef = db.collection('artifacts').doc(appId).collection('users').doc(app.userId).collection('notifications');
        
        const snapshot = await notificationsRef.get();
        
        // FIX: Use batch delete for efficiency and reliability
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();

        // Reload notifications
        await app.loadNotifications();
        
        showSuccess('All notifications cleared successfully!');
        
    } catch (error) {
        console.error('Error clearing notifications:', error);
        showError('Failed to clear notifications');
    }
}

function showAllDeliveries() {
    showError('All deliveries view coming soon!');
}

function showSettings() {
    if (app) app.showModal('settingsModal');
}

// GLOBAL FUNCTION FOR SAVING SETTINGS
function saveSettings(e) {
    if (app) app.saveSettings(e);
}

function logout() {
    authManager.logout();
}

function addCustomer(e) {
    if (app) app.addCustomer(e);
}
