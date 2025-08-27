#!/bin/bash

# LXC Tools Backend API Server Startup Script
# This script handles the setup and startup of the Flask API server

set -e  # Exit on any error

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$SCRIPT_DIR/venv"
PYTHON_EXEC="python3"
PID_FILE="$SCRIPT_DIR/lxc-api.pid"
LOG_FILE="$SCRIPT_DIR/lxc-api.log"

# Default configuration (can be overridden by environment variables)
export LXC_API_HOST="${LXC_API_HOST:-0.0.0.0}"
export LXC_API_PORT="${LXC_API_PORT:-5000}"
export LXC_API_DEBUG="${LXC_API_DEBUG:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root (required for some LXC operations)
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        print_warning "Running as root. This is required for some LXC operations."
    else
        print_warning "Not running as root. Some operations may require sudo privileges."
    fi
}

# Check if Python 3 is available
check_python() {
    if ! command -v python3 &> /dev/null; then
        print_error "Python 3 is not installed or not in PATH"
        exit 1
    fi
    
    print_status "Using Python: $(python3 --version)"
}

# Check if LXC is installed
check_lxc() {
    if ! command -v lxc &> /dev/null; then
        print_error "LXC is not installed or not in PATH"
        print_error "Please install LXC first: sudo apt install lxd"
        exit 1
    fi
    
    print_status "LXC version: $(lxc version | head -1)"
}

# Setup Python virtual environment
setup_venv() {
    if [[ ! -d "$VENV_DIR" ]]; then
        print_status "Creating Python virtual environment..."
        python3 -m venv "$VENV_DIR"
        print_success "Virtual environment created"
    fi
    
    print_status "Activating virtual environment..."
    source "$VENV_DIR/bin/activate"
    
    print_status "Installing/updating dependencies..."
    pip install --upgrade pip
    pip install -r "$SCRIPT_DIR/requirements.txt"
    print_success "Dependencies installed"
}

# Check if server is already running
is_server_running() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE")
        if ps -p "$pid" > /dev/null 2>&1; then
            return 0
        else
            rm -f "$PID_FILE"
            return 1
        fi
    fi
    return 1
}

# Start the server
start_server() {
    if is_server_running; then
        print_warning "Server is already running (PID: $(cat "$PID_FILE"))"
        return 0
    fi
    
    print_status "Starting LXC API Server on ${LXC_API_HOST}:${LXC_API_PORT}..."
    
    # Make sure log file exists
    touch "$LOG_FILE"
    
    # Start server in background
    nohup python3 "$SCRIPT_DIR/server.py" >> "$LOG_FILE" 2>&1 &
    local server_pid=$!
    
    # Save PID
    echo "$server_pid" > "$PID_FILE"
    
    # Wait a moment and check if it's still running
    sleep 2
    if ps -p "$server_pid" > /dev/null 2>&1; then
        print_success "Server started successfully (PID: $server_pid)"
        print_status "Server running on http://${LXC_API_HOST}:${LXC_API_PORT}"
        print_status "Logs available at: $LOG_FILE"
    else
        print_error "Server failed to start. Check logs: $LOG_FILE"
        rm -f "$PID_FILE"
        exit 1
    fi
}

# Stop the server
stop_server() {
    if ! is_server_running; then
        print_warning "Server is not running"
        return 0
    fi
    
    local pid=$(cat "$PID_FILE")
    print_status "Stopping server (PID: $pid)..."
    
    kill "$pid"
    sleep 2
    
    if ps -p "$pid" > /dev/null 2>&1; then
        print_warning "Server didn't stop gracefully, forcing termination..."
        kill -9 "$pid"
    fi
    
    rm -f "$PID_FILE"
    print_success "Server stopped"
}

# Show server status
show_status() {
    if is_server_running; then
        local pid=$(cat "$PID_FILE")
        print_success "Server is running (PID: $pid)"
        print_status "Server URL: http://${LXC_API_HOST}:${LXC_API_PORT}"
        print_status "Health check: curl http://${LXC_API_HOST}:${LXC_API_PORT}/api/health"
    else
        print_warning "Server is not running"
    fi
}

# Show logs
show_logs() {
    if [[ -f "$LOG_FILE" ]]; then
        tail -f "$LOG_FILE"
    else
        print_error "Log file not found: $LOG_FILE"
        exit 1
    fi
}

# Install system dependencies (Ubuntu/Debian)
install_deps() {
    print_status "Installing system dependencies..."
    
    # Check if running on Ubuntu/Debian
    if command -v apt-get &> /dev/null; then
        sudo apt-get update
        sudo apt-get install -y python3 python3-pip python3-venv lxd
        print_success "System dependencies installed"
    else
        print_error "This script only supports Ubuntu/Debian systems"
        print_error "Please install the following manually: python3, python3-pip, python3-venv, lxd"
        exit 1
    fi
}

# Development mode (with auto-reload)
dev_mode() {
    print_status "Starting server in development mode..."
    export LXC_API_DEBUG="true"
    
    source "$VENV_DIR/bin/activate" 2>/dev/null || {
        print_error "Virtual environment not found. Run 'setup' first."
        exit 1
    }
    
    python3 "$SCRIPT_DIR/server.py"
}

# Show usage information
show_usage() {
    echo "LXC Tools Backend API Server"
    echo ""
    echo "Usage: $0 {start|stop|restart|status|logs|setup|install-deps|dev|help}"
    echo ""
    echo "Commands:"
    echo "  start         Start the API server"
    echo "  stop          Stop the API server"
    echo "  restart       Restart the API server"
    echo "  status        Show server status"
    echo "  logs          Show server logs (tail -f)"
    echo "  setup         Setup Python virtual environment and dependencies"
    echo "  install-deps  Install system dependencies (Ubuntu/Debian only)"
    echo "  dev           Start server in development mode (with debug)"
    echo "  help          Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  LXC_API_HOST     Server host (default: 0.0.0.0)"
    echo "  LXC_API_PORT     Server port (default: 5000)"
    echo "  LXC_API_DEBUG    Enable debug mode (default: false)"
    echo ""
    echo "Examples:"
    echo "  $0 setup                    # Setup environment"
    echo "  $0 start                    # Start server"
    echo "  LXC_API_PORT=8080 $0 start  # Start on port 8080"
    echo "  $0 dev                      # Development mode"
}

# Main command handler
case "${1:-help}" in
    "start")
        check_permissions
        check_python
        check_lxc
        source "$VENV_DIR/bin/activate" 2>/dev/null || {
            print_error "Virtual environment not found. Run '$0 setup' first."
            exit 1
        }
        start_server
        ;;
    "stop")
        stop_server
        ;;
    "restart")
        stop_server
        sleep 1
        check_permissions
        check_python
        check_lxc
        source "$VENV_DIR/bin/activate"
        start_server
        ;;
    "status")
        show_status
        ;;
    "logs")
        show_logs
        ;;
    "setup")
        check_python
        setup_venv
        print_success "Setup complete! You can now run '$0 start' to start the server."
        ;;
    "install-deps")
        install_deps
        ;;
    "dev")
        check_permissions
        check_python
        check_lxc
        dev_mode
        ;;
    "help"|"--help"|"-h")
        show_usage
        ;;
    *)
        print_error "Unknown command: $1"
        show_usage
        exit 1
        ;;
esac