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
                
                // CRITICAL FIX: Only redirect if we're on auth page AND user data is successfully loaded
                if (window.location.pathname.includes('auth.html') && userDataLoaded) {
                    console.log('Redirecting to app.html - User authenticated with data');
                    window.location.href = 'app.html';
                } else if (window.location.pathname.includes('auth.html') && !userDataLoaded) {
                    console.log('User authenticated but data missing - staying on auth page');
                    // Don't redirect if data is missing
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
        const defaultPriceInput = document.getElementById('defaultPrice').value;
        const defaultPrice = parseInt(defaultPriceInput) || 20;
        
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
            
            console.log('User account created:', user.uid);
            
            // CRITICAL FIX: Add delay to ensure auth state is propagated
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            
            // CRITICAL FIX: Better error handling for Firestore write
            try {
                console.log('Writing user data to Firestore...');
                await db.collection('artifacts').doc(appId).collection('users').doc(user.uid).set({
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
                console.log('User data successfully written to Firestore');
            } catch (firestoreError) {
                console.error('Firestore write error:', firestoreError);
                // If Firestore fails, delete the user account to maintain consistency
                await user.delete();
                throw new Error('Failed to create business profile. Please try again.');
            }

            // CRITICAL FIX: Force reload user data and verify it exists
            console.log('Verifying user data was written...');
            const userDataLoaded = await this.loadUserData(user);
            
            if (!userDataLoaded) {
                throw new Error('User data verification failed. Please try signing in again.');
            }
            
            showSuccess('Business account created successfully! Redirecting...');
            
            // CRITICAL FIX: Manual redirect after successful verification
            setTimeout(() => {
                if (this.userData) {
                    console.log('Manual redirect to app.html after successful signup');
                    window.location.href = 'app.html';
                } else {
                    console.error('Cannot redirect - user data still missing');
                    showError('Account created but data issue detected. Please sign in manually.');
                }
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
            console.log('Loading user data for:', user.uid);
            
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            console.log('Using appId:', appId);
            
            const userDocRef = db.collection('artifacts').doc(appId).collection('users').doc(user.uid);
            const userDoc = await userDocRef.get();
            
            console.log('Document exists:', userDoc.exists);
            
            if (userDoc.exists) {
                this.userData = userDoc.data();
                this.userData.uid = user.uid;
                
                localStorage.setItem('userData', JSON.stringify(this.userData));
                console.log('User data loaded successfully:', this.userData.businessName);
                return true;
            } else {
                console.error('User document does not exist in Firestore');
                this.userData = null;
                localStorage.removeItem('userData');
                return false;
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            
            this.userData = null;
            localStorage.removeItem('userData');
            return false;
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
            default:
                // Handle custom errors from our code
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

 // CRITICAL FIX: Enhanced getUserData with better error handling
    getUserData() {
        // First return instance data if available
        if (this.userData) {
            return this.userData;
        }
        
        // Then check localStorage as fallback
        const storedData = localStorage.getItem('userData');
        if (storedData) {
            try {
                this.userData = JSON.parse(storedData);
                console.log('User data loaded from localStorage');
                return this.userData;
            } catch (e) {
                console.error('Failed to parse user data from localStorage', e);
                localStorage.removeItem('userData');
                return null;
            }
        }
        
        console.log('No user data available in memory or localStorage');
        return null;
    }

    // CRITICAL FIX: Add method to check if auth state is ready
    isAuthStateReady() {
        return this.authStateReady;
    }
}

// Initialize auth manager
const authManager = new AuthManager();
    
// Global logout function
function logout() {
    authManager.logout();
}
