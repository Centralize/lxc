# LXC Tools Web UI

A sleek, modern web interface for managing LXC containers with real-time updates and an intuitive user experience.

## Quick Start

### 1. Setup Backend Server
```bash
# Install dependencies and setup virtual environment
./start-server.sh setup

# Start the API server
./start-server.sh start

# Check server status
./start-server.sh status
```

### 2. Access Web Interface
Open your browser and navigate to:
- **Local Development**: Open `web/index.html` directly in your browser
- **Full Setup**: Access via `http://localhost:5000` (when served through backend)

### 3. Configure Connection
Edit `web/app.js` if needed to update server connection:
```javascript
const apiBaseUrl = 'http://localhost:5000/api';
const wsUrl = 'ws://localhost:5000';
```

## Features

### 🎨 **Modern Design**
- Dark theme with gradient backgrounds
- Responsive card-based layout
- Smooth animations and transitions
- Real-time status indicators

### 🚀 **Container Management**
- **Dashboard**: Live container overview with statistics
- **Create**: New container form with OS selection
- **Monitor**: Real-time status, CPU, memory, and uptime
- **Control**: Start, stop, restart, connect, and delete operations
- **Network**: Port forwarding and SSH key deployment

### 🔗 **Real-time Updates**
- WebSocket connection for live data
- Auto-refresh container status
- Instant notifications for operations
- Connection status indicator

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/containers` | List all containers |
| POST | `/api/containers` | Create new container |
| DELETE | `/api/containers/:name` | Delete container |
| POST | `/api/containers/:name/restart` | Restart container |
| POST | `/api/containers/:name/connect` | Get connection info |
| GET | `/api/images` | List available images |
| POST | `/api/network/setup` | Setup networking |
| POST | `/api/containers/:name/authkey` | Deploy SSH keys |
| POST | `/api/containers/:name/portforward` | Create port forward |

## File Structure

```
web/
├── index.html      # Main UI interface
├── style.css       # Modern styling with dark theme
└── app.js          # JavaScript application logic

server.py           # Flask API server
requirements.txt    # Python dependencies
start-server.sh     # Server management script
API.md              # Detailed API documentation
```

## Development

### Server Management
```bash
# Start in development mode with debug logging
./start-server.sh dev

# Stop the server
./start-server.sh stop

# Restart the server
./start-server.sh restart

# View live logs
./start-server.sh logs

# Health check
./start-server.sh health
```

### Environment Variables
```bash
export LXC_API_HOST="0.0.0.0"      # Server bind address
export LXC_API_PORT="5000"         # Server port
export LXC_API_DEBUG="false"       # Debug mode
```

## Security Notes

- Input validation prevents command injection
- CORS enabled for web UI communication
- Command timeout handling (30 seconds)
- Comprehensive error logging
- Production-ready authentication can be added

## Browser Compatibility

- Chrome/Chromium 80+
- Firefox 75+
- Safari 13+
- Edge 80+

## Keyboard Shortcuts

- `Ctrl + R` - Refresh containers
- `Ctrl + N` - Create new container
- `Esc` - Close modal dialogs

Enjoy managing your LXC containers with this modern, efficient web interface!