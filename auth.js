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
            console.log('Auth state changed:', user);
            this.currentUser = user;
            
            if (user) {
                // User is signed in
                await this.loadUserData(user);
                
                // Redirect to app if on auth page
                if (window.location.pathname.includes('auth.html')) {
                    console.log('Redirecting to app...');
                    window.location.href = 'app.html';
                }
                
                // Update app if already on app page
                if (window.location.pathname.includes('app.html') && window.app) {
                    window.app.userId = user.uid;
                    window.app.userData = this.userData;
                    await window.app.loadInitialData();
                }
            } else {
                // User is signed out
                this.userData = null;
                
                // Redirect to auth if on app page
                if (window.location.pathname.includes('app.html')) {
                    console.log('Redirecting to auth...');
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
            console.log('User logged in:', userCredential.user);
            showSuccess('Welcome back!');
            
            // Redirect will happen automatically via auth state listener
            
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
            console.log('User created:', user);
            
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

            // Store user data in localStorage for immediate access
            const userData = {
                businessName: businessName,
                ownerName: ownerName,
                businessPhone: businessPhone,
                businessAddress: businessAddress,
                email: email,
                defaultPrice: defaultPrice,
                uid: user.uid
            };
            
            localStorage.setItem('userData', JSON.stringify(userData));
            this.userData = userData;
            
            showSuccess('Business account created successfully!');
            
            // Wait a moment for Firestore to be ready, then redirect
            setTimeout(() => {
                window.location.href = 'app.html';
            }, 1500);
            
        } catch (error) {
            console.error('Signup error:', error);
            this.handleAuthError(error);
        } finally {
            this.setFormLoading('signupForm', false);
        }
    }

    async loadUserData(user) {
        try {
            console.log('Loading user data for:', user.uid);
            const userDoc = await db.collection('users').doc(user.uid).get();
            
            if (userDoc.exists) {
                this.userData = userDoc.data();
                this.userData.uid = user.uid;
                
                // Store in localStorage for quick access
                localStorage.setItem('userData', JSON.stringify(this.userData));
                console.log('User data loaded:', this.userData);
                
                // Update UI if on app page
                if (window.location.pathname.includes('app.html')) {
                    this.updateUI();
                }
            } else {
                console.error('User document not found in Firestore');
                showError('User profile not found. Please contact support.');
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            showError('Failed to load user data. Please refresh the page.');
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
            case 'auth/too-many-requests':
                message = 'Too many failed attempts. Please try again later.';
                break;
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

// Initialize auth manager
const authManager = new AuthManager();

// Global logout function
function logout() {
    authManager.logout();
}
