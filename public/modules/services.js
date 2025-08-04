// modules/services.js
import { isLoggedIn, getTimeAgo } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { refreshDashboard } from './dashboard.js';
import { updateServiceFilter } from './logs.js';
import { getState, updateState } from './state.js';

// Add these global tracking variables at the top of the file after imports
const deletedServiceIds = new Set();
let deletionInProgress = false;

// Add a helper function to determine if we're in production mode
function isProduction() {
    return window.location.hostname !== 'localhost' && 
           !window.location.hostname.includes('127.0.0.1') &&
           !window.location.hostname.includes('.local');
}

// Add a safe console logger that suppresses errors in production
function safeConsoleLog(level, ...args) {
    if (isProduction() && (level === 'error' || level === 'warn')) {
        // In production, don't log errors/warnings to console
        // Instead, you could send them to a logging service here
        return;
    }
    
    if (level === 'error') {
        console.error(...args);
    } else if (level === 'warn') {
        console.warn(...args);
    } else {
        console.log(...args);
    }
}

// Utility function for authenticated API calls
async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('Authentication token not found');
    }

    return fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
}

// modules/services.js
export async function loadServices() {
    console.log('loadServices called at', new Date().toISOString());
    
    // Check if the user is logged in
    if (!isLoggedIn()) {
        console.log('User not logged in, not loading services');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        console.log('Token exists:', !!token);
        
        console.log('Fetching services from /api/ping-services');
        const response = await fetch('/api/ping-services', {
            method: 'GET',
            headers: {
                'Authorization': 'Bearer ' + token,
            },
        });

        console.log('Response status:', response.status);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Error data:', errorData);
            throw new Error(errorData.message || 'Failed to fetch services');
        }

        const services = await response.json();
        console.log('Services loaded:', services.length ? services.length + ' services' : 'No services');
        
        // Update state instead of using global variable
        updateState({ serviceData: services });

        // Update the UI with the received services
        updateServiceList(services);
    } catch (error) {
        console.error('Error loading services:', error);
        console.error('Error details:', error.stack);
        
        // Don't show an alert for network errors if we're not on the services page
        const servicesPage = document.getElementById('services-page');
        if (servicesPage && window.getComputedStyle(servicesPage).display !== 'none') {
            alert('Failed to load services. Please try again.');
        }
    }
}

// Add this function to handle HTTP method changes
export function initializeHttpMethodSelector() {
    const methodSelector = document.getElementById('requestMethod');
    const postBodyContainer = document.getElementById('postBodyContainer');
    
    if (methodSelector) {
        methodSelector.addEventListener('change', function() {
            // Show/hide post body based on selected method
            if (this.value === 'POST') {
                postBodyContainer.style.display = 'block';
            } else {
                postBodyContainer.style.display = 'none';
            }
        });
    }
}

// Add this function to update the UI based on subscription plan
export function updateServiceFormForSubscription() {
    try {
        const userData = localStorage.getItem('currentUser');
        if (!userData) return;
        
        const user = JSON.parse(userData);
        const plan = user.subscription?.plan || 'free';
        
        // Get form elements
        const methodSelector = document.getElementById('requestMethod');
        const headerLimitText = document.getElementById('headerLimitText');
        const addHeaderBtn = document.getElementById('addHeaderBtn');
        const validateResponseContainer = document.getElementById('validateResponseContainer');
        
        // Reset any existing settings
        if (methodSelector) {
            // Enable all options first
            Array.from(methodSelector.options).forEach(option => {
                option.disabled = false;
            });
            
            // Disable based on plan
            if (plan === 'free') {
                // Free: Only GET allowed
                Array.from(methodSelector.options).forEach(option => {
                    if (option.value !== 'GET') {
                        option.disabled = true;
                    }
                });
                // Set to GET
                methodSelector.value = 'GET';
            } else if (plan === 'basic') {
                // Basic: GET and HEAD allowed
                Array.from(methodSelector.options).forEach(option => {
                    if (option.value === 'POST') {
                        option.disabled = true;
                    }
                });
            }
            // Premium: All methods allowed (no need to disable any)
        }
        
        // Update custom headers section
        if (headerLimitText && addHeaderBtn) {
            if (plan === 'free') {
                headerLimitText.textContent = 'Free plan does not support custom headers';
                addHeaderBtn.style.display = 'none';
            } else if (plan === 'basic') {
                headerLimitText.textContent = 'Basic plan allows up to 3 custom headers';
                addHeaderBtn.style.display = 'block';
            } else if (plan === 'premium') {
                headerLimitText.textContent = 'Premium plan allows up to 10 custom headers';
                addHeaderBtn.style.display = 'block';
            }
        }
        
        // Update response validation section (Premium only)
        if (validateResponseContainer) {
            if (plan === 'premium') {
                validateResponseContainer.style.display = 'block';
            } else {
                validateResponseContainer.style.display = 'none';
            }
        }
        
        console.log(`Service form updated for ${plan} subscription`);
    } catch (error) {
        console.error('Error updating service form for subscription:', error);
    }
}

