// modules/init.js
import { loadServices } from './services.js';
import { navigateTo } from './utils.js';
import { filterLogs } from './logs.js';
import { getState } from './state.js';
import { 
    login, 
    register, 
    verifyEmail, 
    forgotPassword, 
    resetPassword, 
    logout, 
    switchToRegister, 
    switchToLogin,
    saveAccountSettings,
    saveNotificationSettings,
    changePassword
} from './auth.js';
import { 
    addNewService, 
    saveServiceSettings, 
    deleteService, 
    confirmDeleteService,
    openServiceDetails
} from './services.js';

// Initialize event listeners
export function initializeEventListeners() {
    // Close modals when clicking outside
    document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.addEventListener('click', function(event) {
            if (event.target === this) {
                this.style.display = 'none';
            }
        });
    });
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(event) {
        const dropdown = document.getElementById('userDropdown');
        const userInfo = document.getElementById('userInfo');
        
        if (dropdown && userInfo && dropdown.style.display === 'block' && 
            !userInfo.contains(event.target) && 
            !dropdown.contains(event.target)) {
            dropdown.style.display = 'none';
        }
    });
    
    // Navigation
    document.getElementById('logoLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('dashboard');
    });
    
    document.getElementById('nav-dashboard')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('dashboard');
    });
    
    document.getElementById('nav-services')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('services');
    });
    
    document.getElementById('nav-logs')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('logs');
    });
    
    document.getElementById('nav-plans')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('plans');
    });
    
    document.getElementById('nav-settings')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('settings');
    });
    
    // Auth buttons
    document.getElementById('loginButton')?.addEventListener('click', () => openModal('loginModal'));
    
    // Dashboard buttons
    document.getElementById('viewAllLogsBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('logs');
    });
    
    document.getElementById('addServiceBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('services');
    });
    
    // Login modal
    document.getElementById('loginModalClose')?.addEventListener('click', () => closeModal('loginModal'));
    document.getElementById('loginCancelBtn')?.addEventListener('click', () => closeModal('loginModal'));
    document.getElementById('loginSubmitBtn')?.addEventListener('click', login);
    document.getElementById('switchToRegisterBtn')?.addEventListener('click', switchToRegister);
    document.getElementById('forgotPasswordLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        openModal('forgotPasswordModal');
        closeModal('loginModal');
    });
    
    // Register modal
    document.getElementById('registerModalClose')?.addEventListener('click', () => closeModal('registerModal'));
    document.getElementById('registerCancelBtn')?.addEventListener('click', () => closeModal('registerModal'));
    document.getElementById('registerSubmitBtn')?.addEventListener('click', register);
    document.getElementById('switchToLoginBtn')?.addEventListener('click', switchToLogin);
    
    // Services
    document.getElementById('addNewServiceBtn')?.addEventListener('click', addNewService);
    document.getElementById('refreshServicesBtn')?.addEventListener('click', loadServices);
    
    // Settings
    document.getElementById('saveAccountSettingsBtn')?.addEventListener('click', saveAccountSettings);
    document.getElementById('saveNotificationSettingsBtn')?.addEventListener('click', saveNotificationSettings);
    document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword);
    
    // Service details modal
    document.getElementById('serviceDetailsModalClose')?.addEventListener('click', () => closeModal('serviceDetailsModal'));
    document.getElementById('saveServiceSettingsBtn')?.addEventListener('click', saveServiceSettings);
    document.getElementById('deleteServiceBtn')?.addEventListener('click', () => {
        const { currentServiceId } = getState();
        if (currentServiceId) {
            confirmDeleteService(currentServiceId);
        } else {
            console.error('No service selected for deletion');
            alert('Please select a service to delete');
        }
    });
    
    // Confirm delete modal
    document.getElementById('confirmDeleteModalClose')?.addEventListener('click', () => closeModal('confirmDeleteModal'));
    document.getElementById('cancelDeleteBtn')?.addEventListener('click', () => closeModal('confirmDeleteModal'));
    document.getElementById('confirmDeleteBtn')?.addEventListener('click', () => {
        const { currentServiceId } = getState();
        if (currentServiceId) {
            deleteService(currentServiceId);
        } else {
            console.error('No service selected for deletion');
            alert('Please select a service to delete');
        }
    });
    
    // Verify email modal
    document.getElementById('verifyEmailModalClose')?.addEventListener('click', () => closeModal('verifyEmailModal'));
    document.getElementById('verifyEmailBtn')?.addEventListener('click', verifyEmail);
    document.getElementById('resendVerificationCodeBtn')?.addEventListener('click', resendVerificationCode);
    
    // Forgot password modal
    document.getElementById('forgotPasswordModalClose')?.addEventListener('click', () => closeModal('forgotPasswordModal'));
    document.getElementById('forgotPasswordSubmitBtn')?.addEventListener('click', forgotPassword);
    document.getElementById('switchToLoginLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeModal('forgotPasswordModal');
        openModal('loginModal');
    });
    
    // Reset password modal
    document.getElementById('resetPasswordModalClose')?.addEventListener('click', () => closeModal('resetPasswordModal'));
    document.getElementById('resetPasswordSubmitBtn')?.addEventListener('click', resetPassword);
    document.getElementById('resendResetCodeBtn')?.addEventListener('click', forgotPassword);
    
    // Plans
    document.getElementById('upgradeBasicBtn')?.addEventListener('click', () => upgradePlan('basic'));
    document.getElementById('upgradePremiumBtn')?.addEventListener('click', () => upgradePlan('premium'));
    
    // User dropdown
    document.getElementById('userDropdownToggle')?.addEventListener('click', toggleDropdown);
    document.getElementById('settingsLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('userDropdown').style.display = 'none';
        navigateTo('settings');
    });
    document.getElementById('logoutLink')?.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('userDropdown').style.display = 'none';
        logout();
    });
    
    // Service filter
    const serviceFilter = document.getElementById('serviceFilter');
    if (serviceFilter) {
        serviceFilter.addEventListener('change', function() {
            filterLogs(this.value);
        });
    }
    
    // Service search
    const serviceSearch = document.getElementById('serviceSearch');
    if (serviceSearch) {
        serviceSearch.addEventListener('input', function() {
            filterServices(this.value);
        });
    }
}

