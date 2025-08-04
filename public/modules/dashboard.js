import { getTimeAgo } from './utils.js';
import { openServiceDetails } from './services.js';
import { authenticatedFetch } from './utils.js';
import { getState, updateState } from './state.js';

// modules/dashboard.js

export async function refreshDashboard() {
    // Check if user is logged in first
    const token = localStorage.getItem('token');
    if (!token) {
        console.log('Not logged in, skipping dashboard refresh');
        return; // Exit the function early if no token exists
    }

    try {
      const response = await authenticatedFetch('/api/dashboard/stats');
      const data = await response.json();
 
      if (response.ok) {
        // Update the dashboard UI with the received data
        document.getElementById('totalServices').textContent = data.totalServices;
        
        // Calculate average uptime percentage from healthy services
        const uptimePercentage = data.totalServices > 0 
          ? Math.round((data.healthyServices / data.totalServices) * 100) 
          : 100;
        document.getElementById('uptimePercentage').textContent = `${uptimePercentage}%`;
        
        // Count error services as alerts
        document.getElementById('alertsToday').textContent = data.errorServices;
        
        // Update recent activity logs if they exist
        if (data.recentLogs && data.recentLogs.length > 0) {
          const recentLogsElement = document.getElementById('recentLogs');
          recentLogsElement.innerHTML = ''; // Clear existing logs
          
          data.recentLogs.forEach(log => {
            const logItem = document.createElement('div');
            logItem.className = `log-item ${log.status === 'error' ? 'log-error' : 'log-success'}`;
            
            const logTime = new Date(log.timestamp).toLocaleString();
            logItem.innerHTML = `
              <div class="log-icon">
                <i class="fas fa-${log.status === 'error' ? 'times-circle' : 'check-circle'}"></i>
              </div>
              <div class="log-content">
                <div class="log-service">${log.serviceName}</div>
                <div class="log-message">${log.status === 'error' ? 'Failed' : 'Successful'} ping to ${log.serviceUrl}</div>
                <div class="log-time">${logTime}</div>
              </div>
            `;
            recentLogsElement.appendChild(logItem);
          });
        } else {
          document.getElementById('recentLogs').innerHTML = `
            <div class="alert alert-info">
              <i class="fas fa-info-circle"></i> No recent activity to display. Add a service to get started.
            </div>
          `;
        }
        
        // Also refresh the service status list
        refreshServiceStatus();
      } else {
        console.error('API error:', data.message);
        // Only show alert for critical errors, not for every refresh
        if (!localStorage.getItem('dashboardErrorShown')) {
          alert(data.message || 'Failed to load dashboard data.');
          localStorage.setItem('dashboardErrorShown', 'true');
          // Clear this flag after 1 minute to allow showing errors again
          setTimeout(() => localStorage.removeItem('dashboardErrorShown'), 60000);
        }
      }
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Only show alert for critical errors, not for every refresh cycle
      if (!localStorage.getItem('dashboardErrorShown')) {
        alert('Failed to load dashboard data. Please check your connection.');
        localStorage.setItem('dashboardErrorShown', 'true');
        setTimeout(() => localStorage.removeItem('dashboardErrorShown'), 60000);
      }
    }
    console.log('Current token:', localStorage.getItem('token'));
}