// Add this function to handle custom headers
export function setupCustomHeadersManager() {
    const addHeaderBtn = document.getElementById('addHeaderBtn');
    const customHeadersContainer = document.getElementById('customHeadersContainer');
    
    if (!addHeaderBtn || !customHeadersContainer) return;
    
    // Add header button click handler
    addHeaderBtn.addEventListener('click', () => {
        const userData = localStorage.getItem('currentUser');
        if (!userData) return;
        
        const user = JSON.parse(userData);
        const plan = user.subscription?.plan || 'free';
        
        // Count existing headers
        const headerRows = customHeadersContainer.querySelectorAll('.custom-header-row:not([style*="display: none"])');
        
        // Check header limits based on plan
        const maxHeaders = plan === 'premium' ? 10 : plan === 'basic' ? 3 : 0;
        
        if (headerRows.length >= maxHeaders) {
            alert(`Your ${plan} plan allows a maximum of ${maxHeaders} custom headers.`);
            return;
        }
        
        // Create new header row
        const headerRow = document.createElement('div');
        headerRow.className = 'custom-header-row';
        headerRow.innerHTML = `
            <input type="text" class="form-control header-name" placeholder="Header Name">
            <input type="text" class="form-control header-value" placeholder="Header Value">
            <button type="button" class="btn btn-sm btn-danger remove-header">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Add remove button event listener
        const removeBtn = headerRow.querySelector('.remove-header');
        removeBtn.addEventListener('click', () => {
            headerRow.remove();
        });
        
        // Add to container
        customHeadersContainer.appendChild(headerRow);
    });
}

export function initializeMonitorTypeHandling() {
    const monitorTypeSelect = document.getElementById('monitorType');
    if (!monitorTypeSelect) return;
    
    monitorTypeSelect.addEventListener('change', function() {
        const monitorType = this.value;
        
        // Hide all specific fields first
        const httpFields = document.querySelectorAll('.http-specific-fields');
        const tcpFields = document.querySelectorAll('.tcp-specific-fields');
        const pingFields = document.querySelectorAll('.ping-specific-fields');
        
        httpFields.forEach(field => field.style.display = 'none');
        tcpFields.forEach(field => field.style.display = 'none');
        pingFields.forEach(field => field.style.display = 'none');
        
        // Show fields specific to the selected monitor type
        switch(monitorType) {
            case 'http':
                httpFields.forEach(field => field.style.display = '');
                break;
            case 'tcp':
                tcpFields.forEach(field => field.style.display = '');
                break;
            case 'ping':
                pingFields.forEach(field => field.style.display = '');
                break;
        }
    });
    
    // Trigger change event on page load to set initial state
    monitorTypeSelect.dispatchEvent(new Event('change'));
}

// Modify the existing addNewService function
export async function addNewService() {
        const nameInput = document.getElementById('serviceName');
        const urlInput = document.getElementById('serviceUrl');
        const intervalInput = document.getElementById('pingInterval');
    const monitorTypeInput = document.getElementById('monitorType');
    
    // HTTP specific fields
    const methodInput = document.getElementById('requestMethod');
    const postBodyInput = document.getElementById('postBody');
    const validateResponseInput = document.getElementById('validateResponse');
    const validationRuleInput = document.getElementById('validationRule');
    const validationValueInput = document.getElementById('validationValue');
    
    // TCP and Ping specific fields
    const portNumberInput = document.getElementById('portNumber');
    const packetCountInput = document.getElementById('packetCount');
    const timeoutSecondsInput = document.getElementById('timeoutSeconds');
    
    // Get values
    const name = nameInput?.value.trim();
    const url = urlInput?.value.trim();
    const interval = intervalInput?.value ? parseInt(intervalInput.value, 10) : '';
    const monitorType = monitorTypeInput?.value || 'http';
    
    // Get specific values based on monitor type
    let method, postBody, validateResponse, responseValidationRule, responseValidationValue;
    let port, packetCount, timeoutSeconds;
    
    if (monitorType === 'http') {
        method = methodInput?.value || 'GET';
        postBody = postBodyInput?.value.trim();
        validateResponse = validateResponseInput?.checked || false;
        responseValidationRule = validationRuleInput?.value || 'contains';
        responseValidationValue = validationValueInput?.value || '';
    } else if (monitorType === 'tcp') {
        port = portNumberInput?.value ? parseInt(portNumberInput.value, 10) : 80;
        timeoutSeconds = timeoutSecondsInput?.value ? parseInt(timeoutSecondsInput.value, 10) : 5;
    } else if (monitorType === 'ping') {
        packetCount = packetCountInput?.value ? parseInt(packetCountInput.value, 10) : 3;
        timeoutSeconds = timeoutSecondsInput?.value ? parseInt(timeoutSecondsInput.value, 10) : 5;
    }
    
    // Collect custom headers (only relevant for HTTP)
    const headers = {};
    if (monitorType === 'http') {
        const headerRows = document.querySelectorAll('.custom-header-row:not([style*="display: none"])');
    headerRows.forEach(row => {
        const nameInput = row.querySelector('.header-name');
        const valueInput = row.querySelector('.header-value');
        
        if (nameInput && valueInput && nameInput.value.trim()) {
            headers[nameInput.value.trim()] = valueInput.value.trim();
        }
    });
    }
    
    // Validate input
    if (!url) {
        alert('Please enter a URL to monitor');
            return;
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            alert('URL must start with http:// or https://');
            return;
        }
        
    if (!interval || isNaN(interval) || interval < 1) {
        alert('Please enter a valid ping interval (minimum 1 minute)');
        return;
    }
    
    // Type-specific validation
    if (monitorType === 'http') {
    // Validate POST body if method is POST
    if (method === 'POST' && !postBody) {
        alert('Please enter a body for POST request');
        return;
    }
    
    // Validate response validation settings
    if (validateResponse && !responseValidationValue) {
        alert('Please enter a value for response validation');
            return;
        }
    } else if (monitorType === 'tcp') {
        // Validate port
        if (!port || isNaN(port) || port < 1 || port > 65535) {
            alert('Please enter a valid port number (1-65535)');
            return;
        }
    } else if (monitorType === 'ping') {
        // Validate packet count
        if (!packetCount || isNaN(packetCount) || packetCount < 1 || packetCount > 10) {
            alert('Please enter a valid packet count (1-10)');
            return;
        }
    }
    
    // Validate timeout for TCP and Ping
    if ((monitorType === 'tcp' || monitorType === 'ping') && 
        (!timeoutSeconds || isNaN(timeoutSeconds) || timeoutSeconds < 1 || timeoutSeconds > 60)) {
        alert('Please enter a valid timeout value (1-60 seconds)');
        return;
    }
    
    try {
        // Verify the user's authentication token
        const token = localStorage.getItem('token');
        if (!token) {
            alert('You must be logged in to add a service');
            return;
        }
        
        // Check auth status
        try {
            const authResponse = await fetch('/api/auth/check', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!authResponse.ok) {
                console.error('Authentication check failed:', await authResponse.json());
                throw new Error('Authentication check failed. Please try logging in again.');
            }
        } catch (e) {
            console.error('Auth check error:', e);
        }
        
        // Prepare the service data
        const serviceData = {
            name,
            url,
            interval,
            monitorType
        };
        
        // Add type-specific fields
        if (monitorType === 'http') {
            serviceData.method = method;
            
            if (Object.keys(headers).length > 0) {
                serviceData.headers = headers;
            }
        
        // Add POST body if method is POST
        if (method === 'POST' && postBody) {
            serviceData.requestBody = postBody;
        }
        
        // Add validation settings if enabled
        if (validateResponse) {
            serviceData.validateResponse = true;
            serviceData.responseValidationRule = responseValidationRule;
            serviceData.responseValidationValue = responseValidationValue;
            }
        } else if (monitorType === 'tcp') {
            serviceData.port = port;
            serviceData.timeoutSeconds = timeoutSeconds;
        } else if (monitorType === 'ping') {
            serviceData.packetCount = packetCount;
            serviceData.timeoutSeconds = timeoutSeconds;
        }
        
        console.log('Creating service with data:', serviceData);
        
        // Make the API request
        const response = await fetch('/api/ping-services', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(serviceData)
        });
        
        let data;
        try {
            data = await response.json();
        } catch (e) {
            console.error('Error parsing response JSON:', e);
        }
        
        if (!response.ok) {
            console.error('Server response error:', data);
            throw new Error(data?.message || 'Failed to create service');
        }
        
        // Clear form
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        if (intervalInput) intervalInput.value = '';
        
        // Clear HTTP-specific fields
        if (methodInput) methodInput.value = 'GET';
        if (postBodyInput) postBodyInput.value = '';
        if (validateResponseInput) validateResponseInput.checked = false;
        if (validationValueInput) validationValueInput.value = '';
        
        // Clear TCP-specific fields
        if (portNumberInput) portNumberInput.value = '80';
        
        // Clear Ping-specific fields
        if (packetCountInput) packetCountInput.value = '3';
        
        // Clear shared fields
        if (timeoutSecondsInput) timeoutSecondsInput.value = '5';
        
        // Clear custom headers
        const headerRows = document.querySelectorAll('.custom-header-row:not([style*="display: none"])');
        headerRows.forEach(row => row.remove());
        
        // Close modal - safely
        try {
            const modalElement = document.getElementById('addServiceModal');
            if (modalElement) {
                closeModal('addServiceModal');
            } else {
                console.log('Modal already closed or not found - continuing');
            }
        } catch (modalError) {
            console.warn('Modal closing issue:', modalError);
            // Continue with the rest of the function
        }
        
        // Refresh services list
        await loadServices();
        
        alert('Service added successfully!');
        
    } catch (error) {
        console.error('Error adding service:', error);
        alert(error.message || 'Failed to add service. Please try again.');
    }
}

export function updateServiceList(services) {
    const container = document.getElementById('servicesList');
    container.innerHTML = '';
    
    if (!services || !Array.isArray(services) || services.length === 0) {
      container.innerHTML = `
        <div class="alert alert-info">
          <i class="fas fa-info-circle"></i> No services found. Add a service to get started.
        </div>
      `;
      return;
    }
    
    services.forEach(service => {
      const serviceItem = document.createElement('div');
      serviceItem.className = 'service-item';
      
      // Ensure we have a valid ID
      const serviceId = service._id || service.id;
      if (!serviceId) {
        console.error('Service missing ID:', service);
        return;
      }
      
      const status = service.lastStatus || 'unknown';
      const statusClass = status === 'success' ? 'success' : status === 'unknown' ? 'warning' : 'error';
      
      const statusIcon = status === 'success' ?
        '<i class="fas fa-check-circle"></i>' :
        status === 'unknown' ?
        '<i class="fas fa-question-circle"></i>' :
        '<i class="fas fa-exclamation-circle"></i>';
      
      const statusText = status === 'success' ? 'Online' : status === 'unknown' ? 'Unknown' : 'Offline';
      const timeAgo = service.lastPinged ? getTimeAgo(new Date(service.lastPinged)) : 'Never';
      
      // Format uptime with one decimal place if it exists and is a number
      let uptimeDisplay = 'N/A';
      if (typeof service.uptime === 'number' && !isNaN(service.uptime)) {
          uptimeDisplay = `${service.uptime.toFixed(1)}%`;
      }
      
      serviceItem.innerHTML = `
        <div class="service-status ${statusClass}">
          ${statusIcon}
        </div>
        <div class="service-info">
          <div class="service-name">${service.name || 'Unnamed Service'}</div>
          <div class="service-url">${service.url || 'No URL'}</div>
        </div>
        <div class="service-meta">
          <div class="service-uptime">${uptimeDisplay} uptime</div>
          <div class="service-checked">Checked ${timeAgo}</div>
        </div>
        <div class="service-status-text ${statusClass}">${statusText}</div>
      `;
      
      serviceItem.addEventListener('click', () => {
        updateState({ currentServiceId: serviceId });
        openServiceDetails(service);
      });
      
      container.appendChild(serviceItem);
    });
    
    // Update the service filter dropdown as well
    updateServiceFilter();
}

// In services.js, update the openServiceDetails function to properly handle the uptime
export async function openServiceDetails(serviceIdOrObject) {
    try {
        if (!serviceIdOrObject) {
            throw new Error('Service ID is required but was undefined or null');
        }
        
        let service;
        let serviceId;

        if (typeof serviceIdOrObject === 'object') {
            service = serviceIdOrObject;
            serviceId = service._id || service.id;
        } else {
            serviceId = serviceIdOrObject;
            const response = await fetch(`/api/ping-services/${serviceId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) throw new Error('Failed to fetch service details');
            service = await response.json();
        }

        if (!serviceId) {
            throw new Error('Invalid service: Missing ID');
        }

        // Update modal title
        document.getElementById('serviceDetailsTitle').textContent = service.name;

        // Update Info tab content
        const status = service.lastStatus || 'unknown';
        const statusClass = status === 'success' ? 'success' : status === 'unknown' ? 'warning' : 'error';
        const statusText = status === 'success' ? 'Online' : status === 'unknown' ? 'Unknown' : 'Offline';
        const statusIcon = status === 'success' ? 
            'check-circle' : status === 'unknown' ? 
            'question-circle' : 'exclamation-circle';

        const statusElement = document.getElementById('serviceDetailStatus');
        statusElement.className = `service-status-badge status-${statusClass}`;
        statusElement.innerHTML = `<i class="fas fa-${statusIcon}"></i> ${statusText}`;

        document.getElementById('serviceDetailUrl').textContent = service.url || 'No URL';
        document.getElementById('serviceDetailInterval').textContent = `${service.interval || 5} minutes`;
        document.getElementById('serviceDetailLastChecked').textContent = service.lastPinged ? 
            getTimeAgo(new Date(service.lastPinged)) : 'Never';

        // Update uptime display with proper formatting
        const uptimeElement = document.getElementById('serviceDetailUptime');
        if (uptimeElement) {
            let uptimeDisplay = 'N/A';
            if (typeof service.uptime === 'number' && !isNaN(service.uptime)) {
                uptimeDisplay = `${service.uptime.toFixed(1)}%`;
            }
            uptimeElement.textContent = uptimeDisplay;
        }

        // Update Settings tab content
        document.getElementById('editServiceName').value = service.name || '';
        document.getElementById('editServiceUrl').value = service.url || '';
        document.getElementById('editServiceInterval').value = service.interval || 5;
        document.getElementById('editServiceActive').checked = service.active !== false;

        // Fetch and update Logs tab content
        const logsContainer = document.getElementById('serviceDetailLogs');
        if (logsContainer) {
            logsContainer.innerHTML = '<div class="loading">Loading logs...</div>';
            
            try {
                const token = localStorage.getItem('token');
                const logsResponse = await fetch(`/api/ping-services/${serviceId}/logs`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!logsResponse.ok) throw new Error('Failed to fetch service logs');
                const logs = await logsResponse.json();
                
                logsContainer.innerHTML = '';
                
                if (!logs || logs.length === 0) {
                    logsContainer.innerHTML = `
                        <div class="alert alert-info">
                            <i class="fas fa-info-circle"></i> No logs available for this service.
                        </div>
                    `;
                } else {
                    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                    
                    logs.forEach(log => {
                        const logItem = document.createElement('div');
                        logItem.className = `log-item ${log.status}`;
                        
                        const timestamp = new Date(log.timestamp).toLocaleString();
                        const statusIcon = log.status === 'success' ?
                            '<i class="fas fa-check-circle"></i>' :
                            '<i class="fas fa-exclamation-circle"></i>';
                        
                        logItem.innerHTML = `
                            <div class="log-status">${statusIcon}</div>
                            <div class="log-content">
                                <div class="log-message">${log.message || 'Ping attempt'}</div>
                                <div class="log-meta">
                                    <div class="log-time"><i class="far fa-clock"></i> ${timestamp}</div>
                                    ${log.responseTime ? `<div class="log-response"><i class="fas fa-tachometer-alt"></i> ${log.responseTime}ms</div>` : ''}
                                </div>
                            </div>
                        `;
                        
                        logsContainer.appendChild(logItem);
                    });
                }
            } catch (error) {
                console.error('Error loading service logs:', error);
                logsContainer.innerHTML = `
                    <div class="alert alert-danger">
                        <i class="fas fa-exclamation-circle"></i> Failed to load logs. Please try again.
                    </div>
                `;
            }
        }

        // Store the current service ID in state
        updateState({ currentServiceId: serviceId });

        // Show the modal
        openModal('serviceDetailsModal');

    } catch (error) {
        console.error('Error opening service details:', error);
        alert('Failed to load service details. Please try again.');
    }
}