export async function initializeServicesPage() {
    const servicesPage = document.getElementById('services-page');
    if (!servicesPage) {
        console.log('Services page element not found');
        return;
    }
    
    console.log('Initializing services page');
    
    // Initialize monitor type handling
    try {
        const { initializeMonitorTypeHandling } = await import('./services.js');
        initializeMonitorTypeHandling();
        console.log('Monitor type handling initialized');
    } catch (error) {
        console.error('Failed to initialize monitor type handling:', error);
    }
    
    // Load services when the page is visible
    if (window.getComputedStyle(servicesPage).display !== 'none') {
        console.log('Services page is visible, loading services');
        loadServices();
    }
}

export function initTabs() {
    // Content tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabGroup = this.parentElement;
            if (!tabGroup) return;
            
            const tabId = this.getAttribute('data-tab');
            
            // Remove active class from all tabs in this group
            tabGroup.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
            });
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Hide all tab content related to this tab group
            const tabContainer = tabGroup.closest('.card-body');
            if (tabContainer) {
                tabContainer.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                
                // Show selected tab content
                const selectedContent = document.getElementById(tabId);
                if (selectedContent) {
                    selectedContent.classList.add('active');
                }
            }
        });
    });
    
    // Modal tabs
    document.querySelectorAll('[data-modal-tab]').forEach(tab => {
        tab.addEventListener('click', function() {
            const tabGroup = this.parentElement;
            if (!tabGroup) return;
            
            const tabId = this.getAttribute('data-modal-tab');
            
            // Remove active class from all tabs in this group
            tabGroup.querySelectorAll('.tab').forEach(t => {
                t.classList.remove('active');
            });
            
            // Add active class to clicked tab
            this.classList.add('active');
            
            // Hide all tab content in the modal
            const modal = tabGroup.closest('.modal');
            if (modal) {
                modal.querySelectorAll('.tab-content').forEach(content => {
                    content.classList.remove('active');
                });
                
                // Show selected tab content
                const selectedContent = document.getElementById(tabId);
                if (selectedContent) {
                    selectedContent.classList.add('active');
                    
                    // Important: If switching to logs tabs, ensure logs are displayed
                    if (tabId === 'all-logs' || tabId === 'error-logs') {
                        // Get current service filter value
                        const serviceFilter = document.getElementById('serviceFilter');
                        const serviceId = serviceFilter ? serviceFilter.value : 'all';
                        
                        // Re-apply the filter to refresh the logs
                        console.log('Tab changed, re-applying filter:', serviceId);
                        filterLogs(serviceId);
                    }
                }
            }
        });
    });
}

