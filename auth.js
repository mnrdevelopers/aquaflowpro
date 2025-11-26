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
                // === UPDATED: Redirect Logic ===
                // If we are on auth.html or index.html, redirect immediately to app
                const path = window.location.pathname;
                if (path.endsWith('auth.html') || path.endsWith('index.html') || path.endsWith('/')) {
                    console.log('User authenticated, redirecting to app.html');
                    window.location.href = 'app.html';
                    return;
                }

                // Load user data if we are already in the app
                await this.loadUserData(user);
                
            } else {
                // User is signed out
                this.userData = null;
                localStorage.removeItem('userData');
                
                // If we are on app.html, kick them out to auth.html
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

    // === VALIDATION LOGIC ===
    setupInputValidation(form) {
        const inputs = form.querySelectorAll('input[required]');
        inputs.forEach(input => {
            input.addEventListener('blur', () => this.validateInput(input));
            input.addEventListener('input', () => this.clearInputError(input));
        });
    }

    validateInput(input) {
        this.clearInputError(input);
        
        // Skip validation for hidden inputs (based on role selection, if any)
        if (input.offsetParent === null) {
            return true;
        }
        
        // Check Empty
        if (!input.value.trim()) {
            this.showInputError(input, 'This field is required');
            return false;
        }

        // Check Email
        if (input.type === 'email' && !this.isValidEmail(input.value)) {
            this.showInputError(input, 'Please enter a valid email address');
            return false;
        }

        // Check Phone
        if (input.type === 'tel' && !this.isValidPhone(input.value)) {
            this.showInputError(input, 'Please enter a valid 10-digit phone number');
            return false;
        }

        // Check Password
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
        // Strips non-digits and checks for exactly 10 digits
        const phoneRegex = /^[0-9]{10}$/;
        return phoneRegex.test(phone.replace(/\D/g, ''));
    }

    showInputError(input, message) {
        this.clearInputError(input);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'input-error';
        errorDiv.style.color = '#dc3545'; // Added inline style for visibility
        errorDiv.style.fontSize = '0.8rem';
        errorDiv.style.marginTop = '4px';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${message}`;
        
        input.parentNode.appendChild(errorDiv);
        input.style.borderColor = '#dc3545'; // var(--danger)
    }

    showInputSuccess(input) {
        input.style.borderColor = '#28a745'; // var(--success)
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
    
    const submitBtn = e.target.querySelector('button[type="submit"]');
    // NOTE: Using raw text here for mobile visibility when spinner is active
    this.setButtonLoading(submitBtn, true, 'Sign In');
    
    // Perform full form validation before submitting
    const inputs = document.querySelectorAll('#loginForm input[required]');
    let isValid = true;
    inputs.forEach(input => {
        if (!this.validateInput(input)) isValid = false;
    });

    if (!isValid) {
        this.setButtonLoading(submitBtn, false, '<i class="fas fa-sign-in-alt"></i> Sign In');
        return;
    }
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        showSuccess('Welcome back!');
        // Redirect handled by listener
    } catch (error) {
        console.error('Login error:', error);
        this.handleAuthError(error);
        this.setButtonLoading(submitBtn, false, '<i class="fas fa-sign-in-alt"></i> Sign In');
    }
}

    // Handle Password Reset
    async handlePasswordReset(e) {
        e.preventDefault();
        const submitBtn = e.target.querySelector('button[type="submit"]');
        const originalText = submitBtn.innerHTML;

        // NOTE: Using raw text here for mobile visibility when spinner is active
        this.setButtonLoading(submitBtn, true, 'Sending...');
        
        const emailInput = document.getElementById('resetEmail');
        const email = emailInput.value;

        if (!this.isValidEmail(email)) {
            this.showInputError(emailInput, 'Please enter a valid email');
            this.setButtonLoading(submitBtn, false, originalText);
            return;
        }
        
        try {
            await auth.sendPasswordResetEmail(email);
            showSuccess('Password reset link sent to your email!');
            
            // Restore button but hide it since we switch views
            this.setButtonLoading(submitBtn, false, originalText);
            
            // Switch back to login after short delay
            setTimeout(() => {
                showTab('login');
                emailInput.value = '';
            }, 3000);
            
        } catch (error) {
            console.error('Reset error:', error);
            this.handleAuthError(error);
            this.setButtonLoading(submitBtn, false, originalText);
        }
    }

   async handleSignup(e) {
        e.preventDefault();
        
        const submitBtn = document.getElementById('signupBtn');
        // NOTE: Using raw text here for mobile visibility when spinner is active
        this.setButtonLoading(submitBtn, true, 'Creating Account...');

        // Perform full form validation before submitting
        const inputs = document.querySelectorAll('#signupForm input[required]');
        let isValid = true;
        inputs.forEach(input => {
            if (!this.validateInput(input)) isValid = false;
        });

        if (!isValid) {
            this.setButtonLoading(submitBtn, false, '<i class="fas fa-user-plus"></i> Create Business Account');
            return;
        }
        
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;
        const ownerName = document.getElementById('ownerName').value;
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        
        const businessName = document.getElementById('businessName').value;
        const businessPhone = document.getElementById('businessPhone').value;
        const businessAddress = document.getElementById('businessAddress').value;
        const defaultPrice = parseInt(document.getElementById('defaultPrice').value) || 20;

        let userData = {
            email,
            ownerName,
            businessName,
            businessPhone,
            businessAddress,
            defaultPrice,
            subscription: 'free',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            status: 'active'
        };
        
        try {
            // 1. Create user account
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;
            
            // 2. Save User Data to Firestore (CRITICAL STEP)
            try {
                // Write own user document using STRICT PATH rule
                await db.collection('artifacts').doc(appId).collection('users').doc(user.uid).set(userData);
            } catch (firestoreError) {
                console.error('Firestore write error during signup:', firestoreError);
                
                // Rollback: Delete the auth user if Firestore write fails
                await user.delete().catch(e => console.error("Failed to rollback auth user:", e));
                
                throw new Error('Failed to create user profile. Please check database connection/rules.');
            }
            
            // 3. Send Email Verification Link (Non-critical)
            try {
                await user.sendEmailVerification();
            } catch (emailError) {
                console.warn('Error sending verification email:', emailError);
            }

            showSuccess('Business account created! Please check your email for verification.');
            // Redirect handled by listener
            
        } catch (error) {
            console.error('Signup error:', error);
            this.handleAuthError(error);
            this.setButtonLoading(submitBtn, false, '<i class="fas fa-user-plus"></i> Create Business Account');
        }
    }
    
    // Updated setButtonLoading to use the new CSS spinner
    setButtonLoading(button, isLoading, originalText) {
        if (!button) return;

        if (isLoading) {
            button.classList.add('is-loading');
            button.disabled = true;
            // Store original content before overwriting
            button.setAttribute('data-original-html', button.innerHTML);
            // Use raw text for accessibility/mobile clarity when obscured
            const displayText = originalText.replace(/<[^>]*>?/gm, ''); 
            
            button.innerHTML = `
                <span class="btn-spinner">
                    <div class="spinner-border" role="status"></div>
                </span>
                <span style="visibility: hidden;">${displayText}</span>
            `;
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
    
     async loadUserData(user) {
        try {
            const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
            // Using STRICT PATH rule from system instructions
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
        let message = 'An unknown error occurred. Please try again.';
        
        // Detailed Firebase Auth Error Handling
        switch (error.code) {
            case 'auth/email-already-in-use':
                message = 'This email is already registered. Please sign in instead.'; // Primarily for signup
                break;
            case 'auth/invalid-email':
                message = 'Please enter a valid email address.';
                break;
            case 'auth/weak-password':
                message = 'Password should be at least 6 characters long.'; // Primarily for signup
                break;
            
            // --- LOGIN SPECIFIC ERRORS ---
            case 'auth/user-not-found':
                // Specific message for unregistered user trying to log in
                message = 'Email not registered. Please sign up to create an account.';
                break;
            case 'auth/wrong-password':
                // Specific message for correct email but incorrect password
                message = 'Incorrect password. Please try again.';
                break;
            case 'auth/invalid-credential':
                 // Modern Firebase error for combined bad email/password on login
                 message = 'Invalid credentials. Please check your email and password.';
                 break;
            // --- END LOGIN SPECIFIC ERRORS ---
            
            case 'auth/network-request-failed':
                message = 'Network error. Please check your internet connection.';
                break;
            case 'auth/requires-recent-login':
                message = 'Please sign out and sign back in to perform this action.';
                break;
            default:
                // Fallback for unexpected errors
                console.error('Unhandled Auth Error:', error.message);
                message = `Authentication failed: ${error.message.split('(')[0].trim() || 'Please try again.'}`;
                break;
        }
        
        showError(message);
    }

    async logout() {
        try {
            // Find the logout button if on app.html/index.html to apply loading state
            const logoutButton = document.querySelector('.menu-logout .btn-danger'); 
            // NOTE: Using raw text here for mobile visibility when spinner is active
            this.setButtonLoading(logoutButton, true, 'Signing Out');

            await auth.signOut();
            localStorage.removeItem('userData');
            showSuccess('Signed out successfully');
            setTimeout(() => {
                window.location.href = 'auth.html';
            }, 1000);
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
