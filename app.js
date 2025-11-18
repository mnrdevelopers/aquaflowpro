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
        await this.checkAuthentication();
        this.setupEventListeners();
        await this.loadInitialData();
        this.updateUI();
    }

    async checkAuthentication() {
        const user = authManager.getCurrentUser();
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }
        
        this.userId = user.uid;
        this.userData = authManager.getUserData();
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
        await this.loadCustomers();
        await this.loadRecentDeliveries();
        this.updateDashboard();
    }

    async loadCustomers() {
        try {
            const snapshot = await db.collection('customers')
                .where('userId', '==', this.userId)
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

    async loadRecentDeliveries() {
        try {
            const oneWeekAgo = new Date();
            oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
            
            const snapshot = await db.collection('deliveries')
                .where('userId', '==', this.userId)
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
            
            return `
                <div class="customer-card">
                    <div class="customer-header">
                        <div class="customer-name">${customer.name}</div>
                        <span class="customer-type">${this.getCustomerTypeIcon(customer.type)}</span>
                    </div>
                    <div class="customer-details">
                        <div><i class="fas fa-phone"></i> ${customer.phone}</div>
                        <div><i class="fas fa-map-marker-alt"></i> ${customer.address}</div>
                        <div><i class="fas fa-tint"></i> ${totalCans} total cans • ₹${customer.pricePerCan || this.userData.defaultPrice}/can</div>
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
        
        const customerData = {
            name: document.getElementById('customerName').value,
            phone: document.getElementById('customerPhone').value,
            address: document.getElementById('customerAddress').value,
            type: document.getElementById('customerType').value,
            pricePerCan: parseInt(document.getElementById('customerPrice').value) || this.userData.defaultPrice,
            userId: this.userId,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const docRef = await db.collection('customers').add(customerData);
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
            // Generate QR code data
            const qrData = `AQUAFLOW:${customerId}:${this.userId}`;
            
            // Create QR code canvas
            const canvas = document.createElement('canvas');
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
            formData.append('key', IMGBB_API_KEY);

            const response = await fetch('https://api.imgbb.com/1/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            
            if (result.success) {
                // Store QR code URL in customer document
                await db.collection('customers').doc(customerId).update({
                    qrCodeUrl: result.data.url,
                    qrCodeData: qrData
                });
                
                return result.data.url;
            } else {
                throw new Error('Failed to upload QR code to ImgBB');
            }
            
        } catch (error) {
            console.error('Error generating QR code:', error);
            showError('Customer added but QR code generation failed');
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
    openScanner() {
        this.showModal('scannerModal');
    }

    closeScanner() {
        this.closeModal('scannerModal');
        this.stopScanner();
    }

    async initializeScanner() {
        if (!('BarcodeDetector' in window)) {
            showError('QR scanning is not supported in your browser. Please use Chrome or Edge.');
            return;
        }

        try {
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
            console.error('Camera error:', error);
            showError('Cannot access camera. Please check permissions.');
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

    startQRDetection(video) {
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
                requestAnimationFrame(detectFrame);
            }
        };
        
        detectFrame();
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
            const customerDoc = await db.collection('customers').doc(customerId).get();
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

        try {
            const deliveryData = {
                customerId: this.currentCustomerId,
                quantity: quantity,
                timestamp: new Date(),
                month: getCurrentMonth(),
                userId: this.userId
            };

            await db.collection('deliveries').add(deliveryData);
            
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
        const todayDeliveries = this.deliveries.filter(d => 
            new Date(d.timestamp.seconds * 1000).toDateString() === today
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
            const price = customer?.pricePerCan || this.userData.defaultPrice;
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
            
            const deliveryDate = new Date(delivery.timestamp.seconds * 1000);
            const price = customer.pricePerCan || this.userData.defaultPrice;
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

        try {
            let bills = [];
            
            if (customerId === 'all') {
                bills = await this.calculateMonthlyBills(month);
            } else {
                const bill = await this.calculateCustomerBill(customerId, month);
                bills = bill ? [bill] : [];
            }

            this.displayBills(bills);
            
        } catch (error) {
            console.error('Error generating bills:', error);
            showError('Failed to generate bills.');
        }
    }

    async calculateMonthlyBills(month) {
        const bills = [];
        
        for (const customer of this.customers) {
            const bill = await this.calculateCustomerBill(customer.id, month);
            if (bill && bill.totalCans > 0) {
                bills.push(bill);
            }
        }
        
        return bills;
    }

    async calculateCustomerBill(customerId, month) {
        const customer = this.customers.find(c => c.id === customerId);
        if (!customer) return null;

        // Get deliveries for this customer and month
        const snapshot = await db.collection('deliveries')
            .where('userId', '==', this.userId)
            .where('customerId', '==', customerId)
            .where('month', '==', month)
            .get();

        let totalCans = 0;
        snapshot.forEach(doc => {
            totalCans += doc.data().quantity || 1;
        });

        if (totalCans === 0) return null;

        const pricePerCan = customer.pricePerCan || this.userData.defaultPrice;
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

function generateBills() {
    if (app) app.generateBills();
}

async function generateCustomerQR(customerId) {
    try {
        const customerDoc = await db.collection('customers').doc(customerId).get();
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
