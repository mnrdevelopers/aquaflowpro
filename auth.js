// Authentication Management
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.authStateReady = false;
        this.init();
    }

    init() {
        this.setupAuthStateListener();
        this.setupFormHandlers();
    }

  setupAuthStateListener() {
    auth.onAuthStateChanged(async (user) => {
        console.log('Auth state changed:', user ? 'User signed in' : 'User signed out');
        this.currentUser = user;
        this.authStateReady = true;
        
        if (user) {
            // CRITICAL: Wait for user data to be fully loaded
            await this.ensureUserDataLoaded(user);
            
            // Check if we are currently on the auth page
            const path = window.location.pathname;
            const isAuthPage = path.includes('auth.html') || path === '/' || path.endsWith('/');

            if (isAuthPage) {
                console.log('On auth page with authenticated user, redirecting...');
                this.redirectBasedOnRole();
            }
        } else {
            this.userData = null;
            localStorage.removeItem('userData');
            
            // Redirect to auth if on protected pages
            if (window.location.pathname.includes('app.html') || 
                window.location.pathname.includes('staff.html')) {
                window.location.href = 'auth.html';
            }
        }
    });
}

    // Add this new method to ensure user data is loaded
async ensureUserDataLoaded(user) {
    // First check if we already have valid user data
    if (this.userData && this.userData.role) {
        console.log('User data already loaded:', this.userData.role);
        return true;
    }
    
    console.log('Loading user data for user:', user.uid);
    
    // Try to load from localStorage first (fastest)
    const cached = localStorage.getItem('userData');
    if (cached) {
        try {
            const cachedData = JSON.parse(cached);
            if (cachedData.uid === user.uid && cachedData.role) {
                console.log('Using cached user data');
                this.userData = cachedData;
                return true;
            }
        } catch (e) {
            console.log('Invalid cached data, clearing...');
            localStorage.removeItem('userData');
        }
    }
    
    // If no cached data, load from Firestore with retry logic
    let attempts = 0;
    const maxAttempts = 3; // Reduced from 5 to 3
    
    while (attempts < maxAttempts) {
        try {
            console.log(`Loading user data attempt ${attempts + 1}/${maxAttempts}`);
            const success = await this.loadUserData(user);
            
            if (success && this.userData && this.userData.role) {
                console.log('User data loaded successfully on attempt', attempts + 1);
                return true;
            }
            
            attempts++;
            if (attempts < maxAttempts) {
                console.log(`Retrying user data load in 1s... (${attempts}/${maxAttempts})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        } catch (error) {
            console.error(`Error on attempt ${attempts + 1}:`, error);
            attempts++;
            if (attempts < maxAttempts) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    
    console.error('Failed to load user data after', maxAttempts, 'attempts');
    
    // Last resort: Try to create minimal user data if this is a new user
    if (!this.userData) {
        console.log('Creating minimal user data as fallback');
        this.userData = {
            uid: user.uid,
            email: user.email,
            role: 'owner', // Default to owner as fallback
            ownerName: user.displayName || user.email.split('@')[0]
        };
        localStorage.setItem('userData', JSON.stringify(this.userData));
        return true;
    }
    
    return false;
}
    
   setupFormHandlers() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.setupInputValidation(loginForm);
    }

    // Signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        this.setupInputValidation(signupForm);
    }

    // Reset Password form
    const resetForm = document.getElementById('resetForm');
    if (resetForm) {
        resetForm.addEventListener('submit', (e) => this.handlePasswordReset(e));
    }
}

    setupInputValidation(form) {
    const inputs = form.querySelectorAll('input[required]');
    inputs.forEach(input => {
        input.addEventListener('blur', () => this.validateInput(input));
        input.addEventListener('input', () => this.clearInputError(input));
    });
}

validateInput(input) {
    this.clearInputError(input);
    
    // Skip validation for hidden inputs (based on role selection)
    if (input.offsetParent === null) {
        return true;
    }
    
    if (!input.value.trim()) {
        this.showInputError(input, 'This field is required');
        return false;
    }

    if (input.type === 'email' && !this.isValidEmail(input.value)) {
        this.showInputError(input, 'Please enter a valid email address');
        return false;
    }

    if (input.type === 'tel' && !this.isValidPhone(input.value)) {
        this.showInputError(input, 'Please enter a valid phone number');
        return false;
    }

    if (input.type === 'password' && input.value.length < 6) {
        this.showInputError(input, 'Password must be at least 6 characters');
        return false;
    }

    this.showInputSuccess(input);
    return true;
}

isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

isValidPhone(phone) {
    const phoneRegex = /^[0-9]{10}$/;
    return phoneRegex.test(phone.replace(/\D/g, ''));
}

showInputError(input, message) {
    this.clearInputError(input);
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'input-error';
    errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
    
    input.parentNode.appendChild(errorDiv);
    input.style.borderColor = 'var(--danger)';
}

showInputSuccess(input) {
    input.style.borderColor = 'var(--success)';
}

clearInputError(input) {
    const errorDiv = input.parentNode.querySelector('.input-error');
    if (errorDiv) {
        errorDiv.remove();
    }
    input.style.borderColor = '';
}
    
 // In auth.js - Replace the handleLogin method

async handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!this.validateInput(document.getElementById('loginEmail')) || 
        !this.validateInput(document.getElementById('loginPassword'))) {
        return;
    }
    
    try {
        // Start loading state
        this.setFormLoading('loginForm', true);
        
        // Clear any existing user data to ensure fresh state
        this.userData = null;
        localStorage.removeItem('userData');
        
        // Perform Login
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        console.log('Login successful, loading user data...');
        
        // Wait for user data to be loaded
        const dataLoaded = await this.ensureUserDataLoaded(user);
        
        if (dataLoaded) {
            showSuccess('Welcome back! Redirecting...');
            console.log('User data loaded, redirecting to:', this.userData.role);
            
            // Use setTimeout to ensure UI updates before redirect
            setTimeout(() => {
                this.redirectBasedOnRole();
            }, 100);
        } else {
            showError('Failed to load user profile. Please try again.');
            this.setFormLoading('loginForm', false);
        }
        
    } catch (error) {
        console.error('Login error:', error);
        this.handleAuthError(error);
        this.setFormLoading('loginForm', false);
    }
}

    // In auth.js - Replace the redirectBasedOnRole method

redirectBasedOnRole() {
    // If we don't have user data but have a current user, use fallback
    if (!this.userData && this.currentUser) {
        console.log('No user data available, using fallback data');
        this.userData = {
            uid: this.currentUser.uid,
            email: this.currentUser.email,
            role: 'owner', // Default fallback
            ownerName: this.currentUser.displayName || this.currentUser.email.split('@')[0]
        };
    }
    
    if (!this.userData || !this.userData.role) {
        console.error('Cannot redirect: User data or role missing', {
            hasUserData: !!this.userData,
            hasRole: !!(this.userData && this.userData.role),
            userData: this.userData
        });
        
        // Emergency fallback - redirect to app.html and let it handle the auth
        console.log('Emergency fallback: redirecting to app.html');
        window.location.replace('app.html');
        return;
    }
    
    console.log('Redirecting based on role:', this.userData.role);
    
    // Use location.replace instead of href to prevent history issues
    if (this.userData.role === 'staff') {
        window.location.replace('staff.html');
    } else {
        window.location.replace('app.html');
    }
}
    
    // Handle Password Reset
    async handlePasswordReset(e) {
        e.preventDefault();
        const emailInput = document.getElementById('resetEmail');
        const email = emailInput.value;

        if (!this.isValidEmail(email)) {
            this.showInputError(emailInput, 'Please enter a valid email');
            return;
        }

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            await auth.sendPasswordResetEmail(email);
            showSuccess('Password reset link sent to your email!');
            // Switch back to login after short delay
            setTimeout(() => {
                showTab('login');
                emailInput.value = '';
            }, 3000);
        } catch (error) {
            console.error('Reset error:', error);
            this.handleAuthError(error);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalText;
        }
    }

   async handleSignup(e) {
        e.preventDefault();
        
        const isStaff = document.getElementById('isStaffCheckbox').checked;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const ownerName = document.getElementById('ownerName').value;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        // Prepare Data object based on role
        let userData = {
            email,
            ownerName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };

        if (isStaff) {
            // Staff Validation
            const businessOwnerId = document.getElementById('businessOwnerId').value.trim();
            if (!businessOwnerId) {
                this.showInputError(document.getElementById('businessOwnerId'), 'Business Owner ID is required');
                return;
            }
            userData.role = 'staff';
            userData.ownerId = businessOwnerId;
        } else {
            // Business Owner Validation
            const businessName = document.getElementById('businessName').value;
            const businessPhone = document.getElementById('businessPhone').value;
            const businessAddress = document.getElementById('businessAddress').value;
            const defaultPrice = parseInt(document.getElementById('defaultPrice').value) || 20;

            userData.role = 'owner';
            userData.businessName = businessName;
            userData.businessPhone = businessPhone;
            userData.businessAddress = businessAddress;
            userData.defaultPrice = defaultPrice;
            userData.subscription = 'free';
        }
        
        try {
            this.setFormLoading('signupForm', true);
            
            // Create user account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // Send Email Verification Link
            try {
                await user.sendEmailVerification();
            } catch (emailError) {
                console.error('Error sending verification email:', emailError);
            }

            // Save User Data
            try {
                await db.collection('artifacts').doc(appId).collection('users').doc(user.uid).set(userData);
                
                // Update local state immediately so listener picks it up
                this.userData = userData;
                this.userData.uid = user.uid;
                localStorage.setItem('userData', JSON.stringify(this.userData));

            } catch (firestoreError) {
                console.error('Firestore write error:', firestoreError);
                await user.delete(); // Rollback
                throw new Error('Failed to create profile. Please try again.');
            }

            showSuccess(isStaff ? 'Staff account created!' : 'Business account created!');
            
            // Listener will handle redirect
            
        } catch (error) {
            console.error('Signup error:', error);
            this.handleAuthError(error);
            this.setFormLoading('signupForm', false);
        }
    }

    setFormLoading(formId, isLoading) {
        const form = document.getElementById(formId);
        if(!form) return;
        const submitBtn = form.querySelector('button[type="submit"]');
        if(!submitBtn) return;

        if (isLoading) {
            form.classList.add('loading');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        } else {
            form.classList.remove('loading');
            submitBtn.disabled = false;
            if (formId === 'loginForm') {
                submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            } else if (formId === 'signupForm') {
                 const isStaff = document.getElementById('isStaffCheckbox')?.checked;
                 submitBtn.innerHTML = isStaff ? '<i class="fas fa-id-badge"></i> Create Staff Account' : '<i class="fas fa-user-plus"></i> Create Business Account';
            }
        }
    }
    
     async loadUserData(user) {
    try {
        console.log('Loading user data for:', user.uid);
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Firestore timeout')), 10000)
        );
        
        const userDocPromise = db.collection('artifacts').doc(appId).collection('users').doc(user.uid).get();
        
        const userDoc = await Promise.race([userDocPromise, timeoutPromise]);
        
        if (userDoc.exists) {
            this.userData = userDoc.data();
            this.userData.uid = user.uid;
            localStorage.setItem('userData', JSON.stringify(this.userData));
            console.log('User data loaded successfully:', this.userData.role);
            return true;
        } else {
            console.error('User document does not exist in Firestore');
            // Fallback: Check local storage if network fails
            const cached = localStorage.getItem('userData');
            if (cached) {
                console.log('Using cached user data due to missing document');
                this.userData = JSON.parse(cached);
                return true;
            }
            return false;
        }
    } catch (error) {
        console.error('Error loading user data:', error);
        // Fallback: Check local storage if network fails
        const cached = localStorage.getItem('userData');
        if (cached) {
            console.log('Using cached user data due to network error');
            this.userData = JSON.parse(cached);
            return true;
        }
        return false;
    }
}
    
    updateUI() {
        // This is now handled mainly in app.js
    }

  handleAuthError(error) {
        let message = 'An error occurred. Please try again.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                message = 'This email is already registered. Please sign in instead.';
                break;
            case 'auth/invalid-email':
                message = 'Please enter a valid email address.';
                break;
            case 'auth/weak-password':
                message = 'Password should be at least 6 characters long.';
                break;
            case 'auth/user-not-found':
                message = 'No account found with this email. Please sign up first.';
                break;
            case 'auth/wrong-password':
                message = 'Incorrect password. Please try again.';
                break;
            case 'auth/network-request-failed':
                message = 'Network error. Please check your internet connection.';
                break;
            default:
                if (error.message.includes('Firestore write error') || error.message.includes('verification failed')) {
                    message = error.message;
                }
                break;
        }
        
        showError(message);
    }

    async logout() {
        try {
            await auth.signOut();
            localStorage.removeItem('userData');
            window.location.href = 'auth.html';
        } catch (error) {
            console.error('Logout error:', error);
            showError('Error signing out');
        }
    }

    getCurrentUser() {
        return this.currentUser;
    }

    getUserData() {
        if (this.userData) return this.userData;
        const storedData = localStorage.getItem('userData');
        if (storedData) {
            try {
                this.userData = JSON.parse(storedData);
                return this.userData;
            } catch (e) {
                localStorage.removeItem('userData');
                return null;
            }
        }
        return null;
    }

    isAuthStateReady() {
        return this.authStateReady;
    }
}

const authManager = new AuthManager();
function logout() {
    authManager.logout();
}
