import { getState, updateState } from './state.js';
import { navigateTo } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { generateVerificationCode, sendVerificationEmail } from './utils.js';
// At the top of auth.js, add:
const resetCodes = {};
// modules/auth.js
export async function login() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    // Validate inputs
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }
    if (!password) {
        alert('Please enter your password');
        return;
    }
    try {
        // Show loading indicator or disable button if needed
        const loginButton = document.querySelector('#loginModal button[type="submit"]');
        if (loginButton) {
            loginButton.textContent = 'Logging in...';
            loginButton.disabled = true;
        }
        // Call the authentication API
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, password }),
        });
        
        // Handle rate limit error (429)
        if (response.status === 429) {
            // Reset button state
            if (loginButton) {
                loginButton.textContent = 'Login';
                loginButton.disabled = false;
            }
            
            // Show friendly message
            alert('Too many login attempts. Please wait a moment before trying again or use the "Forgot Password" option.');
            return;
        }
        
        const data = await response.json();
        console.log('Login response:', data); // Log the response
        
        // Reset button state
        if (loginButton) {
            loginButton.textContent = 'Login';
            loginButton.disabled = false;
        }
        
        if (!response.ok) {
            // Handle authentication failure
            alert(data.message || 'Login failed. Please check your credentials.');
            return;
        }
        
        // Close all other modals
        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            if (modal.id !== 'verifyEmailModal') {
                modal.style.display = 'none';
            }
        });
        
        // Check if we have a message about verification code for extra security
        if (data.message && data.message.includes('verification code')) {
            // Store token temporarily (we'll use it after verification)
            sessionStorage.setItem('tempToken', data.token);
            sessionStorage.setItem('tempUser', JSON.stringify(data.user));
            
            // Show verification modal for the extra security check
            document.getElementById('verifyEmail').textContent = email;
            openModal('verifyEmailModal');
            
            // Instruct the user
            alert('For extra security, please enter the verification code sent to your email.');
            return;
        }
        
        // Validate token before storing
        if (!data.token || typeof data.token !== 'string' || data.token.length < 10) {
            console.error('Invalid token received:', data.token);
            throw new Error('Invalid token received from server');
        }
        
        // Store the token in localStorage
        localStorage.setItem('token', data.token);
        console.log('Token stored successfully');
        
        // Authentication successful
        // Store complete user data from the response
        const currentUser = {
            id: data.user.id || data.user._id, // Make sure to store the user ID from either format
            name: data.user.name || email.split('@')[0],
            email: data.user.email,
            subscription: data.user.subscription,
            emailNotifications: data.user.emailNotifications || false,
            smsNotifications: data.user.smsNotifications || false,
            phoneNumber: data.user.phoneNumber || ''
        };
       
        // Log the user details for debugging
        console.log('User info from login:', {
            id: data.user.id,
            _id: data.user._id,
            email: data.user.email
        });
       
        // Update state
        updateState({ currentUser });
       
        // Store in localStorage
        try {
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            console.log('User data stored successfully:', currentUser);
        } catch (e) {
            console.warn('Failed to store user in local storage', e);
        }
       
        // Update UI to reflect logged-in state
        checkLoggedInStatus();
       
        // Close login modal
        closeModal('loginModal');
       
        // Clear form fields
        document.getElementById('loginEmail').value = '';
        document.getElementById('loginPassword').value = '';
        
        // Verify token is stored before navigating
        const storedToken = localStorage.getItem('token');
        if (!storedToken) {
            throw new Error('Failed to store authentication token');
        }
        
        console.log('Token verified before navigation:', storedToken);
        
        // Add a small delay to ensure localStorage is updated
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Navigate to dashboard
        navigateTo('dashboard');
       
        alert(`Welcome back, ${currentUser.name}!`);
       
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed. Please try again.');
       
        // Reset button state if there was an error
        const loginButton = document.querySelector('#loginModal button[type="submit"]');
        if (loginButton) {
            loginButton.textContent = 'Login';
            loginButton.disabled = false;
        }
    }
}

