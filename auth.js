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
                
                // Redirect if on auth page
                if (window.location.pathname.includes('auth.html') && userDataLoaded) {
                    this.redirectUser();
                }
            } else {
                // User is signed out
                this.userData = null;
                localStorage.removeItem('userData');
                
                // Redirect to auth if on a protected page
                if (!window.location.pathname.includes('auth.html') && !window.location.pathname.includes('index.html')) {
                    window.location.href = 'auth.html';
                }
            }
        });
    }

    redirectUser() {
        const role = this.userData?.role || 'owner';
        const targetPage = role === 'staff' ? 'staff.html' : 'app.html';
        console.log(`Redirecting ${role} to ${targetPage}`);
        window.location.href = targetPage;
    }

   setupFormHandlers() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        this.setupInputValidation(loginForm);
    }

    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        this.setupInputValidation(signupForm);
    }

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
    if (input.offsetParent === null) return true; // Skip hidden inputs
    
    if (!input.value.trim()) {
        this.showInputError(input, 'This field is required');
        return false;
    }

    if (input.type === 'email' && !this.isValidEmail(input.value)) {
        this.showInputError(input, 'Please enter a valid email address');
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
    if (errorDiv) errorDiv.remove();
    input.style.borderColor = '';
}
    
   async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!this.validateInput(document.getElementById('loginEmail')) || 
        !this.validateInput(document.getElementById('loginPassword'))) return;
    
    try {
        this.setFormLoading('loginForm', true);
        await auth.signInWithEmailAndPassword(email, password);
        showSuccess('Welcome back!');
        // Redirect handled by auth listener
    } catch (error) {
        console.error('Login error:', error);
        this.handleAuthError(error);
        this.setFormLoading('loginForm', false);
    }
}

    async handlePasswordReset(e) {
        e.preventDefault();
        const email = document.getElementById('resetEmail').value;
        if (!this.isValidEmail(email)) return this.showInputError(document.getElementById('resetEmail'), 'Invalid email');

        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

        try {
            await auth.sendPasswordResetEmail(email);
            showSuccess('Password reset link sent!');
            setTimeout(() => { showTab('login'); }, 3000);
        } catch (error) {
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
        
        let userData = {
            email,
            ownerName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };

        if (isStaff) {
            const businessOwnerId = document.getElementById('businessOwnerId').value.trim();
            if (!businessOwnerId) return this.showInputError(document.getElementById('businessOwnerId'), 'Owner ID required');
            userData.role = 'staff';
            userData.ownerId = businessOwnerId;
        } else {
            userData.role = 'owner';
            userData.businessName = document.getElementById('businessName').value;
            userData.businessPhone = document.getElementById('businessPhone').value;
            userData.businessAddress = document.getElementById('businessAddress').value;
            userData.defaultPrice = parseInt(document.getElementById('defaultPrice').value) || 20;
        }
        
        try {
            this.setFormLoading('signupForm', true);
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            try { await user.sendEmailVerification(); } catch (err) { console.error(err); }

            await db.collection('artifacts').doc(appId).collection('users').doc(user.uid).set(userData);
            await this.loadUserData(user);

            showSuccess('Account created successfully!');
            setTimeout(() => this.redirectUser(), 1500);
            
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
        
        if (isLoading) {
            form.classList.add('loading');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        } else {
            form.classList.remove('loading');
            submitBtn.disabled = false;
            if (formId === 'loginForm') submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In';
            else if (formId === 'signupForm') submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Account';
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

  handleAuthError(error) {
        let message = 'An error occurred.';
        switch (error.code) {
            case 'auth/email-already-in-use': message = 'Email already registered.'; break;
            case 'auth/invalid-email': message = 'Invalid email address.'; break;
            case 'auth/weak-password': message = 'Password too weak.'; break;
            case 'auth/user-not-found': message = 'Account not found.'; break;
            case 'auth/wrong-password': message = 'Incorrect password.'; break;
        }
        showError(message);
    }

    async logout() {
        try {
            await auth.signOut();
            localStorage.removeItem('userData');
            window.location.href = 'auth.html';
        } catch (error) {
            showError('Error signing out');
        }
    }

    getCurrentUser() { return this.currentUser; }
    getUserData() { 
        if (this.userData) return this.userData;
        return JSON.parse(localStorage.getItem('userData') || 'null');
    }
    isAuthStateReady() { return this.authStateReady; }
}

const authManager = new AuthManager();
function logout() { authManager.logout(); }
