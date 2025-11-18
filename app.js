// Main Application Class
class AquaFlowApp {
    constructor() {
        this.customers = [];
        this.deliveries = [];
        this.currentView = 'dashboard';
        this.scannerActive = false;
        this.currentCustomerId = null;
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

        // Form submissions
        const customerForm = document.getElementById('addCustomerForm');
        if (customerForm) {
            customerForm.addEventListener('submit', (e) => this.addCustomer(e));
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
            this.loadRecentDeliveries()
        ]);
        this.updateDashboard();
        
        // CRITICAL FIX 3: App initialization complete, continuous loading state is over.
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
            
            // CRITICAL FIX 4: Use the secure, Canvas-compliant Firestore path
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
            // This is where "Failed to load customers" is shown.
            console.error('Error loading customers:', error);
            showError('Failed to load customers'); 
        }
    }

    async loadRecentDeliveries() {
        try {
            // Use the global __app_id variable for Firestore path
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            if (!this.userId) {
                throw new Error('User ID is undefined. Cannot load deliveries.');
            }
            
            // CRITICAL FIX 5: Use the secure, Canvas-compliant Firestore path
            const deliveriesCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries');
            
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const snapshot = await deliveriesCollectionRef
                .where('timestamp', '>=', oneWeekAgo)
                .orderBy('timestamp', 'desc')
                .limit(10)
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
            const customerDeliveries = this.deliveries.filter(d => d.customerId === customer.id);
            const totalCans = customerDeliveries.reduce((sum, d) => sum + (d.quantity || 1), 0);
            
            // CRITICAL FIX 6: Ensure defaultPrice is used safely with fallback
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
                        <div><i class="fas fa-tint"></i> ${totalCans} total cans • ₹${price}/can</div>
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

        // Re-render filtered customers (simplified version)
        const originalCustomers = this.customers;
        this.customers = filtered;
        this.displayCustomers();
        this.customers = originalCustomers;
    }

    async addCustomer(e) {
        e.preventDefault();
        
        // Use the global __app_id variable for Firestore path
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        const customerData = {
            name: document.getElementById('customerName').value,
            phone: document.getElementById('customerPhone').value,
            address: document.getElementById('customerAddress').value,
            type: document.getElementById('customerType').value,
            // CRITICAL FIX 7: Use the correct defaultPrice lookup with fallback
            pricePerCan: parseInt(document.getElementById('customerPrice').value) || (this.userData ? this.userData.defaultPrice : 20),
            userId: this.userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Check for required data before saving
        if (!this.userId) {
            showError('Authentication failed. Please sign in again.');
            return;
        }

        try {
            // CRITICAL FIX 8: Use the secure, Canvas-compliant Firestore path
            const docRef = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').add(customerData);
            customerData.id = docRef.id;
            this.customers.push(customerData);

            // Generate QR code
            await this.generateAndStoreQRCode(docRef.id, customerData);

            // Reset form and close modal
            e.target.reset();
            this.closeModal('addCustomerModal');
            this.displayCustomers();
            this.loadCustomerSelect();
            this.updateDashboard();
            
            showSuccess('Customer added successfully! QR code generated.');
            
        } catch (error) {
            console.error('Error adding customer:', error);
            showError('Failed to add customer');
        }
    }

    async generateAndStoreQRCode(customerId, customerData) {
        try {
            // Use the global __app_id variable for Firestore path
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

            // Generate QR code data
            const qrData = `AQUAFLOW:${customerId}:${this.userId}`;
            
            // Create QR code canvas
            const canvas = document.createElement('canvas');
            // Assuming QRCode is globally available via script tag in app.html
            if (typeof QRCode === 'undefined' || !QRCode.toCanvas) {
                console.warn('QRCode library not loaded or not correctly exposed.');
                return;
            }
            
            await QRCode.toCanvas(canvas, qrData, {
                width: 300,
                margin: 2,
                color: {
                    dark: '#000000',
                    light: '#FFFFFF'
                }
            });

            // Convert canvas to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            
            // Upload to ImgBB
            const formData = new FormData();
            formData.append('image', blob);
            // CRITICAL FIX 9: Use the global IMGBB_API_KEY
            formData.append('key', IMGBB_API_KEY);

            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                // Store QR code URL in customer document
                await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).update({
                    qrCodeUrl: result.data.url,
                    qrCodeData: qrData
                });
                
                return result.data.url;
            } else {
                // Throw the error message from ImgBB if available
                throw new Error(result.error.message || 'Failed to upload QR code to ImgBB');
            }
            
        } catch (error) {
            console.error('Error generating QR code:', error);
            showError('Customer added but QR code generation failed: ' + error.message);
        }
    }

    loadCustomerSelect() {
        const select = document.getElementById('billCustomer');
        if (!select) return;

        // Clear existing options except first
        while (select.options.length > 1) {
            select.remove(1);
        }

        // Add customer options
        this.customers.forEach(customer => {
            const option = document.createElement('option');
            option.value = customer.id;
            option.textContent = `${customer.name} - ${customer.phone}`;
            select.appendChild(option);
        });
    }

    // Scanner Functions
    showView(viewName) {
        // Remove active class from all views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.remove('active');
        });

        // Add active class to the selected view
        const activeView = document.getElementById(viewName + 'View');
        if (activeView) {
            activeView.classList.add('active');
            this.currentView = viewName;
        }

        // Update active nav item
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`.bottom-nav .nav-item[onclick="showView('${viewName}')"]`).classList.add('active');
    }

    openScanner() {
        this.showModal('scannerModal');
    }

    closeScanner() {
        this.closeModal('scannerModal');
        this.stopScanner();
    }

     async initializeScanner() {
        // CRITICAL FIX: Better browser compatibility check
        if (typeof BarcodeDetector === 'undefined') {
            console.warn('BarcodeDetector not supported, showing manual entry option');
            this.showManualEntryOption();
            return;
        }

        try {
            // Check if BarcodeDetector is actually functional
            const formats = await BarcodeDetector.getSupportedFormats();
            if (!formats.includes('qr_code')) {
                throw new Error('QR code scanning not supported');
            }

            const video = document.getElementById('qrVideo');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: "environment" } 
            });
            
            video.srcObject = stream;
            await video.play();
            
            document.getElementById('scannerPlaceholder').classList.add('hidden');
            document.getElementById('qrScanner').classList.remove('hidden');
            
            this.startQRDetection(video);
            
        } catch (error) {
            console.error('Camera/Scanner initialization error:', error);
            this.showManualEntryOption();
        }
    }

    stopScanner() {
        const video = document.getElementById('qrVideo');
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }
        
        document.getElementById('scannerPlaceholder').classList.remove('hidden');
        document.getElementById('qrScanner').classList.add('hidden');
        document.getElementById('deliveryForm').classList.add('hidden');
        this.scannerActive = false;
    }

    // CRITICAL FIX: Add manual entry option for unsupported browsers
    showManualEntryOption() {
        const scannerPlaceholder = document.getElementById('scannerPlaceholder');
        scannerPlaceholder.innerHTML = `
            <div class="manual-entry-option">
                <i class="fas fa-camera-slash"></i>
                <h3>QR Scanner Not Available</h3>
                <p>Your browser doesn't support QR scanning. You can:</p>
                <div class="manual-options">
                    <button class="btn btn-primary" onclick="showManualCustomerSelect()">
                        <i class="fas fa-list"></i> Select Customer Manually
                    </button>
                    <button class="btn btn-secondary" onclick="showManualQRInput()">
                        <i class="fas fa-keyboard"></i> Enter QR Code Manually
                    </button>
                </div>
                <p class="browser-suggestion">For best experience, use Chrome or Edge on Android/iOS</p>
            </div>
        `;
        
        // Hide the start camera button
        const startButton = scannerPlaceholder.querySelector('.btn-primary');
        if (startButton) startButton.style.display = 'none';
    }

    startQRDetection(video) {
        if (typeof BarcodeDetector === 'undefined') {
            console.error('BarcodeDetector not available');
            return;
        }

        const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
        this.scannerActive = true;
        
        const detectFrame = async () => {
            if (!this.scannerActive) return;
            
            try {
                const barcodes = await barcodeDetector.detect(video);
                if (barcodes.length > 0) {
                    this.handleScannedQR(barcodes[0].rawValue);
                } else {
                    requestAnimationFrame(detectFrame);
                }
            } catch (error) {
                console.warn('QR detection error, continuing:', error);
                requestAnimationFrame(detectFrame);
            }
        };
        
        detectFrame();
    }

     // CRITICAL FIX: Add manual customer selection
    showManualCustomerSelect() {
        const deliveryForm = document.getElementById('deliveryForm');
        const scannerView = document.getElementById('scannerView');
        
        // Create customer selection dropdown
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
        document.getElementById('qrScanner').classList.add('hidden');
    }
}
    
    async handleScannedQR(qrData) {
        if (!qrData.startsWith('AQUAFLOW:')) {
            showError('Invalid QR code. Please scan a valid customer QR code.');
            return;
        }

        const [, customerId, userId] = qrData.split(':');
        
        // Verify the QR code belongs to current user
        if (userId !== this.userId) {
            showError('This QR code belongs to another business.');
            return;
        }

        try {
            // Use the global __app_id variable for Firestore path
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            // CRITICAL FIX 10: Use the secure, Canvas-compliant Firestore path
            const customerDoc = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').doc(customerId).get();
            if (!customerDoc.exists) {
                showError('Customer not found.');
                return;
            }

            const customer = customerDoc.data();
            this.showDeliveryForm(customerId, customer);
            
        } catch (error) {
            console.error('Error finding customer:', error);
            showError('Error finding customer data.');
        }
    }

    showDeliveryForm(customerId, customer) {
        this.currentCustomerId = customerId;
        
        document.getElementById('scannedCustomerName').textContent = customer.name;
        document.getElementById('scannedCustomerPhone').textContent = customer.phone;
        document.getElementById('scannedCustomerAddress').textContent = customer.address;
        
        document.getElementById('qrScanner').classList.add('hidden');
        document.getElementById('deliveryForm').classList.remove('hidden');
    }

    async confirmDelivery() {
        if (!this.currentCustomerId) {
            showError('No customer selected.');
            return;
        }

        const quantity = parseInt(document.getElementById('deliveryQuantity').value) || 1;
        
        if (quantity < 1) {
            showError('Please enter a valid quantity.');
            return;
        }
        
        // Use the global __app_id variable for Firestore path
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        try {
            const deliveryData = {
                customerId: this.currentCustomerId,
                quantity: quantity,
                timestamp: new Date(),
                month: getCurrentMonth(),
                userId: this.userId
            };

            // CRITICAL FIX 11: Use the secure, Canvas-compliant Firestore path
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries').add(deliveryData);
            
            showSuccess(`Delivery recorded: ${quantity} can(s) delivered`);
            this.closeScanner();
            
            // Reload data
            await this.loadRecentDeliveries();
            this.updateDashboard();
            
        } catch (error) {
            console.error('Error recording delivery:', error);
            showError('Failed to record delivery.');
        }
    }

    resetScanner() {
        document.getElementById('deliveryForm').classList.add('hidden');
        document.getElementById('qrScanner').classList.remove('hidden');
        this.currentCustomerId = null;
        this.initializeScanner();
    }

    // Dashboard Functions
    updateDashboard() {
        this.updateStats();
        this.updateRecentDeliveries();
    }

    updateStats() {
        // Total customers
        document.getElementById('totalCustomers').textContent = this.customers.length;
        
        // Today's deliveries
        const today = new Date().toDateString();
        // Ensure timestamp is a valid object before accessing seconds
        const todayDeliveries = this.deliveries.filter(d => 
            d.timestamp && new Date(d.timestamp.seconds * 1000).toDateString() === today
        );
        let todayCans = 0;
        todayDeliveries.forEach(d => todayCans += d.quantity || 1);
        document.getElementById('todayDeliveries').textContent = todayCans;
        
        // Monthly revenue
        const currentMonth = getCurrentMonth();
        const monthlyDeliveries = this.deliveries.filter(d => d.month === currentMonth);
        let monthlyRevenue = 0;
        
        monthlyDeliveries.forEach(delivery => {
            const customer = this.customers.find(c => c.id === delivery.customerId);
            // CRITICAL FIX 12: Safely access defaultPrice with a fallback if userData is somehow still missing
            const price = customer?.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);
            monthlyRevenue += (delivery.quantity || 1) * price;
        });
        
        document.getElementById('monthlyRevenue').textContent = formatCurrency(monthlyRevenue);
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
            
            // Ensure timestamp is a valid object before accessing seconds
            if (!delivery.timestamp || !delivery.timestamp.seconds) return '';
            
            const deliveryDate = new Date(delivery.timestamp.seconds * 1000);
            // CRITICAL FIX 13: Safely access defaultPrice with a fallback
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
        const month = document.getElementById('billMonth').value;
        const customerId = document.getElementById('billCustomer').value;
        
        if (!month) {
            showError('Please select a month.');
            return;
        }

        // Use the global __app_id variable for Firestore path
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

        // Get deliveries for this customer and month
        // CRITICAL FIX 14: Use the secure, Canvas-compliant Firestore path
        const deliveriesCollectionRef = db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('deliveries');
        
        const snapshot = await deliveriesCollectionRef
            .where('customerId', '==', customerId)
            .where('month', '==', month)
            .get();

        let totalCans = 0;
        snapshot.forEach(doc => {
            totalCans += doc.data().quantity || 1;
        });

        if (totalCans === 0) return null;

        // CRITICAL FIX 15: Safely access defaultPrice with a fallback
        const pricePerCan = customer.pricePerCan || (this.userData ? this.userData.defaultPrice : 20);
        const totalAmount = totalCans * pricePerCan;

        return {
            customerId: customer.id,
            customerName: customer.name,
            customerPhone: customer.phone,
            customerAddress: customer.address,
            month: month,
            totalCans: totalCans,
            pricePerCan: pricePerCan,
            totalAmount: totalAmount,
            deliveries: snapshot.size
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
                        <button class="btn btn-success" onclick="markBillPaid('${bill.customerId}', '${bill.month}', ${bill.totalAmount})">
                            <i class="fas fa-check"></i> Mark Paid
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

    // Utility Functions
    showModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
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

// Global functions for manual operations
function showManualCustomerSelect() {
    if (app) app.showManualCustomerSelect();
}

function confirmManualCustomer() {
    if (!app) return;
    
    const select = document.getElementById('manualCustomerSelect');
    const customerId = select.value;
    
    if (!customerId) {
        showError('Please select a customer');
        return;
    }
    
    const customer = app.customers.find(c => c.id === customerId);
    if (customer) {
        app.showDeliveryForm(customerId, customer);
        document.getElementById('deliveryForm').classList.remove('hidden');
    }
}

function showManualQRInput() {
    const scannerView = document.getElementById('scannerView');
    
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
    
    document.getElementById('qrScanner').classList.add('hidden');
}

function processManualQR() {
    if (!app) return;
    
    const qrInput = document.getElementById('manualQRInput');
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
        // Find customer and process delivery
        const customer = app.customers.find(c => c.id === customerId);
        if (customer) {
            app.showDeliveryForm(customerId, customer);
            document.getElementById('deliveryQuantity').value = quantity;
            app.showModal('scannerModal');
        }
    }
}

async function generateCustomerQR(customerId) {
    try {
        // Use the global __app_id variable for Firestore path
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        // CRITICAL FIX 16: Use the secure, Canvas-compliant Firestore path
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
    if (confirm(`Mark bill as paid for ${month}? Amount: ${formatCurrency(amount)}`)) {
        // Here you would typically record the payment in Firestore
        showSuccess('Payment recorded successfully!');
    }
}

function printBill(customerId, month) {
    window.print();
}

function viewCustomerDetails(customerId) {
    showError('Customer details view coming soon!');
}

function showAllDeliveries() {
    showError('All deliveries view coming soon!');
}

function showNotifications() {
    showError('Notifications feature coming soon!');
}

function showSettings() {
    if (app) app.showModal('settingsModal');
}

// Alternative QR scanning with jsQR
async startQRDetectionWithJSQR(video) {
    this.scannerActive = true;
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    const detectFrame = () => {
        if (!this.scannerActive) return;
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            
            if (code) {
                this.handleScannedQR(code.data);
            }
        }
        
        requestAnimationFrame(detectFrame);
    };
    
    detectFrame();
}