// Check if user is logged in
export function checkLoggedInStatus() {
    // Check if there's a valid token
    const token = localStorage.getItem('token');
    
    
    // Get user from state
    let { currentUser } = getState();
    
    if (!currentUser) {
        try {
            const storedUser = localStorage.getItem('currentUser');
            if (storedUser) {
                currentUser = JSON.parse(storedUser);
                updateState({ currentUser });
            }
        } catch (e) {
            console.warn('Failed to retrieve user from local storage', e);
        }
    }
   
    // Only consider the user logged in if both token and user info exist
    if (token && currentUser) {
        document.getElementById('authButtons').style.display = 'none';
        document.getElementById('userInfo').style.display = 'flex';
        document.getElementById('userName').textContent = currentUser.name;
        document.getElementById('userAvatar').textContent = currentUser.name.charAt(0);
       
        // Load user settings
        document.getElementById('accountName').value = currentUser.name;
        document.getElementById('accountEmail').value = currentUser.email;
    } else {
        // If token is missing but user info exists, or vice versa, clear both for consistency
        if ((token && !currentUser) || (!token && currentUser)) {
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            updateState({ currentUser: null });
        }
        
        document.getElementById('authButtons').style.display = 'block';
        document.getElementById('userInfo').style.display = 'none';
    }
}

// In auth.js, modify the register function
export async function register() {
    const name = document.getElementById('registerName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    // Validate inputs
    if (!name || !email || !password || !confirmPassword) {
        alert('Please fill in all fields.');
        return;
    }

    if (password !== confirmPassword) {
        alert('Passwords do not match.');
        return;
    }

    // Add password validation
    if (password.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
    }
    
    if (!/\d/.test(password)) {
        alert('Password must contain at least one number.');
        return;
    }
    
    if (!/[A-Z]/.test(password)) {
        alert('Password must contain at least one uppercase letter.');
        return;
    }
    
    if (!/[a-z]/.test(password)) {
        alert('Password must contain at least one lowercase letter.');
        return;
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
        alert('Password must contain at least one special character.');
        return;
    }
    
    if (password.includes(' ')) {
        alert('Password cannot contain spaces.');
        return;
    }

    try {
        // Show some loading indicator
        const registerButton = document.querySelector('#registerModal button[type="submit"]');
        if (registerButton) {
            registerButton.textContent = 'Registering...';
            registerButton.disabled = true;
        }

        console.log('Attempting to connect to server at /api/auth/register');
        
        // Send registration data to the backend
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name, email, password }),
        });

        console.log('Server response received:', response.status);
        
        const data = await response.json();

        // Reset button state
        if (registerButton) {
            registerButton.textContent = 'Register';
            registerButton.disabled = false;
        }

        if (response.ok) {
            console.log('Registration successful');
            // Show verification modal
            openModal('verifyEmailModal');
            document.getElementById('verifyEmail').textContent = email;
        } else {
            console.error('Registration failed with status:', response.status);
            
            if (data.errors && Array.isArray(data.errors)) {
                // If server returns validation errors array
                const errorMessages = data.errors.map(err => err.msg).join('\n');
                alert(`Registration failed:\n${errorMessages}`);
            } else {
                // Single error message
                alert(data.message || 'Registration failed. Please try again.');
            }
        }
    } catch (error) {
        console.error('Registration error:', error);
        
        // Provide more details about the error
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            alert('Could not connect to the server. Please check if the backend is running.');
        } else {
            alert('Registration failed. Please try again.');
        }
        
        // Reset button state
        const registerButton = document.querySelector('#registerModal button[type="submit"]');
        if (registerButton) {
            registerButton.textContent = 'Register';
            registerButton.disabled = false;
        }
    }
}

