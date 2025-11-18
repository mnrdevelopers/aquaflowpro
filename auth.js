// Authentication Management
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.init();
    }

    init() {
        this.setupAuthStateListener();
        this.setupFormHandlers();
    }

    setupAuthStateListener() {
        auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            
            if (user) {
                // User is signed in
                await this.loadUserData(user);
                
                // Redirect to app if on auth page
                if (window.location.pathname.includes('auth.html')) {
                    window.location.href = 'app.html';
                }
            } else {
                // User is signed out
                this.userData = null;
                
                // Redirect to auth if on app page
                if (window.location.pathname.includes('app.html')) {
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
    
    // Validate inputs
    const emailValid = this.validateInput(document.getElementById('loginEmail'));
    const passwordValid = this.validateInput(document.getElementById('loginPassword'));
    
    if (!emailValid || !passwordValid) {
        return;
    }
    
    try {
        this.setFormLoading('loginForm', true);
        
        const userCredential = await auth.signInWithEmailAndPassword(email, password);
        showSuccess('Welcome back!');
        
    } catch (error) {
        console.error('Login error:', error);
        this.handleAuthError(error);
    } finally {
        this.setFormLoading('loginForm', false);
    }
}


  async handleSignup(e) {
    e.preventDefault();
    
    const businessName = document.getElementById('businessName').value;
    const ownerName = document.getElementById('ownerName').value;
    const businessPhone = document.getElementById('businessPhone').value;
    const businessAddress = document.getElementById('businessAddress').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const defaultPrice = parseInt(document.getElementById('defaultPrice').value) || 20;
    
    // Validate all inputs
    const inputs = [
        'businessName', 'ownerName', 'businessPhone', 
        'businessAddress', 'signupEmail', 'signupPassword', 'defaultPrice'
    ];
    
    let allValid = true;
    inputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input && !this.validateInput(input)) {
            allValid = false;
        }
    });
    
    if (!allValid) {
        return;
    }
    
    try {
        this.setFormLoading('signupForm', true);
        
        // Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Create user profile in Firestore
        await db.collection('users').doc(user.uid).set({
            businessName: businessName,
            ownerName: ownerName,
            businessPhone: businessPhone,
            businessAddress: businessAddress,
            email: email,
            defaultPrice: defaultPrice,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            subscription: 'free',
            status: 'active'
        });

        showSuccess('Business account created successfully!');
        
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
    
    if (isLoading) {
        form.classList.add('loading');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    } else {
        form.classList.remove('loading');
        submitBtn.disabled = false;
        
        // Reset button text based on form type
        if (formId === 'loginForm') {
            submitBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> Sign In to Your Business';
        } else {
            submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Create Business Account';
        }
    }
}
    
    async loadUserData(user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                this.userData = userDoc.data();
                this.userData.uid = user.uid;
                
                // Store in localStorage for quick access
                localStorage.setItem('userData', JSON.stringify(this.userData));
                
                // Update UI if on app page
                if (window.location.pathname.includes('app.html')) {
                    this.updateUI();
                }
            }
        } catch (error) {
            console.error('Error loading user data:', error);
        }
    }

    updateUI() {
        // Update business name in header
        const businessNameElement = document.getElementById('businessName');
        if (businessNameElement && this.userData) {
            businessNameElement.textContent = this.userData.businessName;
        }
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
        return this.userData;
    }
}

// Initialize auth manager
const authManager = new AuthManager();

// Global logout function
function logout() {
    authManager.logout();
}
