// app.js
import { login, register, verifyEmail, forgotPassword, resetPassword, logout, checkLoggedInStatus, saveAccountSettings, saveNotificationSettings, resendVerificationCode, switchToRegister, switchToLogin, initPasswordValidation, changePassword } from './modules/auth.js';
import { loadServices, addNewService, updateServiceList, openServiceDetails, saveServiceSettings, deleteService, confirmDeleteService, initializeHttpMethodSelector, updateServiceFormForSubscription, setupCustomHeadersManager } from './modules/services.js';
import { refreshDashboard, refreshServiceStatus, loadRecentLogs, loadServiceStatusList } from './modules/dashboard.js';
import { loadAllLogs, filterLogs, createLogItems, displayAuthError, loadServiceLogs } from './modules/logs.js';
import { getTimeAgo, generateVerificationCode, sendVerificationEmail, isLoggedIn, navigateTo, authenticatedFetch, isTokenValid } from './modules/utils.js';
import { openModal, closeModal, toggleDropdown } from './modules/modal.js';
import { initializeEventListeners, initializeServicesPage, initTabs, setActiveNavigation } from './modules/init.js';

// Export global variables
import { getState, updateState } from './modules/state.js';

// Initialize state
updateState({
    currentUser: null,
    currentPage: 'dashboard',
    serviceData: [],
    currentServiceId: null
});

// Attach functions to window object
window.navigateTo = navigateTo;
window.openModal = openModal;
window.closeModal = closeModal;
window.login = login;
window.register = register;
window.initPasswordValidation = initPasswordValidation;
window.logout = logout;
window.refreshServiceStatus = refreshServiceStatus;
window.loadRecentLogs = loadRecentLogs;
window.filterLogs = filterLogs;
window.createLogItems = createLogItems;
window.loadServiceLogs = loadServiceLogs;
window.displayAuthError = displayAuthError;
window.getTimeAgo = getTimeAgo;
window.generateVerificationCode = generateVerificationCode;
window.sendVerificationEmail = sendVerificationEmail;
window.isLoggedIn = isLoggedIn;
window.toggleDropdown = toggleDropdown;
window.loadServiceStatusList = loadServiceStatusList;
window.addNewService = addNewService;
window.updateServiceList = updateServiceList;
window.openServiceDetails = openServiceDetails;
window.saveServiceSettings = saveServiceSettings;
window.deleteService = deleteService;
window.confirmDeleteService = confirmDeleteService;
window.saveAccountSettings = saveAccountSettings;
window.saveNotificationSettings = saveNotificationSettings;
window.verifyEmail = verifyEmail;
window.resendVerificationCode = resendVerificationCode;
window.forgotPassword = forgotPassword;
window.resetPassword = resetPassword;
window.switchToRegister = switchToRegister;
window.switchToLogin = switchToLogin;
window.changePassword = changePassword;
window.togglePasswordVisibility = togglePasswordVisibility;

// Function to handle plan upgrades
async function upgradePlan(plan) {
    try {
        // In a production app, this would call the backend API
        // For testing purposes, we'll update the user data in localStorage
        const userData = localStorage.getItem('currentUser');
        if (userData) {
            const user = JSON.parse(userData);
            
            // Update subscription plan
            user.subscription = {
                ...user.subscription,
                plan: plan,
                active: true,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
            };
            
            // Save updated user data
            localStorage.setItem('currentUser', JSON.stringify(user));
            
            // Update the state
            const { currentUser } = getState();
            if (currentUser) {
                currentUser.subscription = user.subscription;
                updateState({ currentUser });
            }
            
            // Update UI
            updatePlanUI(plan);
            
            // Also try to call the backend API if it's available
            try {
                const response = await authenticatedFetch('/api/subscription/update', {
                    method: 'POST',
                    body: JSON.stringify({ plan })
                });
                
                console.log('Plan updated on server:', await response.json());
                
                // Sync with server after update to ensure everything is in sync
                await syncSubscriptionData();
            } catch (apiError) {
                console.log('Could not update plan on server (testing locally):', apiError);
            }
            
            alert(`Your plan has been updated to ${plan} for testing purposes. The page will now reload.`);
            
            // Refresh the page to see the changes
            window.location.reload();
        } else {
            alert('You must be logged in to upgrade your plan.');
        }
    } catch (error) {
        console.error('Error upgrading plan:', error);
        alert('Failed to upgrade plan. Please try again later.');
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('App initialized');
   
    // Hide all modals on page load
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.style.display = 'none';
    });

    // Initialize HTTP method selector and custom headers
    initializeHttpMethodSelector();
    setupCustomHeadersManager();
    
    // Set up password toggle buttons
    document.querySelectorAll('.password-toggle').forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            togglePasswordVisibility(targetId, this);
        });
    });
    
    // Set up navigation events
    document.getElementById('nav-plans')?.addEventListener('click', async (e) => {
        e.preventDefault();
        navigateTo('plans');
        
        // Sync subscription data with server when plans page is visited
        await syncSubscriptionData();
    });
    
    // Set up form submit event listeners
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', function(e) {
            e.preventDefault();
            login();
            return false;
        });
    }
    
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        registerForm.addEventListener('submit', function(e) {
            e.preventDefault();
            register();
            return false;
        });
    }
    
    const forgotPasswordForm = document.getElementById('forgotPasswordForm');
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            forgotPassword();
            return false;
        });
    }
    
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            resetPassword();
            return false;
        });
    }
    
    const changePasswordForm = document.getElementById('changePasswordForm');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', function(e) {
            e.preventDefault();
            changePassword();
            return false;
        });
    }
   
    // Simulate loading screen
    setTimeout(async () => {
        document.getElementById('loadingScreen').style.display = 'none';
        document.querySelector('.main-content').style.display = 'block';
       
        // Show first-time user modal or dashboard
        checkLoggedInStatus();
       
        // Load dashboard data if logged in, otherwise show login modal
        const token = localStorage.getItem('token');
        if (token && isTokenValid()) {
            // Sync subscription data with server
            syncSubscriptionData().then(() => {
                refreshDashboard();
                // Set up your refresh interval
                setInterval(refreshDashboard, 30000); // Every 30 seconds
                
                // Update service form based on subscription
                updateServiceFormForSubscription();
            });
        } else {
            // Instead of redirecting, show the login modal
            openModal('loginModal');
            
            // Skip trying to load protected data
            console.log('User not logged in, skipping dashboard data refresh');
        }
        
        await initializeServicesPage();
        // If current page is services, ensure we load services (only if logged in)
        const { currentPage } = getState();
        if (currentPage === 'services' && token && isTokenValid()) {
            console.log('Current page is services, loading services');
            loadServices();
        }
        
        // If current page is plans and user is logged in, sync subscription data
        if (currentPage === 'plans' && token && isTokenValid()) {
            console.log('Current page is plans, syncing subscription data');
            syncSubscriptionData();
        }
       
        // Set active navigation
        setActiveNavigation(currentPage);
    }, 1500);
   
    // Initialize tab switching
    initTabs();
   
    // Initialize event listeners
    initializeEventListeners();
});