// Add this function to your auth.js file
export async function initPasswordValidation() {
    const passwordInput = document.getElementById('registerPassword');
    const requirementsList = document.querySelector('.password-requirements ul');
    
    if (!passwordInput || !requirementsList) return;
    
    // Set up the validation checks
    const requirements = [
        { regex: /.{8,}/, index: 0, text: 'Be at least 8 characters long' },
        { regex: /[A-Z]/, index: 1, text: 'Include at least one uppercase letter' },
        { regex: /[a-z]/, index: 2, text: 'Include at least one lowercase letter' },
        { regex: /\d/, index: 3, text: 'Include at least one number' },
        { regex: /[!@#$%^&*(),.?":{}|<>]/, index: 4, text: 'Include at least one special character' },
        { regex: /^[^ ]*$/, index: 5, text: 'Not contain spaces' }
    ];
    
    // Create list items for requirements
    requirements.forEach(req => {
        const listItem = document.createElement('li');
        listItem.textContent = req.text;
        requirementsList.appendChild(listItem);
    });
    
    // Update validation status as user types
    passwordInput.addEventListener('input', function() {
        const password = this.value;
        const listItems = requirementsList.querySelectorAll('li');
        
        requirements.forEach(req => {
            const listItem = listItems[req.index];
            const isValid = req.regex.test(password);
            
            if (isValid) {
                listItem.style.color = 'green';
                listItem.style.fontWeight = 'bold';
            } else {
                listItem.style.color = 'red';
                listItem.style.fontWeight = 'normal';
            }
        });
    });
}

export async function verifyEmail() {
    const code = document.getElementById('verificationCode').value.trim();
    const email = document.getElementById('verifyEmail').textContent;

    if (!code || !/^\d{6}$/.test(code)) {
        alert('Please enter a valid 6-digit verification code.');
        return;
    }

    try {
        console.log('Verifying email:', email, 'Code:', code);
        
        // Disable the verify button to prevent duplicate submissions
        const verifyButton = document.getElementById('verifyEmailBtn');
        if (verifyButton) {
            verifyButton.textContent = 'Verifying...';
            verifyButton.disabled = true;
        }

        // Try to get the token from session storage first (for verification flow)
        // or from local storage as fallback
        let token = sessionStorage.getItem('tempToken') || localStorage.getItem('token');
        
        // Make the API call
        const response = await fetch('/api/auth/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token ? `Bearer ${token}` : ''
            },
            body: JSON.stringify({ 
                email, 
                code: parseInt(code), // Ensure code is sent as a number
            }),
        });

        const data = await response.json();
        
        // Reset button state
        if (verifyButton) {
            verifyButton.textContent = 'Verify';
            verifyButton.disabled = false;
        }
        
        console.log('Verification response:', data);

        if (!response.ok) {
            alert(data.message || 'Verification failed. Please try again.');
            return;
        }

        // Remove any temporary token
        sessionStorage.removeItem('tempToken');
        
        // Make sure the token is valid
        if (!data.token || typeof data.token !== 'string' || data.token.length < 10) {
            console.error('Invalid token received:', data.token);
            throw new Error('Invalid token received from server');
        }
        
        // Store the new token in localStorage
        localStorage.setItem('token', data.token);
        
        // Store complete user data from the response
        const currentUser = {
            id: data.user.id || data.user._id,
            name: data.user.name,
            email: data.user.email,
            subscription: data.user.subscription || { plan: 'free', active: true }
        };
        
        // Update application state
        updateState({ currentUser });
        
        // Store in localStorage for persistence
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        // Hide the verification modal
        closeModal('verifyEmailModal');
        
        // Clear any other modals that might be open
        document.querySelectorAll('.modal-backdrop').forEach(modal => {
            modal.style.display = 'none';
        });
        
        // Update UI to reflect logged-in state
        checkLoggedInStatus();

        // Clear the verification code field
        document.getElementById('verificationCode').value = '';
        
        // Navigate to dashboard
        setTimeout(() => {
            navigateTo('dashboard');
        }, 100);

        alert('Email verified successfully. Welcome to PingPulse!');
        
    } catch (error) {
        console.error('Verification error:', error);
        alert('Verification failed. Please try again later.');
        
        // Reset button state
        const verifyButton = document.getElementById('verifyEmailBtn');
        if (verifyButton) {
            verifyButton.textContent = 'Verify';
            verifyButton.disabled = false;
        }
    }
}