export function filterServices(query) {
  const container = document.getElementById('servicesList');
  container.innerHTML = '';
  
  const { serviceData } = getState();
  
  const filteredServices = serviceData.filter(service => 
      service.name.toLowerCase().includes(query.toLowerCase()) || 
      service.url.toLowerCase().includes(query.toLowerCase())
  );
  
  if (filteredServices.length === 0) {
      container.innerHTML = `
          <div class="alert alert-info">
              <i class="fas fa-info-circle"></i> No services found matching "${query}".
          </div>
      `;
      return;
  }
  
  filteredServices.forEach(service => {
      const serviceItem = document.createElement('div');
      serviceItem.className = 'service-item';
      
      const status = service.lastStatus || 'unknown';
      const statusClass = status === 'success' ? 'success' : status === 'unknown' ? 'warning' : 'error';
      
      const statusIcon = status === 'success' ?
        '<i class="fas fa-check-circle"></i>' :
        status === 'unknown' ?
        '<i class="fas fa-question-circle"></i>' :
        '<i class="fas fa-exclamation-circle"></i>';
      
      const statusText = status === 'success' ? 'Online' : status === 'unknown' ? 'Unknown' : 'Offline';
      const timeAgo = service.lastPinged ? getTimeAgo(new Date(service.lastPinged)) : 'Never';
      
      // Format uptime with one decimal place if it exists and is a number
      let uptimeDisplay = 'N/A';
      if (typeof service.uptime === 'number' && !isNaN(service.uptime)) {
          uptimeDisplay = `${service.uptime.toFixed(1)}%`;
      }
      
      serviceItem.innerHTML = `
          <div class="service-status ${statusClass}">${statusIcon}</div>
          <div class="service-info">
              <div class="service-name">${service.name || 'Unnamed Service'}</div>
              <div class="service-url">${service.url || 'No URL'}</div>
          </div>
          <div class="service-meta">
              <div class="service-uptime">${uptimeDisplay} uptime</div>
              <div class="service-checked">Checked ${timeAgo}</div>
          </div>
          <div class="service-status-text ${statusClass}">${statusText}</div>
      `;
      
      serviceItem.addEventListener('click', () => {
          updateState({ currentServiceId: service._id });
          openServiceDetails(service);
      });
      
      container.appendChild(serviceItem);
  });
}

