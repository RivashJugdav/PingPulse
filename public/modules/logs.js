import { openServiceDetails } from './services.js';
import { getState, updateState } from './state.js';
import { isLoggedIn, getTimeAgo } from './utils.js';
// modules/logs.js

export async function loadAllLogs() {
  try {
    console.log('Loading all logs...');
    // Check if token exists before making the request
    const token = localStorage.getItem('token');
    if (!token) {
      console.log('Not logged in, skipping logs refresh');
      return; // Exit the function early if no token exists
    }
    
    // Show loading indicator
    showLoadingIndicator();
    
    const response = await fetch('/api/ping-services/logs', {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + token,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to load logs');
    }

    const data = await response.json();
    console.log('Received logs data:', data);

    // Get service data from state
    const { serviceData } = getState();
    console.log('Current serviceData:', serviceData);
    
    // If we have logs but no service data, create a temporary service structure
    if ((!serviceData || !Array.isArray(serviceData) || serviceData.length === 0) && data.length > 0) {
      console.log('No service data found but logs exist, creating temporary structure');
      
      // Create a map of service IDs to service names
      const serviceMap = {};
      data.forEach(log => {
        if (log.serviceId && !serviceMap[log.serviceId]) {
          serviceMap[log.serviceId] = {
            id: log.serviceId,
            name: log.serviceName || `Service ${log.serviceId}`,
            logs: []
          };
        }
      });
      
      // Create array of services from the map
      const tempServiceData = Object.values(serviceMap);
      
      // Add logs to each service
      data.forEach(log => {
        if (log.serviceId && serviceMap[log.serviceId]) {
          serviceMap[log.serviceId].logs.push(log);
        }
      });
      
      console.log('Created temporary service data:', tempServiceData);
      
      // Update state with this temporary service data
      updateState({
        serviceData: tempServiceData
      });
      
      // Update the service filter dropdown
      updateServiceFilter();
      
      // Filter and display logs
      filterLogs('all');
    } 
    // If we have service data, update it with logs
    else if (serviceData && Array.isArray(serviceData)) {
      const updatedServiceData = [...serviceData];
      
      // First, clear existing logs
      updatedServiceData.forEach(service => {
        service.logs = [];
      });
      
      // Then add new logs to each service
      data.forEach(log => {
        const serviceIndex = updatedServiceData.findIndex(s => s.id === log.serviceId);
        if (serviceIndex !== -1) {
          if (!updatedServiceData[serviceIndex].logs) {
            updatedServiceData[serviceIndex].logs = [];
          }
          updatedServiceData[serviceIndex].logs.push(log);
        } else {
          // If we have a log for a service not in our data, add it
          updatedServiceData.push({
            id: log.serviceId,
            name: log.serviceName || `Service ${log.serviceId}`,
            logs: [log]
          });
        }
      });
      
      updateState({
        serviceData: updatedServiceData
      });
      
      // Update the service filter dropdown
      updateServiceFilter();
      
      // Filter and display logs
      filterLogs('all');
    }
    // If we have no service data and no logs, display appropriate message
    else {
      displayNoLogsMessage();
    }
  } catch (error) {
    console.error('Error loading logs:', error);
    displayErrorMessage(error.message || 'Failed to load logs');
  }
}

// Helper functions for displaying messages
function showLoadingIndicator() {
  const allLogsContainer = document.getElementById('allLogsList');
  const errorLogsContainer = document.getElementById('errorLogsList');
  
  if (allLogsContainer) {
    allLogsContainer.innerHTML = '<div class="loading">Loading logs...</div>';
  }
  
  if (errorLogsContainer) {
    errorLogsContainer.innerHTML = '<div class="loading">Loading logs...</div>';
  }
}

export async function displayAuthError() {
  const allLogsContainer = document.getElementById('allLogsList');
  const errorLogsContainer = document.getElementById('errorLogsList');
  
  const message = `
    <div class="alert alert-warning">
      <i class="fas fa-exclamation-triangle"></i> Please log in to view logs.
    </div>
  `;
  
  if (allLogsContainer) allLogsContainer.innerHTML = message;
  if (errorLogsContainer) errorLogsContainer.innerHTML = message;
}

function displayNoLogsMessage() {
  const allLogsContainer = document.getElementById('allLogsList');
  const errorLogsContainer = document.getElementById('errorLogsList');
  
  const message = `
    <div class="alert alert-info">
      <i class="fas fa-info-circle"></i> No logs available.
    </div>
  `;
  
  if (allLogsContainer) allLogsContainer.innerHTML = message;
  if (errorLogsContainer) errorLogsContainer.innerHTML = message;
}

function displayErrorMessage(message) {
  const allLogsContainer = document.getElementById('allLogsList');
  const errorLogsContainer = document.getElementById('errorLogsList');
  
  const errorHtml = `
    <div class="alert alert-danger">
      <i class="fas fa-exclamation-circle"></i> ${message}
    </div>
  `;
  
  if (allLogsContainer) allLogsContainer.innerHTML = errorHtml;
  if (errorLogsContainer) errorLogsContainer.innerHTML = errorHtml;
}

export function filterLogs(serviceId) {
  console.log('Filtering logs for service:', serviceId);
  
  const allLogsContainer = document.getElementById('allLogsList');
  const errorLogsContainer = document.getElementById('errorLogsList');
  
  if (!allLogsContainer || !errorLogsContainer) {
      console.error('Log containers not found.');
      return;
  }
  
  // Clear the containers
  allLogsContainer.innerHTML = '';
  errorLogsContainer.innerHTML = '';
  
  const { serviceData } = getState();
  console.log('Service data for filtering:', serviceData);
  
  if (!serviceData || !Array.isArray(serviceData)) {
      console.error('No service data available for filtering');
      displayNoLogsMessage();
      return;
  }
  
  // Get all logs from all services
  const allLogs = [];
  const errorLogs = [];
  
  serviceData.forEach(service => {
      // Skip if not the selected service (unless "all" is selected)
      if (serviceId !== 'all' && service.id !== serviceId) {
          return;
      }
      
      // Skip if the service has no logs
      if (!service.logs || !Array.isArray(service.logs)) {
          return;
      }
      
      console.log(`Processing logs for service ${service.id}:`, service.logs);
      
      service.logs.forEach(log => {
          const enrichedLog = {
              ...log,
              serviceName: service.name || 'Unknown Service',
              serviceId: service.id
          };
          
          // Add to all logs
          allLogs.push(enrichedLog);
          
          // Add to error logs if it's an error
          if (log.status === 'error') {
              errorLogs.push(enrichedLog);
          }
      });
  });
  
  console.log('Filtered all logs:', allLogs.length);
  console.log('Filtered error logs:', errorLogs.length);
  
  // Sort logs by timestamp (newest first)
  allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  errorLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
  // Display all logs
  if (allLogs.length === 0) {
      allLogsContainer.innerHTML = `
          <div class="alert alert-info">
              <i class="fas fa-info-circle"></i> No logs available for this service.
          </div>
      `;
  } else {
      createLogItems(allLogsContainer, allLogs);
  }
  
  // Display error logs
  if (errorLogs.length === 0) {
      errorLogsContainer.innerHTML = `
          <div class="alert alert-info">
              <i class="fas fa-info-circle"></i> No error logs found for this service.
          </div>
      `;
  } else {
      createLogItems(errorLogsContainer, errorLogs);
  }
  
  // Update the service filter selection
  const filterSelect = document.getElementById('serviceFilter');
  if (filterSelect) {
      filterSelect.value = serviceId;
  }
}

export function createLogItem(log) {
    const logItem = document.createElement('div');
    logItem.className = `log-item ${log.status}`;
    
    const timeAgo = log.timestamp ? getTimeAgo(new Date(log.timestamp)) : 'Unknown';
    
    // Format response time as ms, or 'N/A' if not available
    const responseTime = log.responseTime != null ? `${log.responseTime}ms` : 'N/A';
    
    // Create the main log item content with standard info
    logItem.innerHTML = `
        <div class="log-status ${log.status}">
            <i class="fas fa-${log.status === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
        </div>
        <div class="log-details">
            <div class="log-title">
                ${log.serviceName ? `<span class="service-name">${log.serviceName}</span>` : ''}
                <span class="log-message">${log.message || 'No message'}</span>
            </div>
            <div class="log-meta">
                <span class="log-time">${timeAgo}</span>
                ${responseTime !== 'N/A' ? `<span class="log-response-time">${responseTime}</span>` : ''}
            </div>
        </div>
    `;
    
    // Add expandable response body content if available
    if (log.responseBody) {
        const responseBodyEl = document.createElement('div');
        responseBodyEl.className = 'log-response-body';
        
        try {
            // Try to parse as JSON for pretty display
            const jsonResponse = JSON.parse(log.responseBody);
            responseBodyEl.innerHTML = `
                <div class="log-response-toggle">
                    <i class="fas fa-code"></i> View Response
                </div>
                <pre class="response-content hidden">${JSON.stringify(jsonResponse, null, 2)}</pre>
            `;
        } catch (e) {
            // Not JSON, display as plain text
            responseBodyEl.innerHTML = `
                <div class="log-response-toggle">
                    <i class="fas fa-code"></i> View Response
                </div>
                <pre class="response-content hidden">${log.responseBody}</pre>
            `;
        }
        
        // Add click handler to toggle visibility
        logItem.appendChild(responseBodyEl);
        const toggleBtn = responseBodyEl.querySelector('.log-response-toggle');
        const responseContent = responseBodyEl.querySelector('.response-content');
        
        toggleBtn.addEventListener('click', () => {
            responseContent.classList.toggle('hidden');
            toggleBtn.innerHTML = responseContent.classList.contains('hidden') 
                ? '<i class="fas fa-code"></i> View Response' 
                : '<i class="fas fa-code"></i> Hide Response';
        });
    }
    
    return logItem;
}

export function createLogItems(container, logs) {
  container.innerHTML = ''; // Clear the container first
  
  logs.forEach(log => {
      const logItem = createLogItem(log);
      
      logItem.addEventListener('click', () => {
          window.currentServiceId = log.serviceId;
          openServiceDetails(log.serviceId);
      });
      
      container.appendChild(logItem);
  });
}

export async function loadServiceLogs(serviceId) {
    const logsContainer = document.getElementById('serviceDetailLogs');
    logsContainer.innerHTML = '<div class="loading">Loading logs...</div>';
    
    try {
      const response = await fetch(`/api/ping/${serviceId}/logs`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token'),
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to load service logs');
      }
      
      const logs = await response.json();
      
      if (!logs || logs.length === 0) {
        logsContainer.innerHTML = `
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> No logs available for this service.
          </div>
        `;
        return;
      }
      
      // Clear and populate logs
      logsContainer.innerHTML = '';
      
      // Reverse to show newest first
      logs.slice().reverse().forEach(log => {
        const logItem = createLogItem(log);
        
        logsContainer.appendChild(logItem);
      });
      
    } catch (error) {
      console.error('Error loading service logs:', error);
      logsContainer.innerHTML = `
        <div class="alert alert-danger">
          <i class="fas fa-exclamation-triangle"></i> Failed to load logs: ${error.message}
        </div>
      `;
    }
}
  
export function updateServiceFilter() {
  const filterSelect = document.getElementById('serviceFilter');
  if (!filterSelect) {
      console.error('Service filter element not found');
      return;
  }
  
  // Save the current selection
  const currentValue = filterSelect.value;
  
  // Clear options
  filterSelect.innerHTML = '<option value="all">All Services</option>';
  
  const { serviceData } = getState();
  
  if (serviceData && Array.isArray(serviceData)) {
      // Add options for each service
      serviceData.forEach(service => {
          const option = document.createElement('option');
          option.value = service.id;
          option.textContent = service.name || `Service ${service.id}`;
          filterSelect.appendChild(option);
      });
      
      // Restore the previous selection if it exists
      if (currentValue && filterSelect.querySelector(`option[value="${currentValue}"]`)) {
          filterSelect.value = currentValue;
      }
  }
}

// Initialize logs when the page loads
export function initLogs() {
  console.log('Initializing logs page');
  
  // Set up tab switching
  const allLogsTab = document.querySelector('[data-tab="all-logs"]');
  const errorLogsTab = document.querySelector('[data-tab="error-logs"]');
  
  if (allLogsTab && errorLogsTab) {
      // Set initial active tab
      allLogsTab.classList.add('active');
      errorLogsTab.classList.remove('active');
      
      // Set initial active content
      document.getElementById('all-logs').classList.add('active');
      document.getElementById('error-logs').classList.remove('active');
      
      // Add click event listeners for tabs
      allLogsTab.addEventListener('click', function() {
          // Update tab states
          allLogsTab.classList.add('active');
          errorLogsTab.classList.remove('active');
          
          // Update content visibility
          document.getElementById('all-logs').classList.add('active');
          document.getElementById('error-logs').classList.remove('active');
      });
      
      errorLogsTab.addEventListener('click', function() {
          // Update tab states
          errorLogsTab.classList.add('active');
          allLogsTab.classList.remove('active');
          
          // Update content visibility
          document.getElementById('error-logs').classList.add('active');
          document.getElementById('all-logs').classList.remove('active');
      });
  }
  
  // Ensure the containers exist
  const allLogsContainer = document.getElementById('allLogsList');
  const errorLogsContainer = document.getElementById('errorLogsList');
  
  if (!allLogsContainer || !errorLogsContainer) {
      console.error('Log containers not found during initialization');
      return;
  }
  
  // Set up service filter
  const filterSelect = document.getElementById('serviceFilter');
  if (filterSelect) {
      // Set default value
      filterSelect.value = 'all';
      
      // Set up event listener
      filterSelect.addEventListener('change', function() {
          const selectedServiceId = this.value;
          console.log('Filter changed to:', selectedServiceId);
          filterLogs(selectedServiceId);
      });
  }
  
  // Load all logs
  loadAllLogs();
  
  // Add refresh button event listener
  const refreshButton = document.getElementById('refreshLogsBtn');
  if (refreshButton) {
      refreshButton.addEventListener('click', function() {
          loadAllLogs();
      });
  }
}

export function filterLogsByType(type) {
    // ... existing code ...
}