export async function forgotPassword() {
    const email = document.getElementById('forgotPasswordEmail').value.trim();
  
    if (!email || !email.includes('@')) {
      alert('Please enter a valid email address.');
      return;
    }
  
    try {
      // First check if this is a Google OAuth user
      const checkResponse = await fetch('/api/auth/check-user-type', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      
      const checkData = await checkResponse.json();
      
      // If user signed up with Google, show a special message
      if (checkResponse.ok && checkData.isGoogleUser) {
        closeModal('forgotPasswordModal');
        alert('This email is registered with Google Sign-In. Please use the "Sign in with Google" button on the login page instead of resetting your password.');
        return;
      }
  
      // Continue with regular password reset for non-Google users
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
  
      const data = await response.json();
      
      // Check if the response indicates this is a Google user (as a fallback)
      if (response.ok && data.isGoogleUser) {
        closeModal('forgotPasswordModal');
        alert('This email is registered with Google Sign-In. Please use the "Sign in with Google" button on the login page instead of resetting your password.');
        return;
      }
  
      if (response.ok) {
        alert('Password reset code sent to your email.');
        closeModal('forgotPasswordModal');
        openModal('resetPasswordModal'); // Open the reset password modal
        document.getElementById('resetPasswordEmail').value = email;
      } else {
        alert(data.message || 'Failed to send password reset code.');
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      alert('Failed to send password reset code.');
    }
}

export async function resetPassword() {
    const email = document.getElementById('resetPasswordEmail').value.trim();
    const code = document.getElementById('resetPasswordCode').value.trim();
    const newPassword = document.getElementById('newPasswordReset').value.trim();
    const confirmNewPassword = document.getElementById('confirmNewPassword').value.trim();

    if (!code || code.length !== 6) {
        alert('Please enter a valid 6-digit code.');
        return;
    }

    if (!newPassword) {
        alert('Please enter a new password.');
        return;
    }

    // Add password validation
    if (newPassword.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
    }
    
    if (!/\d/.test(newPassword)) {
        alert('Password must contain at least one number.');
        return;
    }
    
    if (!/[A-Z]/.test(newPassword)) {
        alert('Password must contain at least one uppercase letter.');
        return;
    }
    
    if (!/[a-z]/.test(newPassword)) {
        alert('Password must contain at least one lowercase letter.');
        return;
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
        alert('Password must contain at least one special character.');
        return;
    }
    
    if (newPassword.includes(' ')) {
        alert('Password cannot contain spaces.');
        return;
    }

    if (newPassword !== confirmNewPassword) {
        alert('Passwords do not match.');
        return;
    }

    try {
        // Check if this is a Google OAuth user first
        const checkResponse = await fetch('/api/auth/check-user-type', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });
        
        const checkData = await checkResponse.json();
        
        // If user signed up with Google, show a special message
        if (checkResponse.ok && checkData.isGoogleUser) {
            closeModal('resetPasswordModal');
            alert('This email is registered with Google Sign-In. Please use the "Sign in with Google" button on the login page instead of resetting your password.');
            return;
        }

        // Send a request to the backend to reset the password
        const response = await fetch('/api/auth/reset-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, code, newPassword }),
        });

        const data = await response.json();

        // Check if the response indicates this is a Google user (as a fallback)
        if (response.ok && data.isGoogleUser) {
            closeModal('resetPasswordModal');
            alert('This email is registered with Google Sign-In. Please use the "Sign in with Google" button on the login page instead of resetting your password.');
            return;
        }

        if (response.ok) {
            alert('Password reset successfully.');
            closeModal('resetPasswordModal');
            navigateTo('dashboard'); // Redirect to the login page
        } else {
            if (data.errors && Array.isArray(data.errors)) {
                // If server returns validation errors array
                const errorMessages = data.errors.map(err => err.msg).join('\n');
                alert(`Password reset failed:\n${errorMessages}`);
            } else {
                alert(data.message || 'Failed to reset password.');
            }
        }
    } catch (error) {
        console.error('Reset password error:', error);
        alert('Failed to reset password.');
    }
}

export async function resendVerificationCode() {
    const email = document.getElementById('verifyEmail').textContent;

    try {
        // Send a request to resend the verification code
        const response = await fetch('/api/auth/resend-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();

        if (response.ok) {
            alert('A new verification code has been sent to your email.');
        } else {
            alert(data.message || 'Failed to resend verification code. Please try again.');
        }
    } catch (error) {
        console.error('Error resending verification code:', error);
        alert('Failed to resend verification code. Please try again.');
    }
}

// Function to switch from login modal to register modal
export function switchToRegister() {
    closeModal('loginModal'); // Close the login modal
    openModal('registerModal'); // Open the register modal
}

// Function to switch from register modal to login modal
export function switchToLogin() {
    closeModal('registerModal'); // Close the register modal
    openModal('loginModal'); // Open the login modal
}

// Forgot password functions
export async function sendResetCode() {
    const email = document.getElementById('forgotPasswordEmail').value.trim();

    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }

    try {
        // Generate reset code1q    
        const resetCode = generateVerificationCode();
        resetCodes[email] = resetCode; // Store the code temporarily

        // Send reset code email
        await sendVerificationEmail(email, resetCode);

        // Show reset code modal
        openModal('resetPasswordModal');
        document.getElementById('resetEmail').textContent = email;

    } catch (error) {
        console.error('Error sending reset code:', error);
        alert('Failed to send reset code. Please try again.');
    }
}

