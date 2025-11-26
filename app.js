// Main Application Class
class AquaFlowApp {
    constructor() {
        this.customers = [];
        this.filteredCustomers = [];
        this.deliveries = [];
        this.filteredDeliveries = []; // For the delivery list view
        this.notifications = [];
        this.payments = []; 
        this.staff = []; // NEW: Staff array
        this.filteredStaff = []; // NEW: Filtered staff for display
        this.salaryPayments = []; // NEW: Salary payments array
        this.currentView = 'dashboard';
        this.scannerActive = false;
        this.currentCustomerId = null;
        
        // User Identity Management
        this.userId = null; // Stores the logged-in user ID
        this.authUserId = null; // Same as userId, kept for consistency
        this.userData = null;
        
        this.html5QrCode = null;
        
        // Pagination State
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.deliveryPage = 1; // Pagination for deliveries view
        this.staffPage = 1; // NEW: Pagination for staff view

        this.init();
    }

     initPWA() {
        // Request notification permission on app start
        if (window.pwaHandler) {
            setTimeout(() => {
                pwaHandler.requestNotificationPermission();
            }, 3000);
        }
    }

 async init() {
    console.log('App initialization started');
    
    // Show loading only once
    this.showLoading();
    
    await this.waitForAuthState();
    
    const authDataReady = await this.checkAuthentication();
    
    if (!authDataReady) {
        console.log('Authentication check failed, stopping app initialization');
        this.hideLoading();
        return;
    }

    this.setupEventListeners();
    await this.loadInitialData();
    this.updateUI();
    console.log('App initialization completed successfully');
    
    // Hide loading when everything is ready
    this.hideLoading();
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
        this.userId = user.uid; // Everyone is an owner, data is always under their own UID

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
             this.userData = { businessName: 'AquaFlow Pro', defaultPrice: 20 };
        }
        
        return true;
    }

    setupEventListeners() {
        // Customer search
        const searchInput = document.getElementById('customerSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.filterCustomers(e.target.value));
        }

        // Staff search
        const staffSearchInput = document.getElementById('staffSearch');
        if (staffSearchInput) {
            staffSearchInput.addEventListener('input', (e) => this.filterStaff(e.target.value));
        }
        
        // NEW: Staff salary type listener in modals
        const addStaffSalaryType = document.getElementById('staffSalaryType');
        if(addStaffSalaryType) {
            addStaffSalaryType.addEventListener('change', (e) => this.updateSalaryLabel(e.target.value, 'monthlySalaryGroup', 'dailySalaryGroup'));
        }
        
        const editStaffSalaryType = document.getElementById('editStaffSalaryType');
        if(editStaffSalaryType) {
             editStaffSalaryType.addEventListener('change', (e) => this.updateSalaryLabel(e.target.value, 'editMonthlySalaryGroup', 'editDailySalaryGroup'));
        }

        // Close modals on backdrop click
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.closeModal(e.target.id);
            }
        });
    }

    updateSalaryLabel(salaryType, monthlyGroupId, dailyGroupId) {
        const monthlyGroup = document.getElementById(monthlyGroupId);
        const dailyGroup = document.getElementById(dailyGroupId);
        
        if (monthlyGroup && dailyGroup) {
            if (salaryType === 'monthly') {
                monthlyGroup.classList.remove('hidden');
                dailyGroup.classList.add('hidden');
            } else {
                monthlyGroup.classList.add('hidden');
                dailyGroup.classList.remove('hidden');
            }
        }
    }

    showLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
    }
}

hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.classList.add('hidden');
    }
}

    showSkeletonLoading() {
    // Add skeleton loading for dashboard stats
    const statsGrid = document.querySelector('.stats-grid');
    if (statsGrid) {
        statsGrid.innerHTML = `
            <div class="stat-card">
                <div class="stat-content">
                    <div class="skeleton skeleton-stat"></div>
                    <div class="skeleton skeleton-text"></div>
                </div>
                <div class="stat-icon skeleton"></div>
            </div>
            <div class="stat-card">
                <div class="stat-content">
                    <div class="skeleton skeleton-stat"></div>
                    <div class="skeleton skeleton-text"></div>
                </div>
                <div class="stat-icon skeleton"></div>
            </div>
            <div class="stat-card">
                <div class="stat-content">
                    <div class="skeleton skeleton-stat"></div>
                    <div class="skeleton skeleton-text"></div>
                </div>
                <div class="stat-icon skeleton"></div>
            </div>
        `;
    }
}

   async loadInitialData() {
    try {
        // REMOVE this.showLoading() from here - it's already shown in init()
        await Promise.all([
            this.loadCustomers(),
            this.loadCurrentMonthDeliveries(), 
            this.loadNotifications(),
            this.loadPayments(),
            this.loadStaff() // NEW
        ]);
        this.updateDashboard();
        console.log('App initialization complete.');
    } catch (error) {
        console.error('Error loading initial data:', error);
        showError('Failed to load data');
    }
    // REMOVE this.hideLoading() from here - it's handled in init()
}
    
   async loadCustomers() {
    try {
        // Show skeleton loading for customers list
        const container = document.getElementById('customersList');
        if (container) {
            container.innerHTML = `
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
                            ${Array(5).fill(0).map(() => `
                                <tr>
                                    <td><div class="skeleton skeleton-text"></div></td>
                                    <td><div class="skeleton skeleton-text" style="width: 60px;"></div></td>
                                    <td>
                                        <div class="skeleton skeleton-text"></div>
                                        <div class="skeleton skeleton-text" style="width: 80%;"></div>
                                    </td>
                                    <td>
                                        <div class="skeleton skeleton-text"></div>
                                        <div class="skeleton skeleton-text" style="width: 70%;"></div>
                                    </td>
                                    <td>
                                        <div class="action-buttons-row">
                                            <div class="skeleton" style="width: 30px; height: 30px; border-radius: 50%;"></div>
                                            <div class="skeleton" style="width: 30px; height: 30px; border-radius: 50%;"></div>
                                            <div class="skeleton" style="width: 30px; height: 30px; border-radius: 50%;"></div>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        }

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        if (!this.userId) {
            throw new Error('User ID is undefined. Cannot load customers.');
        }
        
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

    // ==========================================
    // NEW: STAFF MANAGEMENT (CRUD & Salary)
    // ==========================================

    getStaffSalaryDisplay(staff) {
        // Use the appropriate salary field based on type
        const amount = staff.salaryType === 'monthly' ? staff.monthlySalary : staff.dailySalary;
        const type = staff.salaryType === 'daily' ? '/day' : '/month';
        return {
            amount: formatCurrency(amount || 0),
            type: type,
            rawAmount: amount || 0
        };
    }

    async loadStaff() {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            if (!this.userId) return;

            // Load Staff Data
            const staffSnapshot = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('staff')
                .orderBy('name')
                .get();
            
            this.staff = staffSnapshot.docs.map(doc => ({ 
                id: doc.id, 
                // Ensure salary defaults are set
                salaryType: 'monthly', 
                monthlySalary: 0, 
                dailySalary: 0,
                ...doc.data() 
            }));
            this.filteredStaff = [...this.staff];

            // Load Salary Payments (last 1 year for reporting/tracking)
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

            const paymentsSnapshot = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('salaryPayments')
                // Note: Firestore recommends sorting by time to limit date range, but for simplicity/demo, we load and filter locally.
                .limit(500) 
                .get();
            
            this.salaryPayments = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            this.displayStaff();

        } catch (error) {
            console.error('Error loading staff data:', error);
            showError('Failed to load staff list.');
        }
    }

    displayStaff() {
        const container = document.getElementById('staffList');
        if (!container) return;

        if (this.filteredStaff.length === 0) {
             container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-user-tie"></i>
                    <h3>No Staff Members</h3>
                    <button class="btn btn-primary" onclick="showAddStaffModal()">
                        <i class="fas fa-user-plus"></i> Add Staff Member
                    </button>
                </div>
            `;
            return;
        }

        const startIndex = (this.staffPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const pageStaff = this.filteredStaff.slice(startIndex, endIndex);
        const totalPages = Math.ceil(this.filteredStaff.length / this.itemsPerPage);
        const currentMonth = getCurrentMonth();

        let html = `
            <div class="table-responsive">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Role</th>
                            <th>Salary</th>
                            <th>Status</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        html += pageStaff.map(staff => {
            const salaryInfo = this.getStaffSalaryDisplay(staff);
            
            // Check for monthly payment status
            const isPaidThisMonth = staff.salaryType === 'monthly' && this.salaryPayments.some(p => p.staffId === staff.id && p.month === currentMonth);

            // Determine which action button to show
            let salaryButton;
            if (staff.salaryType === 'monthly') {
                if (isPaidThisMonth) {
                    salaryButton = `<button class="btn btn-sm btn-success" disabled title="Salary Paid"><i class="fas fa-check"></i> Paid</button>`;
                } else {
                    salaryButton = `<button class="btn btn-sm btn-warning" onclick="trackSalaryPayment('${staff.id}', '${staff.name}', ${salaryInfo.rawAmount}, '${staff.salaryType}')" title="Record Monthly Salary Payment"><i class="fas fa-rupee-sign"></i> Pay</button>`;
                }
            } else { // 'daily'
                 // For daily, we always allow payment tracking. The button reflects the daily amount.
                 salaryButton = `<button class="btn btn-sm btn-info" onclick="trackSalaryPayment('${staff.id}', '${staff.name}', ${salaryInfo.rawAmount}, '${staff.salaryType}')" title="Record Daily Salary Payment"><i class="fas fa-rupee-sign"></i> Pay Daily</button>`;
            }

            const statusBadge = staff.status === 'active' 
                ? `<span class="badge" style="background-color: var(--success); color: var(--white);">Active</span>` 
                : `<span class="badge" style="background-color: var(--danger); color: var(--white);">Inactive</span>`;
            
            return `
                <tr>
                    <td class="fw-bold">${staff.name}</td>
                    <td>${staff.role || 'N/A'}</td>
                    <td class="fw-bold text-success">${salaryInfo.amount} <span class="text-sm text-muted">${salaryInfo.type}</span></td>
                    <td>${statusBadge}</td>
                    <td>
                        <div class="action-buttons-row">
                            ${salaryButton}
                            <button class="btn btn-sm btn-outline" onclick="editStaff('${staff.id}')" title="Edit Staff">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-sm btn-danger" onclick="confirmDeleteStaff('${staff.id}', '${staff.name}')" title="Delete Staff">
                                <i class="fas fa-trash"></i>
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
                    <button class="btn btn-sm btn-secondary" ${this.staffPage === 1 ? 'disabled' : ''} onclick="app.changeStaffPage(-1)">
                        <i class="fas fa-chevron-left"></i> Prev
                    </button>
                    <span class="page-info">Page ${this.staffPage} of ${totalPages}</span>
                    <button class="btn btn-sm btn-secondary" ${this.staffPage >= totalPages ? 'disabled' : ''} onclick="app.changeStaffPage(1)">
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    changeStaffPage(delta) {
        const totalPages = Math.ceil(this.filteredStaff.length / this.itemsPerPage);
        const newPage = this.staffPage + delta;
        
        if (newPage >= 1 && newPage <= totalPages) {
            this.staffPage = newPage;
            this.displayStaff();
            document.getElementById('staffView').scrollTop = 0;
        }
    }

    filterStaff(searchTerm) {
        if (!searchTerm) {
            this.filteredStaff = [...this.staff];
        } else {
            const lower = searchTerm.toLowerCase();
            this.filteredStaff = this.staff.filter(staff =>
                staff.name.toLowerCase().includes(lower) ||
                staff.phone.includes(searchTerm) ||
                staff.role.toLowerCase().includes(lower)
            );
        }
        this.staffPage = 1;
        this.displayStaff();
    }
    
    // Utility function to set button loading state
    setButtonLoading(button, isLoading, originalText = null) {
        if (!button) return;

        if (isLoading) {
            button.classList.add('is-loading');
            button.disabled = true;
            // Store original content before overwriting
            button.setAttribute('data-original-html', button.innerHTML);
            button.innerHTML = `<span class="btn-spinner"><i class="spinner-border"></i></span><span style="visibility: hidden">${originalText || 'Processing...'}</span>`;
        } else {
            button.classList.remove('is-loading');
            button.disabled = false;
            // Restore original content
            const originalHtml = button.getAttribute('data-original-html');
            if (originalHtml) {
                button.innerHTML = originalHtml;
                button.removeAttribute('data-original-html');
            }
        }
    }

    async addStaff(e) {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true, 'Saving Staff');

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const salaryType = document.getElementById('staffSalaryType').value;

        const staffData = {
            name: document.getElementById('staffName').value,
            phone: document.getElementById('staffPhone').value,
            role: document.getElementById('staffRole').value,
            salaryType: salaryType, 
            monthlySalary: salaryType === 'monthly' ? (parseInt(document.getElementById('monthlySalary').value) || 0) : 0, 
            dailySalary: salaryType === 'daily' ? (parseInt(document.getElementById('dailySalary').value) || 0) : 0, 
            joinDate: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active',
            createdBy: this.authUserId
        };
        
        if (!this.userId) {
            showError('Authentication failed. Please sign in again.');
            this.setButtonLoading(submitBtn, false);
            return;
        }
        
        if ((salaryType === 'monthly' && staffData.monthlySalary <= 0) || (salaryType === 'daily' && staffData.dailySalary <= 0)) {
            showError('Please enter a valid salary amount greater than zero.');
            this.setButtonLoading(submitBtn, false);
            return;
        }

        try {
            const docRef = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('staff').add(staffData);
            staffData.id = docRef.id;
            
            this.staff.push(staffData);
            this.filteredStaff.push(staffData); 

            await this.addNotification('New Staff Added', `Added staff member: ${staffData.name}`, 'info');

            e.target.reset();
            this.updateSalaryLabel('monthly', 'monthlySalaryGroup', 'dailySalaryGroup');
            this.closeModal('addStaffModal');
            
            this.filterStaff(''); 
            this.displayStaff();
            this.updateDashboard();
            
            showSuccess('Staff member added successfully!');
            
        } catch (error) {
            console.error('Error adding staff:', error);
            showError('Failed to add staff member');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    editStaff(staffId) {
        const staff = this.staff.find(s => s.id === staffId);
        if (!staff) {
            showError('Staff member not found');
            return;
        }

        document.getElementById('editStaffId').value = staff.id;
        document.getElementById('editStaffName').value = staff.name;
        document.getElementById('editStaffPhone').value = staff.phone;
        document.getElementById('editStaffRole').value = staff.role || 'Delivery Driver';
        
        // NEW: Load salary type and values
        const salaryType = staff.salaryType || 'monthly';
        document.getElementById('editStaffSalaryType').value = salaryType;
        document.getElementById('editMonthlySalary').value = staff.monthlySalary || 0;
        document.getElementById('editDailySalary').value = staff.dailySalary || 0;
        this.updateSalaryLabel(salaryType, 'editMonthlySalaryGroup', 'editDailySalaryGroup');

        document.getElementById('editStaffStatus').value = staff.status || 'active';

        this.showModal('editStaffModal');
    }

    async updateStaff(e) {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true, 'Updating Staff');

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const staffId = document.getElementById('editStaffId').value;
        const salaryType = document.getElementById('editStaffSalaryType').value;

        const staffData = {
            name: document.getElementById('editStaffName').value,
            phone: document.getElementById('editStaffPhone').value,
            role: document.getElementById('editStaffRole').value,
            salaryType: salaryType, 
            monthlySalary: salaryType === 'monthly' ? (parseInt(document.getElementById('editMonthlySalary').value) || 0) : 0, 
            dailySalary: salaryType === 'daily' ? (parseInt(document.getElementById('editDailySalary').value) || 0) : 0, 
            status: document.getElementById('editStaffStatus').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if ((salaryType === 'monthly' && staffData.monthlySalary <= 0) || (salaryType === 'daily' && staffData.dailySalary <= 0)) {
            showError('Please enter a valid salary amount greater than zero.');
            this.setButtonLoading(submitBtn, false);
            return;
        }

        try {
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('staff').doc(staffId).update(staffData);
            
            const staffIndex = this.staff.findIndex(s => s.id === staffId);
            if (staffIndex !== -1) {
                this.staff[staffIndex] = { ...this.staff[staffIndex], ...staffData };
            }

            this.filterStaff(document.getElementById('staffSearch')?.value || ''); 
            this.displayStaff();
            
            await this.addNotification('Staff Updated', `Updated staff member: ${staffData.name}`, 'info');
            this.closeModal('editStaffModal');
            showSuccess('Staff member updated successfully!');
            
        } catch (error) {
            console.error('Error updating staff:', error);
            showError('Failed to update staff member');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    async deleteStaff(staffId) {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        const deleteButton = document.querySelector('#deleteConfirmStaffModal button.btn-danger');
        this.setButtonLoading(deleteButton, true, 'Deleting...');

        try {
            const staff = this.staff.find(s => s.id === staffId);
            if (!staff) {
                showError('Staff member not found');
                return;
            }

            // Delete staff document
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('staff').doc(staffId).delete();

            // Note: In a real app, we'd batch-delete all associated salary payments here too.
            // For this version, we will leave the payments for historical reporting.

            this.staff = this.staff.filter(s => s.id !== staffId);
            this.filteredStaff = this.filteredStaff.filter(s => s.id !== staffId);
            
            // NEW FIX: Filter out salary payments for the deleted staff from local state
            this.salaryPayments = this.salaryPayments.filter(p => p.staffId !== staffId);

            await this.addNotification('Staff Deleted', `Deleted staff member: ${staff.name}`, 'warning');

            this.displayStaff();
            this.generateReports(); // Refresh reports after filtering payments
            this.closeModal('deleteConfirmStaffModal');
            
            showSuccess('Staff member deleted successfully!');
            
        } catch (error) {
            console.error('Error deleting staff:', error);
            showError('Failed to delete staff member');
        } finally {
            // Must manually reset loading state of the modal button as it's outside the form handler
            this.setButtonLoading(deleteButton, false, 'Delete Staff'); 
        }
    }
    
    showConfirmDeleteStaff(staffId, staffName) {
        document.getElementById('staffToDeleteId').value = staffId;
        document.getElementById('deleteStaffName').textContent = staffName;
        this.showModal('deleteConfirmStaffModal');
    }

    showTrackSalaryModal(staffId, staffName, monthlyOrDailySalary, salaryType) { // UPDATED signature
        const today = new Date().toISOString().substring(0, 10);
        const currentMonth = getCurrentMonth();
        
        document.getElementById('trackStaffId').value = staffId;
        document.getElementById('trackStaffName').value = staffName;
        document.getElementById('trackSalaryAmount').value = monthlyOrDailySalary;
        document.getElementById('trackSalaryTypeHidden').value = salaryType; // Store type for processing
        
        const monthlyGroup = document.getElementById('trackMonthlyGroup');
        const dailyGroup = document.getElementById('trackDailyGroup');
        const amountLabel = document.querySelector('#trackSalaryForm label[for="trackSalaryAmount"]');
        const amountNote = document.getElementById('trackSalaryAmountNote');
        
        if (salaryType === 'monthly') {
            monthlyGroup.classList.remove('hidden');
            dailyGroup.classList.add('hidden');
            document.getElementById('trackSalaryMonth').value = currentMonth;
            amountLabel.textContent = 'Monthly Amount Paid (₹)';
            amountNote.textContent = 'This should be the full monthly salary amount paid to the staff member.';
        } else {
            // NEW: Show daily date picker and hide month picker
            monthlyGroup.classList.add('hidden');
            dailyGroup.classList.remove('hidden');
            document.getElementById('trackSalaryDate').value = today; // Set today's date default
            amountLabel.textContent = 'Daily Amount Paid (₹)';
            amountNote.textContent = 'This should be the amount paid for a single day of work.';
        }
        
        const recordPaymentBtn = document.getElementById('recordPaymentBtn');
        if (recordPaymentBtn) recordPaymentBtn.innerHTML = '<i class="fas fa-check"></i> Confirm Payment';

        this.showModal('trackSalaryModal');
    }

    async trackSalaryPayment(e) {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true, 'Recording...');

        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        const staffId = document.getElementById('trackStaffId').value;
        const staffName = document.getElementById('trackStaffName').value;
        const amount = parseInt(document.getElementById('trackSalaryAmount').value) || 0;
        const salaryType = document.getElementById('trackSalaryTypeHidden').value; // NEW
        
        let month, paymentDate; // Separate variables for monthly/daily tracking
        
        if (salaryType === 'monthly') {
            month = document.getElementById('trackSalaryMonth').value;
            // Removed HTML 'required' but kept JS validation check
            if (!month) {
                showError('Please select a payment month.');
                this.setButtonLoading(submitBtn, false);
                return;
            }
        } else {
            paymentDate = document.getElementById('trackSalaryDate').value;
            // Removed HTML 'required' but kept JS validation check
            if (!paymentDate) {
                showError('Please select a payment date.');
                this.setButtonLoading(submitBtn, false);
                return;
            }
            month = paymentDate.substring(0, 7); // YYYY-MM format for aggregation
        }
        
        if (amount <= 0) {
            showError('Invalid salary amount.');
            this.setButtonLoading(submitBtn, false);
            return;
        }

        // Check for MONTHLY duplicate payment (Only relevant for monthly type)
        if (salaryType === 'monthly') {
            const alreadyPaid = this.salaryPayments.some(p => 
                p.staffId === staffId && p.month === month && p.salaryType === 'monthly'
            );

            if (alreadyPaid) {
                showError(`Monthly salary for ${staffName} has already been recorded for ${month}.`);
                this.setButtonLoading(submitBtn, false);
                return;
            }
        }
        
        // Check for DAILY duplicate payment (Preventing multiple daily payments on the *exact* same date)
        if (salaryType === 'daily') {
            const alreadyPaidToday = this.salaryPayments.some(p => {
                // Check against the 'date' field saved in payment data
                return p.staffId === staffId && p.date === paymentDate && p.salaryType === 'daily';
            });
            
            // NOTE: Replacing `confirm()` with custom modal UI is preferred in production apps.
            if (alreadyPaidToday) {
                 if (!window.confirm(`A payment was already recorded for ${staffName} on ${paymentDate}. Do you want to record another payment for this day?`)) {
                     this.setButtonLoading(submitBtn, false);
                     return;
                 }
            }
        }

        try {
            const paymentData = {
                staffId,
                staffName,
                month,
                amount,
                salaryType, // NEW
                date: paymentDate || null, // NEW: Store date for daily tracking
                paidAt: firebase.firestore.FieldValue.serverTimestamp(),
                recordedBy: this.authUserId
            };

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('salaryPayments').add(paymentData);
            
            // Update local state
            this.salaryPayments.unshift(paymentData); 
            
            // Update the staff member's last payment date for reference
            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('staff').doc(staffId).update({
                lastSalaryPayment: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            const message = salaryType === 'monthly' 
                ? `Paid monthly salary of ${formatCurrency(amount)} to ${staffName}`
                : `Paid daily wages of ${formatCurrency(amount)} to ${staffName} for ${paymentDate}`;

            await this.addNotification('Salary Paid', message, 'success');
            
            this.closeModal('trackSalaryModal');
            this.displayStaff();
            this.generateReports(); // Refresh reports
            showSuccess(`Salary payment recorded for ${staffName}!`);
            
        } catch (error) {
            console.error('Error recording salary payment:', error);
            showError('Failed to record salary payment');
        } finally {
            this.setButtonLoading(submitBtn, false);
        }
    }

    // ==========================================
    // END STAFF MANAGEMENT
    // ==========================================

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
                createdBy: this.authUserId
            };

            await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('notifications').add(notificationData);
            await this.loadNotifications();
            
        } catch (error) {
            console.error('Error adding notification:', error);
        }
    }

    async clearAllNotifications() {
        // Use a modal instead of confirm()
        this.showModal('clearNotificationsConfirmModal');
    }
    
    async confirmClearAllNotifications() {
        const deleteButton = document.querySelector('#clearNotificationsConfirmModal button.btn-danger');
        this.setButtonLoading(deleteButton, true, 'Clearing...');

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
            this.closeModal('clearNotificationsConfirmModal');
            showSuccess('All notifications cleared');
        } catch (error) {
            console.error('Error clearing notifications:', error);
            showError('Failed to clear notifications');
        } finally {
            this.setButtonLoading(deleteButton, false, 'Clear All');
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
        this.setButtonLoading(submitBtn, true, 'Updating Delivery');

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
            this.setButtonLoading(submitBtn, false, 'Update Delivery');
        }
    }

    async confirmDeleteDelivery() {
        // Replacing `confirm()` with a modal/better UI is recommended.
        // For simplicity, we are identifying the button that triggers the action.
        const deleteBtn = document.querySelector('#editDeliveryModal button.btn-danger');
        
        if(!window.confirm('Are you sure you want to delete this delivery? This will revert the can count for the customer.')) return;
        
        this.setButtonLoading(deleteBtn, true, 'Deleting...');

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
        } finally {
            this.setButtonLoading(deleteBtn, false, 'Delete Entry');
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
                            <button class="btn btn-sm btn-outline" onclick="editCustomer('${customer.id}')" title="Edit">
                                <i class="fas fa-edit"></i>
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
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true, 'Saving Customer');

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
            this.setButtonLoading(submitBtn, false);
            return;
        }

        try {
            const docRef = await db.collection('artifacts').doc(appId).collection('users').doc(this.userId).collection('customers').add(customerData);
            customerData.id = docRef.id;
            
            this.customers.push(customerData);
            this.filteredCustomers.push(customerData); 

            try {
                await this.generateAndStoreQRCode(docRef.id, customerData);
            } catch (qrError) {
                console.error('QR code generation failed:', qrError);
                // Non-critical, continue
            }

            await this.addNotification('New Customer Added', `Added customer: ${customerData.name}`, 'success');

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
            this.setButtonLoading(submitBtn, false, 'Save Customer');
        }
    }

    editCustomer(customerId) {
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
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true, 'Update Customer');

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
        } finally {
            this.setButtonLoading(submitBtn, false, 'Update Customer');
        }
    }

    async deleteCustomer(customerId) {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        const deleteButton = document.querySelector('#deleteConfirmModal button.btn-danger');
        this.setButtonLoading(deleteButton, true, 'Deleting...');

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
            
        } catch (error) {
            console.error('Error deleting customer:', error);
            showError('Failed to delete customer');
        } finally {
            this.setButtonLoading(deleteButton, false, 'Delete Customer');
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
            // QR Data uses the USER'S ID
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
                const isConfirmed = window.confirm("QR Code not generated yet. Generate now? This may take a moment.");
                if(isConfirmed) {
                     showSuccess("Generating QR Code...");
                     // Simulate loading state on the triggering element if possible, but difficult to pinpoint from table row.
                     
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
        const currentMonthName = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

        // Generate 31 day grid HTML
        let dayCells = '';
        for (let i = 1; i <= 31; i++) {
            dayCells += `
                <div class="day-cell">
                    <span class="day-number">${i}</span>
                    <i class="fas fa-check check-icon"></i>
                </div>
            `;
        }
        
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
                            padding: 20px;
                        }
                        .qr-image {
                            width: 180px;
                            height: 180px;
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
                        
                        /* NEW STYLES FOR CALENDAR GRID */
                        .delivery-tracker {
                            margin-top: 25px;
                            padding: 15px;
                            background: #f9f9f9;
                            border-radius: 10px;
                            border: 1px solid #e5e7eb;
                        }
                        .tracker-header {
                            font-size: 1rem;
                            font-weight: 700;
                            color: var(--primary-dark);
                            margin-bottom: 10px;
                        }
                        .calendar-grid {
                            display: grid;
                            /* 7 columns for 7 days, adjusted for print size */
                            grid-template-columns: repeat(7, 1fr); 
                            gap: 4px;
                            max-width: 300px;
                            margin: 0 auto;
                        }
                        .day-cell {
                            background: white;
                            border: 1px solid #ddd;
                            border-radius: 4px;
                            position: relative;
                            aspect-ratio: 1 / 1; /* Make it square */
                            display: flex;
                            flex-direction: column;
                            justify-content: center;
                            align-items: center;
                            font-size: 0.7rem;
                            color: #333;
                            box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                        }
                        .day-number {
                            font-weight: 600;
                        }
                        .check-icon {
                            position: absolute;
                            bottom: 1px;
                            right: 1px;
                            font-size: 0.6em;
                            color: #28a745; /* Success Green */
                            opacity: 0.5; /* Light initial state */
                            border: 1px solid #28a745;
                            border-radius: 50%;
                            background: white;
                            padding: 1px;
                            visibility: visible; /* Always visible for manual tick */
                        }
                        
                        .print-instructions {
                             margin-top: 15px;
                             font-size: 0.8rem;
                             color: #6b7280;
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
                            /* Ensure icons are visible for print */
                            .check-icon { opacity: 1; border-color: #ccc; color: transparent; } 
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
                                Scan this code using the app to record delivery.
                            </div>
                            
                            <div class="delivery-tracker">
                                <div class="tracker-header">Delivery Tracker (${currentMonthName})</div>
                                <div class="calendar-grid">
                                    ${dayCells}
                                </div>
                                <div class="print-instructions">
                                    Manually tick the $\\checkmark$ box in the day cell for each delivery.
                                </div>
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
        this.resetScanner();
    }
    
    showScanView() {
        this.resetScanner();
        this.initializeScanner(); // Re-initialize the scanner on explicit back click
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
            
            // Clear any previous instance to avoid conflicts
            if (this.html5QrCode && this.html5QrCode.isScanning) {
                await this.html5QrCode.stop().catch(() => {});
            }
            if (this.html5QrCode) {
                 this.html5QrCode.clear();
            }

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
        
        // Verify if the QR belongs to the current user/business
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
        
        // Hide scanner placeholder and ensure delivery form is visible
        const scannerPlaceholder = document.getElementById('scannerPlaceholder');
        if (scannerPlaceholder) scannerPlaceholder.classList.add('hidden');
    }

    async confirmDelivery() {
        if (!this.currentCustomerId) {
            showError('No customer selected.');
            return;
        }

        const confirmBtn = document.querySelector('#deliveryForm button.btn-success');
        this.setButtonLoading(confirmBtn, true, 'Confirming...');

        const quantityInput = document.getElementById('deliveryQuantity');
        const quantity = parseInt(quantityInput ? quantityInput.value : 1) || 1;
        
        if (quantity < 1) {
            showError('Please enter a valid quantity.');
            this.setButtonLoading(confirmBtn, false, 'Confirm Delivery');
            return;
        }
        
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        try {
            const deliveryData = {
                customerId: this.currentCustomerId,
                quantity: quantity,
                timestamp: new Date(),
                month: getCurrentMonth(),
                recordedBy: this.authUserId, 
                recordedByName: 'Owner' 
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
        } finally {
            this.setButtonLoading(confirmBtn, false, 'Confirm Delivery');
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
        
        // Reset scanner HTML if manual entry was active
        const scannerView = document.getElementById('scannerView');
        if (scannerView) {
             scannerView.innerHTML = `
                <div id="scannerPlaceholder" class="scanner-placeholder">
                    <i class="fas fa-qrcode"></i>
                    <p>Position QR code within frame to scan</p>
                    <button class="btn btn-primary" onclick="initializeScanner()">
                        Start Camera
                    </button>
                </div>
                <div id="qrReader" style="width: 100%; height: 100%;" class="hidden"></div>
            `;
        }
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
    
    // NEW: Side Menu Functions
    openSideMenu() {
        document.getElementById('sideMenuContainer').classList.add('open');
    }

    closeSideMenu() {
        document.getElementById('sideMenuContainer').classList.remove('open');
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

        // Deactivate all nav items
        document.querySelectorAll('.bottom-nav .nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Activate the corresponding nav item for the main views
        let navItem = document.querySelector(`.bottom-nav .nav-item[onclick="showView('${viewName}')"]`);

        // Handle case where view is not in the primary navigation
        if (!navItem) {
            // For menu items that are now in the sidebar, we keep the dashboard button active if coming from a non-main view
            if (viewName === 'billing' || viewName === 'reports') {
                 navItem = document.querySelector(`.bottom-nav .nav-item[onclick="showView('dashboard')"]`);
            }
        }
        
        // Deliveries is now a main nav item, so it should be handled by the first selector.

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
        if (viewName === 'staff') { // NEW
            this.filteredStaff = [...this.staff];
            this.staffPage = 1;
            this.displayStaff();
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
                    <div class="activity-amount">${formatCurrency(amount)}</div>
                </div>
            `;
        }).join('');
    }

    // Billing Functions
    async generateBills() {
        const button = document.querySelector('#billingView .btn-primary');
        this.setButtonLoading(button, true, 'Generating Bills');
        
        const monthInput = document.getElementById('billMonth');
        const customerSelect = document.getElementById('billCustomer');
        
        if (!monthInput || !customerSelect) return;
        
        const month = monthInput.value;
        const customerId = customerSelect.value;
        
        if (!month) {
            showError('Please select a month.');
            this.setButtonLoading(button, false, 'Generate Bills');
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
        } finally {
             this.setButtonLoading(button, false, 'Generate Bills');
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
                            `<button class="btn btn-primary" id="markPaidBtn-${bill.customerId}-${bill.month}" onclick="markBillPaid('${bill.customerId}', '${bill.month}', ${bill.totalAmount})">
                                <i class="fas fa-check"></i> Mark Paid
                            </button>`
                        }
                         <button class="btn" style="background-color: #25D366; color: white;" id="whatsappBtn-${bill.customerId}-${bill.month}" onclick="app.sendWhatsAppReminder('${bill.customerId}', '${bill.month}', ${bill.totalAmount}, ${bill.totalCans})" title="Send WhatsApp Reminder">
                            <i class="fab fa-whatsapp"></i> Remind
                        </button>
                        <button class="btn btn-secondary" id="printBtn-${bill.customerId}-${bill.month}" onclick="printBill('${bill.customerId}', '${bill.month}')">
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

        // Note: For simplicity, the loading state implementation for dynamic table row buttons is omitted here 
        // as it would require finding the button element using a unique ID generated in displayBills().
        // If implemented, it would look like: 
        // const btn = document.getElementById(`whatsappBtn-${customerId}-${month}`);
        // this.setButtonLoading(btn, true, 'Sending...');

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
        
        // Finalize loading state
        // if (btn) this.setButtonLoading(btn, false, 'Remind'); 
    }

    async markBillPaid(customerId, month, amount) {
        // Use the button ID for loading state
        const button = document.getElementById(`markPaidBtn-${customerId}-${month}`);
        
        // Replacing `confirm()` with a modal/better UI is recommended.
        if (!window.confirm(`Mark bill as paid for ${month}? Amount: ${formatCurrency(amount)}`)) return;
        
        this.setButtonLoading(button, true, 'Saving...');

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
        } finally {
            this.setButtonLoading(button, false, 'Mark Paid');
        }
    }

    generateReports() {
        const monthlyReport = document.getElementById('monthlyReport');
        const topCustomersReport = document.getElementById('topCustomersReport');
        const staffSalaryReport = document.getElementById('staffSalaryReport'); // NEW
        
        if (!monthlyReport || !topCustomersReport || !staffSalaryReport) return; // Update check

        // 1. Monthly Performance
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
        
        // 2. Top Customers
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

        // 3. NEW: Staff Salary Report
        const monthlyStaffPayments = this.salaryPayments.filter(p => p.month === currentMonth);
        const totalMonthlySalaryPaid = monthlyStaffPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        
        // List monthly staff who haven't been paid this month
        const unpaidStaff = this.staff.filter(staff => 
            staff.status === 'active' && 
            staff.salaryType === 'monthly' && // Only check monthly staff for monthly payment status
            !monthlyStaffPayments.some(p => p.staffId === staff.id && p.salaryType === 'monthly')
        );
        
        staffSalaryReport.innerHTML = `
             <div style="text-align: center; width: 100%;">
                <div style="font-size: 1.8rem; font-weight: bold; color: var(--danger);">${formatCurrency(totalMonthlySalaryPaid)}</div>
                <div style="color: var(--gray-600); margin-bottom: 1rem;">Total Staff Wages Paid This Month (${currentMonth})</div>
                
                <div style="text-align: left; margin-top: 1.5rem;">
                    <h5 style="font-size: 1rem; color: var(--primary-dark); margin-bottom: 0.5rem;">Monthly Staff Unpaid (${unpaidStaff.length})</h5>
                    <div style="background: var(--gray-100); padding: 1rem; border-radius: 8px;">
                        ${unpaidStaff.length > 0 ? 
                            unpaidStaff.map(staff => `
                                <div style="display: flex; justify-content: space-between; font-size: 0.9rem; padding: 0.2rem 0; border-bottom: 1px dashed var(--gray-200);">
                                    <span>${staff.name}</span>
                                    <span class="text-danger">${formatCurrency(staff.monthlySalary || 0)}</span>
                                </div>
                            `).join('')
                            : '<p style="font-size: 0.9rem; color: var(--success);">All active monthly staff paid.</p>'
                        }
                        <button class="btn btn-sm btn-secondary" onclick="closeModal('mainMenuModal'); showView('staff');" style="margin-top: 1rem;">Manage Staff</button>
                    </div>
                </div>
            </div>
        `;
    }

    async saveSettings(e) {
        e.preventDefault();
        
        const submitBtn = e.target.querySelector('button[type="submit"]');
        this.setButtonLoading(submitBtn, true, 'Saving Changes');

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
        } finally {
            this.setButtonLoading(submitBtn, false, 'Save Changes');
        }
    }

    async changePassword() {
        const passwordBtn = document.querySelector('#settingsModal button[onclick="app.changePassword()"]');
        this.setButtonLoading(passwordBtn, true, 'Updating Password');

        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmNewPassword) {
            showError('Passwords do not match.');
            this.setButtonLoading(passwordBtn, false, 'Update Password');
            return;
        }

        if (newPassword.length < 6) {
            showError('Password must be at least 6 characters long.');
            this.setButtonLoading(passwordBtn, false, 'Update Password');
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
        } finally {
            this.setButtonLoading(passwordBtn, false, 'Update Password');
        }
    }
    
    async resendVerificationEmail() {
        const resendBtn = document.querySelector('#verificationBanner .btn-primary');
        this.setButtonLoading(resendBtn, true, 'Sending...');

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
        } finally {
             this.setButtonLoading(resendBtn, false, 'Resend Link');
        }
    }

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }

    updateUI() {
        // --- EXISTING UI UPDATES ---
        const businessNameElement = document.getElementById('businessName');
        if (businessNameElement && this.userData) {
            businessNameElement.textContent = this.userData.businessName;
        }
        
        // Settings Inputs
        const settingsBusinessName = document.getElementById('settingsBusinessName');
        const settingsDefaultPrice = document.getElementById('settingsDefaultPrice');
        const settingsBusinessPhone = document.getElementById('settingsBusinessPhone');

        if (settingsBusinessName && this.userData) {
            settingsBusinessName.value = this.userData.businessName || '';
        }
        if (settingsDefaultPrice && this.userData) {
            settingsDefaultPrice.value = this.userData.defaultPrice || 20;
        }
        if (settingsBusinessPhone && this.userData) {
            settingsBusinessPhone.value = this.userData.businessPhone || '';
        }

        // --- NEW: Display Logged-in Email ---
        const settingsUserEmail = document.getElementById('settingsUserEmail');
        const currentUser = auth.currentUser;
        
        if (settingsUserEmail && currentUser) {
            settingsUserEmail.value = currentUser.email || 'N/A';
        }
        // ---------------------------------

        this.showView(this.currentView);
    }
}