// Add this helper function to check token validity
async function verifyTokenBeforeAction() {
    const token = localStorage.getItem('token');
    
    if (!token) {
        throw new Error('Authentication token is missing. Please log in again.');
    }
    
    // Verify token with backend
    try {
        const response = await fetch('/api/auth/check', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            // If token is invalid, clear it and redirect to login
            localStorage.removeItem('token');
            localStorage.removeItem('currentUser');
            alert('Your session has expired. Please log in again.');
            window.location.href = '/';
            throw new Error('Authentication token is invalid');
        }
        
        return token;
    } catch (error) {
        safeConsoleLog('error', 'Token verification error:', error);
        throw error;
    }
}

// Now update the confirmDeleteService function to track deletion state
export function confirmDeleteService(serviceId) {
    // Ensure we have a string ID, not an object
    let id;
    if (typeof serviceId === 'object' && serviceId !== null) {
        id = serviceId._id || serviceId.id;
    } else {
        id = serviceId;
    }

    if (!id) {
        safeConsoleLog('error', 'Invalid service ID:', serviceId);
        alert('Could not delete service: Invalid service ID');
        return;
    }
    
    // Check if already deleted
    if (deletedServiceIds.has(id)) {
        safeConsoleLog('log', `Service ${id} was already deleted, ignoring request`);
        // Close any open modals
        try {
            closeModal('confirmDeleteModal', true);
            closeModal('serviceDetailsModal', true);
        } catch (e) {
            safeConsoleLog('warn', 'Error closing modals:', e);
        }
        return;
    }
    
    // Check if deletion is already in progress
    if (deletionInProgress) {
        safeConsoleLog('log', 'A deletion operation is already in progress, please wait');
        return;
    }
    
    // Store the service ID in state for the delete operation
    updateState({ currentServiceId: id });
    
    // Create confirmation modal content
    const modalContent = `
        <div class="confirmation-dialog">
            <h3>Delete Service</h3>
            <p>Are you sure you want to delete this service? This action cannot be undone.</p>
            <div class="button-group">
                <button id="confirmDeleteBtn" class="btn btn-danger">
                    <i class="fas fa-trash"></i> Delete
                </button>
                <button id="cancelDeleteBtn" class="btn btn-secondary">
                    <i class="fas fa-times"></i> Cancel
                </button>
            </div>
        </div>
    `;
    
    // Show the confirmation modal
    openModal('confirmDeleteModal', modalContent);
    
    // Add event listeners for the buttons with safety checks
    const confirmBtn = document.getElementById('confirmDeleteBtn');
    if (confirmBtn) {
        // Clean up any existing event listeners to prevent duplicates
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
        
        // Use once: true to prevent multiple event handlers
        newConfirmBtn.addEventListener('click', async () => {
            try {
                // Set the deletion in progress flag
                deletionInProgress = true;
                
                // Disable the button to prevent multiple clicks
                newConfirmBtn.disabled = true;
                newConfirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Deleting...';
                
                // Check if already deleted
                if (deletedServiceIds.has(id)) {
                    safeConsoleLog('log', `Service ${id} was already deleted, ignoring delete request`);
                    closeModal('confirmDeleteModal', true);
                    closeModal('serviceDetailsModal', true);
                    return;
                }
                
                // Verify token before proceeding
                const token = await verifyTokenBeforeAction();
                
                // Get the service ID from state to ensure we have the right one
                const { currentServiceId } = getState();
                
                if (!currentServiceId) {
                    throw new Error('No service selected for deletion');
                }
                
                safeConsoleLog('log', 'Deleting service with ID:', currentServiceId);
                
                const response = await fetch(`/api/ping-services/${currentServiceId}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                // Log response details for debugging
                safeConsoleLog('log', 'Delete response status:', response.status);
                safeConsoleLog('log', 'Delete response status text:', response.statusText);
                
                if (!response.ok) {
                    // If it's a 404, the service was already deleted or doesn't exist
                    if (response.status === 404) {
                        safeConsoleLog('log', `Service ${currentServiceId} was already deleted or doesn't exist`);
                        deletedServiceIds.add(currentServiceId);
                        
                        // Safely close modals
                        closeModal('confirmDeleteModal', true);
                        closeModal('serviceDetailsModal', true);
                        
                        // Refresh the services list
                        await loadServices();
                        
                        return;
                    }
                    
                    let errorMessage = 'Failed to delete service';
                    try {
                        const data = await response.json();
                        safeConsoleLog('error', 'Delete error details:', data);
                        errorMessage = data.message || errorMessage;
                    } catch (parseError) {
                        safeConsoleLog('error', 'Error parsing response:', parseError);
                    }
                    
                    throw new Error(errorMessage);
                }
                
                // Mark as deleted to prevent duplicate requests
                deletedServiceIds.add(currentServiceId);
                
                // Safely close modals
                try {
                    closeModal('confirmDeleteModal', true);
                    closeModal('serviceDetailsModal', true);
                } catch (modalError) {
                    safeConsoleLog('warn', 'Modal closing issue:', modalError);
                }
                
                // Refresh the services list
                await loadServices();
                
                alert('Service deleted successfully');
                
            } catch (error) {
                safeConsoleLog('error', 'Error deleting service:', error);
                alert(error.message || 'Failed to delete service');
            } finally {
                // Reset the deletion in progress flag
                deletionInProgress = false;
                
                // Re-enable the button in case the modal is still open
                if (newConfirmBtn) {
                    newConfirmBtn.disabled = false;
                    newConfirmBtn.innerHTML = '<i class="fas fa-trash"></i> Delete';
                }
            }
        });
    }
    
    // Add event listener for cancel button
    const cancelBtn = document.getElementById('cancelDeleteBtn');
    if (cancelBtn) {
        // Clean up any existing event listeners
        const newCancelBtn = cancelBtn.cloneNode(true);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        newCancelBtn.addEventListener('click', () => {
            closeModal('confirmDeleteModal', true);
        });
    }
}

