// Parse URL parameters
function getUrlParams() {
    const params = {};
    const queryString = window.location.search;
    const urlParams = new URLSearchParams(queryString);
    
    for (const [key, value] of urlParams) {
        params[key] = value;
    }
    return params;
}

// Sanitize text to prevent XSS
function sanitizeText(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show status message
function showStatus(message) {
    const sanitizedMessage = sanitizeText(message);
    document.getElementById('statusMessage').textContent = sanitizedMessage;
    console.log('Status updated:', sanitizedMessage);
}

// Show modal
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'flex';
        console.log('Modal opened:', modalId);
    } else {
        console.error('Modal not found:', modalId);
    }
}

// Close modal
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log('Modal closed:', modalId);
    }
}

// Handle verification code submission
async function verifyEmail() {
    const code = document.getElementById('verificationCode').value.trim();
    const email = document.getElementById('verifyEmail').textContent;

    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        alert('Please enter a valid 6-digit code.');
        return;
    }

    try {
        console.log('Submitting verification code:', code, 'for email:', email);
        // Disable the verify button
        const verifyButton = document.getElementById('verifyEmailBtn');
        if (verifyButton) {
            verifyButton.textContent = 'Verifying...';
            verifyButton.disabled = true;
        }

        // Send verification code to the backend
        const response = await fetch('/api/auth/verify-login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                email: email, 
                code: parseInt(code, 10) // Ensure code is sent as a number with proper radix
            }),
        });

        const data = await response.json();
        console.log('Verification response:', data);

        if (response.ok) {
            // Store the token in localStorage
            if (!data.token || typeof data.token !== 'string' || data.token.length < 10) {
                console.error('Invalid token received:', data.token);
                throw new Error('Invalid token received from server');
            }
            
            localStorage.setItem('token', data.token);
            console.log('Token stored in localStorage');
            
            // Store user data
            const currentUser = {
                id: data.user.id || data.user._id,
                name: data.user.name,
                email: data.user.email,
                subscription: data.user.subscription || { plan: 'free', active: true }
            };
            
            localStorage.setItem('currentUser', JSON.stringify(currentUser));
            console.log('User data stored in localStorage');
            
            // Success message
            showStatus('Verification successful! Redirecting to dashboard...');
            
            // Redirect to dashboard
            setTimeout(() => {
                window.location.href = '/';
            }, 1000);
            
        } else {
            showStatus('Verification failed. Please try again.');
            alert(data.message || 'Invalid verification code. Please try again.');
        }
    } catch (error) {
        console.error('Verification error:', error);
        showStatus('Verification failed. Please try again.');
        alert('Verification failed. Please try again.');
    } finally {
        // Re-enable button
        const verifyButton = document.getElementById('verifyEmailBtn');
        if (verifyButton) {
            verifyButton.textContent = 'Verify';
            verifyButton.disabled = false;
        }
    }
}

// Handle resend verification code
async function resendVerificationCode() {
    const email = document.getElementById('verifyEmail').textContent;
    
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        alert('Invalid email address.');
        return;
    }

    try {
        console.log('Resending verification code for:', email);
        showStatus('Resending verification code...');
        
        // Send request to resend code
        const response = await fetch('/api/auth/resend-code', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();
        console.log('Resend response:', data);

        if (response.ok) {
            showStatus('A new verification code has been sent to your email.');
            alert('A new verification code has been sent to your email.');
        } else {
            showStatus('Failed to resend verification code.');
            alert(data.message || 'Failed to resend verification code.');
        }
    } catch (error) {
        console.error('Error resending code:', error);
        showStatus('Failed to resend verification code.');
        alert('Failed to resend verification code.');
    }
}

// Initialize the page
document.addEventListener('DOMContentLoaded', function() {
    console.log('Page loaded, initializing...');
    const params = getUrlParams();
    console.log('URL parameters:', params);
    
    // Check for error parameters
    if (params.error) {
        showStatus(`Authentication error: ${sanitizeText(params.error)}`);
        return;
    }
    
    // Check if we have required parameters
    if (!params.token || !params.email || !params.name) {
        showStatus('Missing authentication data. Please try again.');
        return;
    }
    
    // Store token temporarily for verification
    sessionStorage.setItem('tempToken', params.token);
    console.log('Token stored in session storage');
    
    // If verification is required, show the verification modal
    if (params.verification === 'required') {
        console.log('Verification required, showing modal');
        // Set up the verification modal with sanitized email
        document.getElementById('verifyEmail').textContent = sanitizeText(params.email);
        
        // Add event listeners
        document.getElementById('verifyEmailBtn').addEventListener('click', verifyEmail);
        document.getElementById('resendVerificationCodeBtn').addEventListener('click', resendVerificationCode);
        document.getElementById('verifyEmailModalClose').addEventListener('click', function() {
            closeModal('verifyEmailModal');
            window.location.href = '/'; // Redirect to home if user closes modal
        });
        
        // Show message based on whether this is a new user or existing user
        let statusMessage = '';
        if (params.message) {
            // Use custom message if provided - decode and sanitize
            statusMessage = sanitizeText(decodeURIComponent(params.message));
        } else if (params.new_user === 'true') {
            statusMessage = 'Please verify your email to complete registration.';
        } else {
            statusMessage = 'For extra security, please verify your email to continue.';
        }
        
        // Update status message
        showStatus(statusMessage);
        
        // Show verification modal with a slight delay
        setTimeout(() => {
            try {
                openModal('verifyEmailModal');
            } catch (error) {
                console.error('Error opening modal:', error);
                // Fallback - if modal fails to open, redirect to home
                alert('Please check your email for a verification code and try logging in again.');
                window.location.href = '/';
            }
        }, 500); // Slight delay to ensure DOM is ready
    } else {
        // If no verification needed (shouldn't happen with your requirements)
        showStatus('Authentication successful! Redirecting...');
        setTimeout(() => {
            window.location.href = '/';
        }, 1000);
    }
}); 