let app;

document.addEventListener('DOMContentLoaded', function() {
    app = new AquaFlowApp();
});

// === GLOBAL EXPOSURE FOR HTML BUTTONS ===

function showView(viewName) {
    if (app) app.showView(viewName);
}

function showModal(modalId) {
    if (app) app.showModal(modalId);
}

function closeModal(modalId) {
    if (app) app.closeModal(modalId);
}

function showAddCustomerModal() {
    if (app) app.showModal('addCustomerModal');
}

function showAddStaffModal() {
    if (app) {
        // Ensure initial state is monthly on show
        app.updateSalaryLabel('monthly', 'monthlySalaryGroup', 'dailySalaryGroup');
        app.showModal('addStaffModal');
    }
}

function openScanner() {
    if (app) app.openScanner();
    if (app) app.initializeScanner(); // Start scanner immediately
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
    // Replacing `prompt()` with a modal/better UI is recommended.
    const quantity = parseInt(window.prompt('Enter number of cans:', '1')) || 1;
    if (quantity > 0 && app) {
        const customer = app.customers.find(c => c.id === customerId);
        if (customer) {
            app.showDeliveryForm(customerId, customer);
            const quantityInput = document.getElementById('deliveryQuantity');
            if (quantityInput) quantityInput.value = quantity;
            app.showModal('scannerModal');
            // The quick delivery button from customers list should open the form immediately, skipping camera view.
            app.stopScanner(); 
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
        // Note: Mark as read does not need a loading spinner as it's an async icon button click, feedback is the icon changing state.
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
        // Note: Delete notification does not need a loading spinner, feedback is the row disappearing.
        await db.collection('artifacts').doc(appId).collection('users').doc(app.userId).collection('notifications').doc(notificationId).delete();
        await app.loadNotifications();
    } catch (error) { console.error(error); }
}

async function clearAllNotifications() {
    if (!app) return;
    app.clearAllNotifications();
}

function confirmClearAllNotifications() { // NEW helper for modal
    if (app) app.confirmClearAllNotifications();
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

function trackSalaryPayment(staffId, staffName, monthlyOrDailySalary, salaryType) { // UPDATED signature
    if (app) app.showTrackSalaryModal(staffId, staffName, monthlyOrDailySalary, salaryType);
}

function recordSalaryPayment(e) {
    if (app) app.trackSalaryPayment(e);
}

function editStaff(staffId) {
    if (app) app.editStaff(staffId);
}

function updateStaff(e) {
    if (app) app.updateStaff(e);
}

function addStaff(e) {
    if (app) app.addStaff(e);
}

function confirmDeleteStaff(staffId, staffName) {
    if (app) app.showConfirmDeleteStaff(staffId, staffName);
}

function deleteStaffConfirmed() {
    const staffId = document.getElementById('staffToDeleteId').value;
    if (staffId && app) {
        app.deleteStaff(staffId);
    }
}

function copyBusinessId() {
    const input = document.getElementById('settingsBusinessId');
    input.select();
    document.execCommand('copy');
    showSuccess('Business ID copied to clipboard!');
}