export async function deleteService(serviceId) {
    try {
        // If a deletion is already in progress, return
        if (deletionInProgress) {
            safeConsoleLog('log', 'A deletion operation is already in progress, please wait');
            return true;
        }
        
        // If serviceId is an event object or a service object, extract the ID
        let id;
        if (serviceId instanceof Event) {
            const { currentServiceId } = getState();
            if (!currentServiceId) {
                throw new Error('No service selected');
            }
            id = currentServiceId;
        } else if (typeof serviceId === 'object' && serviceId !== null) {
            id = serviceId._id || serviceId.id;
        } else {
            id = serviceId;
        }

        if (!id) {
            throw new Error('Invalid service ID');
        }
        
        // Check if service was already deleted
        if (deletedServiceIds.has(id)) {
            safeConsoleLog('log', `Service ${id} was already deleted, ignoring duplicate request`);
            return true;
        }
        
        // Set the deletion in progress flag
        deletionInProgress = true;
        
        safeConsoleLog('log', 'Attempting to delete service with ID:', id);
        
        try {
            // Verify token before proceeding
            const token = await verifyTokenBeforeAction();
            
            // Create an AbortController to cancel the request if needed
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
            
            try {
                const response = await fetch(`/api/ping-services/${id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    signal: controller.signal
                });
                
                clearTimeout(timeoutId); // Clear the timeout
                
                // Log response details for debugging
                safeConsoleLog('log', 'Delete response status:', response.status);
                safeConsoleLog('log', 'Delete response status text:', response.statusText);
                
                if (!response.ok) {
                    // If it's a 404, the service was already deleted or doesn't exist
                    if (response.status === 404) {
                        safeConsoleLog('log', `Service ${id} no longer exists, considering it deleted`);
                        deletedServiceIds.add(id);
                        await loadServices(); // Refresh the services list
                        return true;
                    }
                    
                    let errorMessage = 'Failed to delete service';
                    try {
                        const data = await response.json();
                        safeConsoleLog('error', 'Delete error details:', data);
                        errorMessage = data.message || errorMessage;
                    } catch (parseError) {
                        safeConsoleLog('error', 'Error parsing response:', parseError);
                    }
                    throw new Error(errorMessage);
                }
                
                // Mark as deleted to prevent duplicate requests
                deletedServiceIds.add(id);
            } catch (fetchError) {
                // Handle abort errors separately
                if (fetchError.name === 'AbortError') {
                    throw new Error('Request timed out. Please try again.');
                }
                throw fetchError;
            }
            
            // Refresh the services list
            await loadServices();
            
            return true;
        } finally {
            // Reset the deletion in progress flag
            deletionInProgress = false;
        }
    } catch (error) {
        safeConsoleLog('error', 'Error deleting service:', error);
        // Reset the deletion in progress flag
        deletionInProgress = false;
        throw error;
    }
}

export async function saveServiceSettings() {
    try {
        const { currentServiceId } = getState();
        if (!currentServiceId) {
            throw new Error('No service selected');
        }

        // Get form values
        const name = document.getElementById('editServiceName').value.trim();
        const url = document.getElementById('editServiceUrl').value.trim();
        const interval = parseInt(document.getElementById('editServiceInterval').value);
        const active = document.getElementById('editServiceActive').checked;
        
        // Validate inputs
        if (!name || !url || !interval) {
            alert('Please fill in all required fields');
            return;
        }
        
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            alert('URL must start with http:// or https://');
            return;
        }
        
        // Get token from localStorage
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Authentication token not found');
        }
        
        // Prepare the service data
        const serviceData = {
            name,
            url,
            interval,
            active
        };
        
        console.log('Updating service with data:', serviceData);
        
        // Make the API request
        const response = await fetch(`/api/ping-services/${currentServiceId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(serviceData)
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Failed to update service');
        }
        
        // Close modal
        closeModal('serviceDetailsModal');
        
        // Refresh services list
        await loadServices();
        
        // Show success message
        alert('Service updated successfully!');
        
    } catch (error) {
        console.error('Error updating service:', error);
        alert(error.message || 'Failed to update service. Please try again.');
    }
}