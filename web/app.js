/**
 * LXC Container Management Web Interface
 * Modern JavaScript application for managing LXC containers
 */

class LXCManager {
    constructor() {
        this.apiBaseUrl = 'http://localhost:8080/api'; // Adjust based on your backend
        this.wsUrl = 'ws://localhost:8080/ws'; // WebSocket endpoint
        this.websocket = null;
        this.containers = [];
        this.connectionRetryCount = 0;
        this.maxRetryAttempts = 5;
        
        this.init();
    }

    /**
     * Initialize the application
     */
    async init() {
        this.bindEventListeners();
        this.showLoading();
        
        try {
            await this.loadContainers();
            this.connectWebSocket();
        } catch (error) {
            console.error('Failed to initialize:', error);
            this.showNotification('Failed to initialize application', 'error');
        } finally {
            this.hideLoading();
        }
    }

    /**
     * Bind all event listeners
     */
    bindEventListeners() {
        // Header buttons
        document.getElementById('refreshBtn').addEventListener('click', () => this.refreshContainers());
        document.getElementById('createContainerBtn').addEventListener('click', () => this.openCreateModal());

        // Form submissions
        document.getElementById('createContainerForm').addEventListener('submit', (e) => this.handleCreateContainer(e));
        document.getElementById('portForwardForm').addEventListener('submit', (e) => this.handlePortForward(e));

        // Modal close events
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeAllModals();
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
            if (e.key === 'r' && e.ctrlKey) {
                e.preventDefault();
                this.refreshContainers();
            }
            if (e.key === 'n' && e.ctrlKey) {
                e.preventDefault();
                this.openCreateModal();
            }
        });

        // Auto-refresh every 30 seconds
        setInterval(() => this.refreshContainers(), 30000);
    }

    /**
     * WebSocket Connection Management
     */
    connectWebSocket() {
        try {
            this.websocket = new WebSocket(this.wsUrl);
            
            this.websocket.onopen = () => {
                console.log('WebSocket connected');
                this.connectionRetryCount = 0;
                this.updateConnectionStatus(true);
                this.showNotification('Connected to server', 'success');
            };

            this.websocket.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };

            this.websocket.onclose = () => {
                console.log('WebSocket disconnected');
                this.updateConnectionStatus(false);
                this.retryWebSocketConnection();
            };

            this.websocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus(false);
            };
        } catch (error) {
            console.error('Failed to connect WebSocket:', error);
            this.updateConnectionStatus(false);
            this.retryWebSocketConnection();
        }
    }

    /**
     * Retry WebSocket connection with exponential backoff
     */
    retryWebSocketConnection() {
        if (this.connectionRetryCount < this.maxRetryAttempts) {
            const delay = Math.pow(2, this.connectionRetryCount) * 1000;
            this.connectionRetryCount++;
            
            setTimeout(() => {
                console.log(`Retrying WebSocket connection (${this.connectionRetryCount}/${this.maxRetryAttempts})`);
                this.connectWebSocket();
            }, delay);
        } else {
            this.showNotification('Failed to connect to server. Please check your connection.', 'error');
        }
    }

    /**
     * Handle incoming WebSocket messages
     */
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            
            switch (data.type) {
                case 'containerUpdate':
                    this.handleContainerUpdate(data.payload);
                    break;
                case 'containerCreated':
                    this.showNotification(`Container "${data.payload.name}" created successfully`, 'success');
                    this.refreshContainers();
                    break;
                case 'containerDeleted':
                    this.showNotification(`Container "${data.payload.name}" deleted`, 'warning');
                    this.refreshContainers();
                    break;
                case 'operationComplete':
                    this.showNotification(data.payload.message, data.payload.type || 'success');
                    break;
                default:
                    console.log('Unknown WebSocket message:', data);
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(connected) {
        const indicator = document.getElementById('connectionStatus');
        const text = document.getElementById('connectionText');
        
        if (connected) {
            indicator.className = 'connection-indicator connected';
            text.textContent = 'Connected';
        } else {
            indicator.className = 'connection-indicator disconnected';
            text.textContent = 'Disconnected';
        }
    }

    /**
     * API Methods
     */
    async makeApiCall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                },
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`${this.apiBaseUrl}${endpoint}`, options);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    /**
     * Container Management Methods
     */
    async loadContainers() {
        try {
            // For demo purposes, we'll simulate API calls
            // In a real implementation, these would be actual API calls
            this.containers = await this.simulateContainerList();
            this.renderContainers();
            this.updateStatusBar();
        } catch (error) {
            console.error('Failed to load containers:', error);
            this.showNotification('Failed to load containers', 'error');
        }
    }

    async refreshContainers() {
        const refreshBtn = document.getElementById('refreshBtn');
        refreshBtn.disabled = true;
        
        try {
            await this.loadContainers();
            this.showNotification('Containers refreshed', 'success');
        } catch (error) {
            this.showNotification('Failed to refresh containers', 'error');
        } finally {
            refreshBtn.disabled = false;
        }
    }

    /**
     * Simulate API responses for demo purposes
     * Replace these with actual API calls to your backend
     */
    async simulateContainerList() {
        return new Promise((resolve) => {
            setTimeout(() => {
                resolve([
                    {
                        name: 'web-server-01',
                        status: 'running',
                        os: 'ubuntu:22.04',
                        ip: '192.168.1.100',
                        cpu: '1.2%',
                        memory: '256MB',
                        uptime: '2d 5h 30m'
                    },
                    {
                        name: 'database-01',
                        status: 'running',
                        os: 'debian:12',
                        ip: '192.168.1.101',
                        cpu: '0.8%',
                        memory: '512MB',
                        uptime: '1d 12h 15m'
                    },
                    {
                        name: 'dev-environment',
                        status: 'stopped',
                        os: 'alpine:3.18',
                        ip: '192.168.1.102',
                        cpu: '0%',
                        memory: '0MB',
                        uptime: '0m'
                    }
                ]);
            }, 500);
        });
    }

    /**
     * Render containers in the grid
     */
    renderContainers() {
        const containerGrid = document.getElementById('containerGrid');
        const emptyState = document.getElementById('emptyState');

        if (this.containers.length === 0) {
            containerGrid.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        containerGrid.style.display = 'grid';
        emptyState.style.display = 'none';

        containerGrid.innerHTML = this.containers.map(container => `
            <div class="container-card ${container.status}" data-container="${container.name}">
                <div class="container-header">
                    <h3 class="container-name">${container.name}</h3>
                    <span class="container-status ${container.status}">${container.status}</span>
                </div>
                
                <div class="container-info">
                    <div class="info-item">
                        <span class="info-label">OS</span>
                        <span class="info-value">${container.os}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">IP Address</span>
                        <span class="info-value">${container.ip}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">CPU</span>
                        <span class="info-value">${container.cpu}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Memory</span>
                        <span class="info-value">${container.memory}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">Uptime</span>
                        <span class="info-value">${container.uptime}</span>
                    </div>
                </div>
                
                <div class="container-actions">
                    ${container.status === 'running' 
                        ? `<button class="btn btn-secondary btn-sm" onclick="lxcManager.connectToContainer('${container.name}')">
                               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                   <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                   <polyline points="15,3 21,3 21,9"></polyline>
                                   <line x1="10" y1="14" x2="21" y2="3"></line>
                               </svg>
                               Connect
                           </button>
                           <button class="btn btn-warning btn-sm" onclick="lxcManager.restartContainer('${container.name}')">
                               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                   <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                                   <path d="M21 3v5h-5"></path>
                                   <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                                   <path d="M3 21v-5h5"></path>
                               </svg>
                               Restart
                           </button>`
                        : `<button class="btn btn-success btn-sm" onclick="lxcManager.startContainer('${container.name}')">
                               <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                                   <polygon points="5,3 19,12 5,21"></polygon>
                               </svg>
                               Start
                           </button>`
                    }
                    <button class="btn btn-secondary btn-sm" onclick="lxcManager.openPortForwardModal('${container.name}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path d="M7 17l9.2-9.2M17 17H7v-10"></path>
                        </svg>
                        Port Forward
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="lxcManager.deleteContainer('${container.name}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <polyline points="3,6 5,6 21,6"></polyline>
                            <path d="m19,6v14a2,2 0 0,1 -2,2H7a2,2 0 0,1 -2,-2V6m3,0V4a2,2 0 0,1 2,-2h4a2,2 0 0,1 2,2v2"></path>
                        </svg>
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    }

    /**
     * Update status bar with container statistics
     */
    updateStatusBar() {
        const total = this.containers.length;
        const running = this.containers.filter(c => c.status === 'running').length;
        const stopped = total - running;

        document.getElementById('totalContainers').textContent = total;
        document.getElementById('runningContainers').textContent = running;
        document.getElementById('stoppedContainers').textContent = stopped;
    }

    /**
     * Container Actions
     */
    async createContainer(name, os) {
        try {
            // Simulate API call
            await this.simulateApiCall('create', { name, os });
            this.showNotification(`Creating container "${name}" with ${os}...`, 'success');
            
            // Add to local state optimistically
            this.containers.push({
                name,
                status: 'stopped',
                os,
                ip: '192.168.1.' + (100 + this.containers.length),
                cpu: '0%',
                memory: '0MB',
                uptime: '0m'
            });
            
            this.renderContainers();
            this.updateStatusBar();
        } catch (error) {
            throw new Error(`Failed to create container: ${error.message}`);
        }
    }

    async deleteContainer(name) {
        if (!confirm(`Are you sure you want to delete container "${name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            // Simulate API call
            await this.simulateApiCall('delete', { name });
            
            // Remove from local state
            this.containers = this.containers.filter(c => c.name !== name);
            
            this.renderContainers();
            this.updateStatusBar();
            this.showNotification(`Container "${name}" deleted successfully`, 'success');
        } catch (error) {
            this.showNotification(`Failed to delete container: ${error.message}`, 'error');
        }
    }

    async startContainer(name) {
        try {
            // Simulate API call
            await this.simulateApiCall('start', { name });
            
            // Update local state
            const container = this.containers.find(c => c.name === name);
            if (container) {
                container.status = 'running';
                container.uptime = '0m';
            }
            
            this.renderContainers();
            this.updateStatusBar();
            this.showNotification(`Container "${name}" started`, 'success');
        } catch (error) {
            this.showNotification(`Failed to start container: ${error.message}`, 'error');
        }
    }

    async restartContainer(name) {
        try {
            // Simulate API call
            await this.simulateApiCall('restart', { name });
            this.showNotification(`Container "${name}" restarted`, 'success');
        } catch (error) {
            this.showNotification(`Failed to restart container: ${error.message}`, 'error');
        }
    }

    async connectToContainer(name) {
        try {
            // In a real implementation, this might open a terminal in a new tab
            // or establish a WebSocket connection for terminal access
            this.showNotification(`Opening connection to "${name}"...`, 'success');
            
            // Simulate opening a new terminal window/tab
            setTimeout(() => {
                this.showNotification(`Connected to "${name}"`, 'success');
            }, 1000);
        } catch (error) {
            this.showNotification(`Failed to connect to container: ${error.message}`, 'error');
        }
    }

    async setupPortForward(containerName, hostPort, containerPort) {
        try {
            // Simulate API call
            await this.simulateApiCall('portforward', { 
                container: containerName, 
                hostPort, 
                containerPort 
            });
            
            this.showNotification(
                `Port forwarding setup: ${hostPort} → ${containerName}:${containerPort}`, 
                'success'
            );
        } catch (error) {
            throw new Error(`Failed to setup port forwarding: ${error.message}`);
        }
    }

    async setupNetwork() {
        try {
            // Simulate API call
            await this.simulateApiCall('network-setup');
            this.showNotification('Network setup completed successfully', 'success');
        } catch (error) {
            this.showNotification(`Network setup failed: ${error.message}`, 'error');
        }
    }

    /**
     * Simulate API calls with random delays and potential failures
     */
    async simulateApiCall(action, data = null) {
        return new Promise((resolve, reject) => {
            const delay = Math.random() * 1000 + 500; // 500-1500ms delay
            
            setTimeout(() => {
                // Simulate occasional failures (10% chance)
                if (Math.random() < 0.1) {
                    reject(new Error('Simulated API error'));
                } else {
                    resolve({ success: true, action, data });
                }
            }, delay);
        });
    }

    /**
     * Modal Management
     */
    openCreateModal() {
        const modal = document.getElementById('createModal');
        modal.classList.add('active');
        
        // Focus on first input
        setTimeout(() => {
            document.getElementById('containerName').focus();
        }, 300);
    }

    closeCreateModal() {
        const modal = document.getElementById('createModal');
        modal.classList.remove('active');
        
        // Reset form
        document.getElementById('createContainerForm').reset();
    }

    openPortForwardModal(containerName) {
        const modal = document.getElementById('portForwardModal');
        document.getElementById('portForwardContainer').value = containerName;
        modal.classList.add('active');
        
        // Update modal title
        modal.querySelector('h2').textContent = `Port Forward - ${containerName}`;
    }

    closePortForwardModal() {
        const modal = document.getElementById('portForwardModal');
        modal.classList.remove('active');
        
        // Reset form
        document.getElementById('portForwardForm').reset();
    }

    openNetworkModal() {
        const modal = document.getElementById('networkModal');
        modal.classList.add('active');
    }

    closeNetworkModal() {
        const modal = document.getElementById('networkModal');
        modal.classList.remove('active');
    }

    closeAllModals() {
        const modals = document.querySelectorAll('.modal-overlay');
        modals.forEach(modal => modal.classList.remove('active'));
    }

    /**
     * Form Handlers
     */
    async handleCreateContainer(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const name = formData.get('containerName');
        const os = formData.get('containerOS');
        
        // Validate input
        if (!name || !os) {
            this.showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        // Check for duplicate names
        if (this.containers.find(c => c.name === name)) {
            this.showNotification('Container name already exists', 'error');
            return;
        }
        
        // Show loading state
        const submitBtn = form.querySelector('button[type="submit"]');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoader = submitBtn.querySelector('.btn-loader');
        
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-flex';
        submitBtn.disabled = true;
        
        try {
            await this.createContainer(name, os);
            this.closeCreateModal();
        } catch (error) {
            this.showNotification(error.message, 'error');
        } finally {
            // Reset loading state
            btnText.style.display = 'inline';
            btnLoader.style.display = 'none';
            submitBtn.disabled = false;
        }
    }

    async handlePortForward(event) {
        event.preventDefault();
        
        const form = event.target;
        const formData = new FormData(form);
        const containerName = formData.get('container') || document.getElementById('portForwardContainer').value;
        const hostPort = formData.get('hostPort');
        const containerPort = formData.get('containerPort');
        
        try {
            await this.setupPortForward(containerName, hostPort, containerPort);
            this.closePortForwardModal();
        } catch (error) {
            this.showNotification(error.message, 'error');
        }
    }

    /**
     * Notification System
     */
    showNotification(message, type = 'info', duration = 5000) {
        const notifications = document.getElementById('notifications');
        const notification = document.createElement('div');
        
        notification.className = `notification ${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <div class="notification-icon">
                    ${this.getNotificationIcon(type)}
                </div>
                <div class="notification-text">
                    <div class="notification-message">${message}</div>
                </div>
            </div>
        `;
        
        notifications.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => notification.classList.add('show'), 100);
        
        // Auto-remove after duration
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    getNotificationIcon(type) {
        const icons = {
            success: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981">
                        <polyline points="20,6 9,17 4,12"></polyline>
                      </svg>`,
            error: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#EF4444">
                     <circle cx="12" cy="12" r="10"></circle>
                     <line x1="15" y1="9" x2="9" y2="15"></line>
                     <line x1="9" y1="9" x2="15" y2="15"></line>
                   </svg>`,
            warning: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B">
                       <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                       <line x1="12" y1="9" x2="12" y2="13"></line>
                       <line x1="12" y1="17" x2="12.01" y2="17"></line>
                     </svg>`,
            info: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00D4FF">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>`
        };
        
        return icons[type] || icons.info;
    }

    /**
     * Loading States
     */
    showLoading() {
        document.getElementById('loadingOverlay').style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loadingOverlay').style.display = 'none';
    }
}

// Global functions for button event handlers
window.openCreateModal = () => lxcManager.openCreateModal();
window.closeCreateModal = () => lxcManager.closeCreateModal();
window.openNetworkModal = () => lxcManager.openNetworkModal();
window.closeNetworkModal = () => lxcManager.closeNetworkModal();
window.closePortForwardModal = () => lxcManager.closePortForwardModal();
window.setupNetwork = () => lxcManager.setupNetwork();

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.lxcManager = new LXCManager();
});

// Handle application visibility changes for connection management
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Optionally pause updates when tab is hidden
    } else {
        // Refresh data when tab becomes visible
        if (window.lxcManager) {
            window.lxcManager.refreshContainers();
        }
    }
});

// Handle window beforeunload for cleanup
window.addEventListener('beforeunload', () => {
    if (window.lxcManager && window.lxcManager.websocket) {
        window.lxcManager.websocket.close();
    }
});