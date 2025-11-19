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
                // User is signed in
                const userDataLoaded = await this.loadUserData(user);
                
                // Redirect if on auth page AND user data is loaded
                if (window.location.pathname.includes('auth.html') && userDataLoaded) {
                    console.log('Redirecting to app.html - User authenticated with data');
                    window.location.href = 'app.html';
                }
            } else {
                // User is signed out
                this.userData = null;
                localStorage.removeItem('userData');
                
                if (window.location.pathname.includes('app.html')) {
                    console.log('Redirecting to auth.html - User signed out');
                    window.location.href = 'auth.html';
                }
            }
        });
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
    
   async handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!this.validateInput(document.getElementById('loginEmail')) || 
        !this.validateInput(document.getElementById('loginPassword'))) {
        return;
    }
    
    try {
        this.setFormLoading('loginForm', true);
        await auth.signInWithEmailAndPassword(email, password);
        showSuccess('Welcome back!');
    } catch (error) {
        console.error('Login error:', error);
        this.handleAuthError(error);
    } finally {
        this.setFormLoading('loginForm', false);
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
            // Note: Staff inherits business details from the ownerId when loaded in app.js
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
            
            // Optional: Verify Owner ID exists before creating user (Simple check)
            if (isStaff) {
                const ownerDoc = await db.collection('artifacts').doc(appId).collection('users').doc(userData.ownerId).get();
                // Note: This might fail if security rules are strict, but assuming open rules for this generated app context.
                // If it fails due to permission, we proceed assuming ID is correct, app.js will handle access errors.
                if (ownerDoc.exists) {
                    console.log('Linking to business:', ownerDoc.data().businessName);
                } else {
                    // We can't always verify due to permissions, but if we can read it and it's missing:
                   // console.warn('Owner ID might be invalid or not public.');
                }
            }

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
            } catch (firestoreError) {
                console.error('Firestore write error:', firestoreError);
                await user.delete(); // Rollback
                throw new Error('Failed to create profile. Please try again.');
            }

            showSuccess(isStaff ? 'Staff account created!' : 'Business account created!');
            
            setTimeout(() => {
                window.location.href = 'app.html';
            }, 2000);
            
        } catch (error) {
            console.error('Signup error:', error);
            this.handleAuthError(error);
        } finally {
            this.setFormLoading('signupForm', false);
        }
    }

    setFormLoading(formId, isLoading) {
        const form = document.getElementById(formId);
        const submitBtn = form.querySelector('button[type="submit"]');
        if(!form) return;

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
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            const userDoc = await db.collection('artifacts').doc(appId).collection('users').doc(user.uid).get();
            
            if (userDoc.exists) {
                this.userData = userDoc.data();
                this.userData.uid = user.uid;
                localStorage.setItem('userData', JSON.stringify(this.userData));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error loading user data:', error);
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
            showSuccess('Signed out successfully');
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
