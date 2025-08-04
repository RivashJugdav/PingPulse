import { loadServices } from './services.js';
import { refreshDashboard } from './dashboard.js';
import { setActiveNavigation } from './init.js';
import { updateState } from './state.js'; // Remove getState since it's not used here
import { initLogs } from './logs.js';

// modules/utils.js

export function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffDay > 0) {
        return diffDay === 1 ? '1 day ago' : `${diffDay} days ago`;
    }
    
    if (diffHour > 0) {
        return diffHour === 1 ? '1 hour ago' : `${diffHour} hours ago`;
    }
    
    if (diffMin > 0) {
        return diffMin === 1 ? '1 minute ago' : `${diffMin} minutes ago`;
    }
    
    return diffSec <= 5 ? 'just now' : `${diffSec} seconds ago`;
}

export function generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000); // 6-digit code
}

// Function to send verification email (mock implementation)
export async function sendVerificationEmail(email, code) {
    // In a real application, you would send an email using a service like Nodemailer
    console.log(`Sending verification code ${code} to ${email}`);
    // Simulate email sending delay
    return new Promise(resolve => setTimeout(resolve, 1000));
}

export function isLoggedIn() {
    return localStorage.getItem('token') !== null;
}

// Add this function to your JavaScript file
export function navigateTo(page) {
    console.log('Navigating to:', page);
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
        p.style.display = 'none';
    });
    
    // Show requested page - notice the hyphen in the ID
    const pageElement = document.getElementById(`${page}-page`);
    if (pageElement) {
        pageElement.style.display = 'block';
        
        // Update state
        updateState({ currentPage: page });
        
        // Load page-specific data
        if (page === 'services') {
            console.log('Navigated to services page, loading services...');
            loadServices();
        } else if (page === 'dashboard') {
            // Add a small delay to ensure token is available
            setTimeout(() => {
                console.log('Loading dashboard data...');
                refreshDashboard();
            }, 100);
        } else if (page === 'logs') {
            // Add this line to initialize logs when navigating to logs page
            console.log('Navigated to logs page, initializing logs...');
            initLogs(); // You'll need to import this function
        }
        
        // Update active navigation
        setActiveNavigation(page);
    } else {
        console.error(`Page element not found: ${page}-page`);
    }
}

/**
 * Utility function to make authenticated API requests
 * @param {string} url - The API endpoint URL
 * @param {Object} options - Fetch options
 * @returns {Promise} - The API response
 */
export async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    
    if (!token) {
        console.error('No authentication token found');
        throw new Error('No authentication token found');
    }

    // Merge headers with Authorization header
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options.headers
    };

    try {
        console.log('Making authenticated request to:', url);
        const response = await fetch(url, {
            ...options,
            headers
        });

        // Handle token expiration
        if (response.status === 401) {
            console.error('Token expired or invalid');
            // Clear token and user data
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            
            // Redirect to login
            window.location.href = '/';
            throw new Error('Session expired. Please login again.');
        }

        if (!response.ok) {
            console.error('API request failed:', response.status, response.statusText);
            throw new Error(`API request failed: ${response.statusText}`);
        }

        return response;
    } catch (error) {
        console.error('API request error:', error);
        throw error;
    }
}

/**
 * Check if the current token is valid
 * @returns {boolean} - Whether the token is valid
 */
export function isTokenValid() {
    const token = localStorage.getItem('token');
    if (!token) return false;

    try {
        // Check if token is expired
        const payload = JSON.parse(atob(token.split('.')[1]));
        const expiration = payload.exp * 1000; // Convert to milliseconds
        return Date.now() < expiration;
    } catch (error) {
        console.error('Error checking token validity:', error);
        return false;
    }
}