// User settings functions
export function loadUserSettings() {
    const { currentUser } = getState();
    if (!currentUser) return;
    
    document.getElementById('accountName').value = currentUser.name || '';
    document.getElementById('accountEmail').value = currentUser.email || '';
    
    // For demo, we'll assume these are off by default
    document.getElementById('emailNotifications').checked = currentUser.emailNotifications || false;
    document.getElementById('smsNotifications').checked = currentUser.smsNotifications || false;
    document.getElementById('phoneNumber').value = currentUser.phoneNumber || '';
}


export function saveAccountSettings() {
    const { currentUser } = getState();
    if (!currentUser) {
        alert('You must be logged in to save settings');
        return;
    }
    
    // Get form values
    const name = document.getElementById('accountName').value.trim();
    const email = document.getElementById('accountEmail').value.trim();
    const emailNotifications = document.getElementById('emailNotifications').checked;
    const smsNotifications = document.getElementById('smsNotifications').checked;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    
    // Validate inputs
    if (!name) {
        alert('Please enter your name');
        return;
    }
    
    if (!email || !email.includes('@')) {
        alert('Please enter a valid email address');
        return;
    }
    
    if (smsNotifications && !phoneNumber) {
        alert('Please enter a phone number for SMS notifications');
        return;
    }
    
    // Update user
    const updatedUser = {
        ...currentUser,
        name,
        email,
        emailNotifications,
        smsNotifications,
        phoneNumber
    };
    
    // Update state
    updateState({ currentUser: updatedUser });
    
    // Update UI elements that display user info
    document.getElementById('userName').textContent = name;
    document.getElementById('userAvatar').textContent = name.charAt(0);
    
    // Show success message
    alert('Account settings saved successfully!');
}

export function saveNotificationSettings() {
    const { currentUser } = getState();
    if (!currentUser) {
        alert('You must be logged in to save settings');
        return;
    }
    
    // Get form values - update to use the actual elements that exist in the HTML
    const emailNotifications = document.getElementById('emailNotifications').checked;
    const smsNotifications = document.getElementById('smsNotifications').checked;
    const phoneNumber = document.getElementById('phoneNumber').value.trim();
    
    // Validate inputs for SMS
    if (smsNotifications && !phoneNumber) {
        alert('Please enter a phone number for SMS notifications');
        return;
    }
    
    // Update user
    const updatedUser = {
        ...currentUser,
        emailNotifications,
        smsNotifications,
        phoneNumber
    };
    
    // Update state
    updateState({ currentUser: updatedUser });
    
    // Show success message
    alert('Notification settings saved successfully!');
}

export function logout() {
    // Clear user data from state
    updateState({ currentUser: null });
    
    // Clear from localStorage
    localStorage.removeItem('currentUser');
    
    // Clear authentication token
    localStorage.removeItem('token');
    
    // Update UI
    checkLoggedInStatus();
    
    // Navigate to dashboard
    navigateTo('dashboard');
    
    // Close dropdown if open
    document.getElementById('userDropdown').style.display = 'none';
}

export async function changePassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    // Validate inputs
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please fill in all fields.');
        return;
    }

    if (newPassword !== confirmPassword) {
        alert('New passwords do not match.');
        return;
    }

    // Add password validation
    if (newPassword.length < 8) {
        alert('Password must be at least 8 characters long.');
        return;
    }
    
    if (!/\d/.test(newPassword)) {
        alert('Password must contain at least one number.');
        return;
    }
    
    if (!/[A-Z]/.test(newPassword)) {
        alert('Password must contain at least one uppercase letter.');
        return;
    }
    
    if (!/[a-z]/.test(newPassword)) {
        alert('Password must contain at least one lowercase letter.');
        return;
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
        alert('Password must contain at least one special character.');
        return;
    }
    
    if (newPassword.includes(' ')) {
        alert('Password cannot contain spaces.');
        return;
    }

    try {
        const response = await fetch('/api/auth/change-password', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (response.ok) {
            alert('Password changed successfully.');
            // Clear the password fields
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
        } else {
            alert(data.message || 'Failed to change password.');
        }
    } catch (error) {
        console.error('Change password error:', error);
        alert('Failed to change password.');
    }
}