// Auto-refresh functionality
let autoRefreshInterval;

function startAutoRefresh() {
    // Clear existing interval if any
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    // Set new interval
    autoRefreshInterval = setInterval(() => {
        const { currentPage } = getState();
        if (currentPage === 'dashboard') {
            refreshDashboard();
        } else if (currentPage === 'services') {
            loadServices();
        } else if (currentPage === 'logs') {
            loadAllLogs();
        }
    }, 60000); // Refresh every minute
}

// Start auto-refresh when the app loads
document.addEventListener('DOMContentLoaded', () => {
    startAutoRefresh();
});

// Function to toggle password visibility
function togglePasswordVisibility(inputId, button) {
    const passwordInput = document.getElementById(inputId);
    const icon = button.querySelector('i');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        icon.classList.remove('fa-eye');
        icon.classList.add('fa-eye-slash');
    } else {
        passwordInput.type = 'password';
        icon.classList.remove('fa-eye-slash');
        icon.classList.add('fa-eye');
    }
}

// Function to synchronize subscription data with server
async function syncSubscriptionData() {
    try {
        // Only attempt if user is logged in
        const token = localStorage.getItem('token');
        const userData = localStorage.getItem('currentUser');
        
        if (!token || !userData) {
            console.log('User not logged in, skipping subscription sync');
            return;
        }
        
        // Fetch current subscription from server
        const response = await authenticatedFetch('/api/subscription');
        if (!response.ok) {
            throw new Error('Failed to fetch subscription data');
        }
        
        const subscriptionData = await response.json();
        console.log('Fetched subscription data from server:', subscriptionData);
        
        // Update local storage with server data
        const user = JSON.parse(userData);
        user.subscription = subscriptionData;
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        // Update state
        const { currentUser } = getState();
        if (currentUser) {
            currentUser.subscription = subscriptionData;
            updateState({ currentUser });
        }
        
        console.log('Subscription data synchronized with server');
        
        // Update UI based on current plan
        updatePlanUI(subscriptionData.plan);
    } catch (error) {
        console.error('Error syncing subscription data:', error);
    }
}

// Function to update plan UI based on current plan
function updatePlanUI(currentPlan) {
    // Reset all plan buttons
    document.querySelectorAll('.plan-card .btn').forEach(button => {
        if (button.id === 'currentPlanBtn') {
            button.style.display = 'none';
        } else {
            button.style.display = 'block';
        }
    });
    
    // Update the current plan button
    const planCards = document.querySelectorAll('.plan-card');
    planCards.forEach(card => {
        const planTitle = card.querySelector('.plan-title').textContent.toLowerCase();
        const upgradeBtn = card.querySelector('.btn-primary');
        const currentBtn = card.querySelector('.btn-outline');
        
        if (planTitle === currentPlan) {
            // This is the current plan
            if (upgradeBtn) upgradeBtn.style.display = 'none';
            if (currentBtn) currentBtn.style.display = 'block';
        } else {
            // This is not the current plan
            if (upgradeBtn) upgradeBtn.style.display = 'block';
            if (currentBtn) currentBtn.style.display = 'none';
        }
    });
}