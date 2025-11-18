// Authentication Management
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.userData = null;
        this.init();
    }

    init() {
        // Wait for Firebase to be initialized
        if (typeof auth === 'undefined') {
            console.error('Firebase Auth not initialized');
            setTimeout(() => this.init(), 100);
            return;
        }
        
        this.setupAuthStateListener();
        this.setupFormHandlers();
    }

    setupAuthStateListener() {
        auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            
            if (user) {
                // User is signed in
                console.log('User signed in:', user.email);
                await this.loadUserData(user);
                
                // Redirect to app if on auth page
                if (window.location.pathname.includes('auth.html')) {
                    window.location.href = 'app.html';
                }
            } else {
                // User is signed out
                console.log('User signed out');
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
        }

        // Signup form
        const signupForm = document.getElementById('signupForm');
        if (signupForm) {
            signupForm.addEventListener('submit', (e) => this.handleSignup(e));
        }
    }

    async handleLogin(e) {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            this.setFormLoading('loginForm', true);
            
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            showSuccess('Welcome back! ' + userCredential.user.email);
            
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

    async loadUserData(user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                this.userData = userDoc.data();
                this.userData.uid = user.uid;
                
                // Store in localStorage for quick access
                localStorage.setItem('userData', JSON.stringify(this.userData));
                
                console.log('User data loaded:', this.userData.businessName);
                
                // Update UI if on app page
                if (window.location.pathname.includes('app.html')) {
                    this.updateUI();
                }
            } else {
                console.error('User document not found');
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
            default:
                message = error.message || 'Authentication failed. Please try again.';
        }
        
        showError(message);
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

// Initialize auth manager when DOM is loaded
let authManager;

document.addEventListener('DOMContentLoaded', function() {
    authManager = new AuthManager();
});

// Global logout function
function logout() {
    if (authManager) {
        authManager.logout();
    }
}

// Password toggle function
function togglePassword(inputId) {
    const input = document.getElementById(inputId);
    const icon = input.parentNode.querySelector('.btn-eye i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fas fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fas fa-eye';
    }
}