// Set active navigation link
export function setActiveNavigation(page) {
    // Remove active class from all navigation links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.remove('active');
    });
    
    // Add active class to current page link
    const activeLink = document.getElementById(`nav-${page}`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
}

// Setup service filter in logs page
export function setupServiceFilter() {
    const serviceFilter = document.getElementById('serviceFilter');
    if (serviceFilter) {
        // Remove any existing listeners first to prevent duplicates
        const newFilter = serviceFilter.cloneNode(true);
        serviceFilter.parentNode.replaceChild(newFilter, serviceFilter);
        
        newFilter.addEventListener('change', function() {
            console.log('Service filter changed to:', this.value);
            filterLogs(this.value);
        });
    } else {
        console.error('Service filter element not found');
    }
}

// Implementation for filterServices(searchTerm)
function filterServices(searchTerm) {
    console.log('Filtering services with search term:', searchTerm);
    
    const servicesContainer = document.getElementById('servicesList');
    if (!servicesContainer) {
        console.error('Services container not found');
        return;
    }
    
    const { serviceData } = getState();
    
    if (!serviceData || !Array.isArray(serviceData)) {
        console.error('No service data available for filtering');
        return;
    }
    
    // Get all service elements
    const serviceElements = servicesContainer.querySelectorAll('.service-item');
    
    // Convert search term to lowercase for case-insensitive comparison
    const term = searchTerm.toLowerCase().trim();
    
    // If search term is empty, show all services
    if (!term) {
        serviceElements.forEach(element => {
            element.style.display = 'flex';
        });
        return;
    }
    
    // Filter services by name or URL
    serviceElements.forEach(element => {
        const serviceName = element.querySelector('.service-name')?.textContent.toLowerCase() || '';
        const serviceUrl = element.querySelector('.service-url')?.textContent.toLowerCase() || '';
        
        // Show service if name or URL contains the search term
        if (serviceName.includes(term) || serviceUrl.includes(term)) {
            element.style.display = 'flex';
        } else {
            element.style.display = 'none';
        }
    });
    
    // Check if any services are visible
    const visibleServices = Array.from(serviceElements).filter(
        element => element.style.display !== 'none'
    );
    
    // Display a message if no services match the search
    if (visibleServices.length === 0) {
        const noResultsElement = document.createElement('div');
        noResultsElement.className = 'no-results';
        noResultsElement.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i> No services match the search term "${searchTerm}".
            </div>
        `;
        
        // Remove any existing no-results message
        const existingNoResults = servicesContainer.querySelector('.no-results');
        if (existingNoResults) {
            servicesContainer.removeChild(existingNoResults);
        }
        
        servicesContainer.appendChild(noResultsElement);
    } else {
        // Remove the no-results message if it exists
        const existingNoResults = servicesContainer.querySelector('.no-results');
        if (existingNoResults) {
            servicesContainer.removeChild(existingNoResults);
        }
    }
}

// Upgrade plan function
function upgradePlan(plan) {
    alert(`Upgrading to ${plan} plan! This is just a demo. In a real application, this would redirect to a payment page.`);
    // In a real app, this would call your backend API
    
    // For testing purposes, we'll update the user's plan in localStorage
    try {
        // Get current user data
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
            
            // Call the backend API
            (async () => {
                try {
                    const token = localStorage.getItem('token');
                    if (!token) {
                        throw new Error('No authentication token found');
                    }
                    
                    const response = await fetch('/api/subscription/update', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({ plan })
                    });
                    
                    if (!response.ok) {
                        throw new Error('Failed to update subscription on server');
                    }
                    
                    console.log('Plan updated on server:', await response.json());
                } catch (apiError) {
                    console.error('Could not update plan on server:', apiError);
                }
            })();
            
            alert(`Your plan has been updated to ${plan} for testing purposes. Refresh the page to see the changes.`);
            
            // Refresh the page to see the changes
            window.location.reload();
        } else {
            alert('You must be logged in to upgrade your plan.');
        }
    } catch (error) {
        console.error('Error updating plan:', error);
        alert('Failed to update plan. Please try again.');
    }
}