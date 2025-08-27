/**
 * LXC Container Management Web Interface
 * Modern JavaScript application for managing LXC containers
 */

class LXCManager {
    constructor() {
        this.apiBaseUrl = 'http://localhost:5050/api'; // Adjust based on your backend
        this.wsUrl = 'http://localhost:5050'; // SocketIO endpoint
        this.websocket = null;
        this.containers = [];
        this.availableImages = [];
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
            await this.loadAvailableImages();
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
            // SocketIO connection requires the socket.io client library
            // For now, disable WebSocket functionality
            console.log('WebSocket functionality disabled - requires socket.io client library');
            return;
            
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
            const response = await this.makeApiCall('/containers');
            this.containers = response.containers.map(container => ({
                name: container.name,
                status: container.state.toLowerCase(),
                os: container.type || 'unknown',
                ip: container.ipv4 || 'N/A',
                cpu: 'N/A',
                memory: 'N/A',
                uptime: 'N/A'
            }));
            this.renderContainers();
            this.updateStatusBar();
        } catch (error) {
            console.error('Failed to load containers:', error);
            this.showNotification('Failed to load containers', 'error');
        }
    }

    async loadAvailableImages() {
        try {
            const response = await this.makeApiCall('/images');
            this.availableImages = response.images;
            this.populateOsSelector();
        } catch (error) {
            console.error('Failed to load available images:', error);
            this.showNotification('Failed to load available images', 'error');
        }
    }

    populateOsSelector() {
        const osSelector = document.getElementById('containerOS');
        if (!osSelector) return;

        // Clear existing options except the first placeholder
        osSelector.innerHTML = '<option value="">Select OS...</option>';

        // Add options from available images
        this.availableImages.forEach(image => {
            const option = document.createElement('option');
            option.value = image.alias;
            option.textContent = `${image.alias} - ${image.description || 'LXC Image'}`;
            osSelector.appendChild(option);
        });
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
            await this.makeApiCall('/containers', 'POST', { name, image: os });
            this.showNotification(`Container "${name}" created successfully`, 'success');
            await this.loadContainers();
        } catch (error) {
            throw new Error(`Failed to create container: ${error.message}`);
        }
    }

    async deleteContainer(name) {
        if (!confirm(`Are you sure you want to delete container "${name}"? This action cannot be undone.`)) {
            return;
        }

        try {
            await this.makeApiCall(`/containers/${name}`, 'DELETE');
            this.showNotification(`Container "${name}" deleted successfully`, 'success');
            await this.loadContainers();
        } catch (error) {
            this.showNotification(`Failed to delete container: ${error.message}`, 'error');
        }
    }

    async startContainer(name) {
        try {
            await this.makeApiCall(`/containers/${name}/start`, 'POST');
            this.showNotification(`Container "${name}" started`, 'success');
            await this.loadContainers();
        } catch (error) {
            this.showNotification(`Failed to start container: ${error.message}`, 'error');
        }
    }

    async restartContainer(name) {
        try {
            await this.makeApiCall(`/containers/${name}/restart`, 'POST');
            this.showNotification(`Container "${name}" restarted`, 'success');
            await this.loadContainers();
        } catch (error) {
            this.showNotification(`Failed to restart container: ${error.message}`, 'error');
        }
    }

    async connectToContainer(name) {
        try {
            const response = await this.makeApiCall(`/containers/${name}/connect`, 'POST');
            this.showNotification(`Connection info: ${response.connectionCommand}`, 'success');
        } catch (error) {
            this.showNotification(`Failed to connect to container: ${error.message}`, 'error');
        }
    }

    async setupPortForward(containerName, hostPort, containerPort) {
        try {
            await this.makeApiCall(`/containers/${containerName}/portforward`, 'POST', {
                name: `port-${hostPort}-${containerPort}`
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
            await this.makeApiCall('/network/setup', 'POST');
            this.showNotification('Network setup completed successfully', 'success');
        } catch (error) {
            this.showNotification(`Network setup failed: ${error.message}`, 'error');
        }
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