export async function refreshServiceStatus() {
  try {
    const response = await authenticatedFetch('/api/dashboard/service-status');
    const serviceStatus = await response.json();

    if (response.ok) {
      const serviceStatusList = document.getElementById('serviceStatusList');
      
      if (serviceStatus.length === 0) {
        serviceStatusList.innerHTML = `
          <div class="alert alert-info">
            <i class="fas fa-info-circle"></i> No services added yet. Add your first service to monitor.
          </div>
        `;
        return;
      }
      
      serviceStatusList.innerHTML = ''; // Clear existing status items
      
      serviceStatus.forEach(service => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item';
        
        // Normalize status to ensure consistent handling
        let normalizedStatus = service.status || service.lastStatus || 'unknown';
        
        // Create a normalized service object with consistent fields
        const normalizedService = {
          ...service,
          // Make sure we have both status and lastStatus properties
          status: normalizedStatus,
          lastStatus: normalizedStatus
        };
        
        serviceItem.onclick = () => {
          // Store the service ID in state and then open service details
          updateState({ currentServiceId: normalizedService._id || normalizedService.id });
          // Pass the normalized service object to openServiceDetails
          openServiceDetails(normalizedService);
        };
        
        const statusClass = 
          normalizedStatus === 'success' ? 'status-up' : 
          normalizedStatus === 'error' ? 'status-down' : 
          'status-pending';
        
        const statusIcon = 
          normalizedStatus === 'success' ? 'check-circle' : 
          normalizedStatus === 'error' ? 'times-circle' : 
          'clock';
        
        const lastChecked = service.lastPinged ? 
          new Date(service.lastPinged).toLocaleString() : 
          'Not checked yet';
        
        // Format uptime with one decimal place if it exists and is a number
        let uptimeDisplay = 'N/A';
        if (typeof service.uptime === 'number' && !isNaN(service.uptime)) {
            uptimeDisplay = `${service.uptime.toFixed(1)}%`;
        }
        
        serviceItem.innerHTML = `
          <div class="service-status ${statusClass}">
            <i class="fas fa-${statusIcon}"></i>
          </div>
          <div class="service-info">
            <div class="service-name">${service.name}</div>
            <div class="service-url">${service.url}</div>
            <div class="service-details">
              <span>Checked: ${lastChecked}</span>
              <span>Interval: ${service.interval} mins</span>
              <span>Uptime: ${uptimeDisplay}</span>
            </div>
          </div>
        `;
        
        serviceStatusList.appendChild(serviceItem);
      });
    }
  } catch (error) {
    console.error('Error loading service status:', error);
  }
}

export function loadRecentLogs() {
    const logsContainer = document.getElementById('recentLogs');
    logsContainer.innerHTML = '';
    
    // Get all logs from all services
    const allLogs = [];
    serviceData.forEach(service => {
        service.logs.forEach(log => {
            allLogs.push({
                ...log,
                serviceName: service.name,
                serviceId: service.id
            });
        });
    });
    
    // Sort by timestamp (most recent first)
    allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Take only the 5 most recent logs
    const recentLogs = allLogs.slice(0, 5);
    
    if (recentLogs.length === 0) {
        logsContainer.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i> No recent activity to display.
            </div>
        `;
        return;
    }
    
    // Create log entries
    recentLogs.forEach(log => {
        const logItem = document.createElement('div');
        logItem.className = `log-item ${log.status}`;
        
        const icon = log.status === 'success' ? 
            '<i class="fas fa-check-circle"></i>' : 
            '<i class="fas fa-exclamation-circle"></i>';
        
        const timeAgo = getTimeAgo(new Date(log.timestamp));
        
        logItem.innerHTML = `
            <div class="log-icon">${icon}</div>
            <div class="log-content">
                <div class="log-service">${log.serviceName}</div>
                <div class="log-message">${log.message}</div>
                <div class="log-time">${timeAgo}</div>
            </div>
        `;
        
        logItem.addEventListener('click', () => {
            currentServiceId = log.serviceId;
            openServiceDetails(log.serviceId);
        });
        
        logsContainer.appendChild(logItem);
    });
}

export function loadServiceStatusList() {
    const container = document.getElementById('serviceStatusList');
    if (!container) {
        console.error('Service status list container not found');
        return;
    }
    
    container.innerHTML = '';
    
    const { serviceData } = getState();
    
    if (!serviceData || serviceData.length === 0) {
        container.innerHTML = `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i> No services added yet. Add your first service to monitor.
            </div>
        `;
        return;
    }
    
    serviceData.forEach(service => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item';
        
        const statusClass = service.lastStatus === 'success' ? 'success' : 'error';
        const statusIcon = service.lastStatus === 'success' ? 
            '<i class="fas fa-check-circle"></i>' : 
            '<i class="fas fa-exclamation-circle"></i>';
        
        const timeAgo = service.lastPinged ? getTimeAgo(new Date(service.lastPinged)) : 'Never';
        
        serviceItem.innerHTML = `
            <div class="service-status ${statusClass}">${statusIcon}</div>
            <div class="service-info">
                <div class="service-name">${service.name}</div>
                <div class="service-url">${service.url}</div>
            </div>
            <div class="service-meta">
                <div class="service-uptime">${service.uptime !== undefined ? service.uptime + '%' : 'N/A'} uptime</div>
                <div class="service-checked">Checked ${timeAgo}</div>
            </div>
        `;
        
        serviceItem.addEventListener('click', () => {
            updateState({ currentServiceId: service._id });
            openServiceDetails(service);
        });
        
        container.appendChild(serviceItem);
    });
}