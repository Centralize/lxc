# LXC Tools Backend API Documentation

## Overview

This API server provides a RESTful interface and WebSocket support for managing LXC containers through the LXC Tools collection of Bash scripts.

## Quick Start

```bash
# Setup environment and dependencies
./start-server.sh setup

# Start the server
./start-server.sh start

# Check status
./start-server.sh status

# View logs
./start-server.sh logs
```

## Configuration

Environment variables:
- `LXC_API_HOST`: Server host (default: 0.0.0.0)
- `LXC_API_PORT`: Server port (default: 5000)
- `LXC_API_DEBUG`: Enable debug mode (default: false)

## REST API Endpoints

### Health Check
- **GET** `/api/health`
- Returns server health status

### Container Management

#### List Containers
- **GET** `/api/containers`
- Returns list of all LXC containers

#### Create Container
- **POST** `/api/containers`
- Body: `{"name": "container-name", "image": "ubuntu:20.04"}`
- Creates a new LXC container

#### Delete Container
- **DELETE** `/api/containers/{name}`
- Deletes specified container

#### Restart Container
- **POST** `/api/containers/{name}/restart`
- Restarts specified container

#### Get Connection Info
- **POST** `/api/containers/{name}/connect`
- Returns connection details for the container

### Image Management

#### List Images
- **GET** `/api/images`
- Returns list of available LXC images

### Network Management

#### Setup Network
- **POST** `/api/network/setup`
- Configures macvlan network for containers

### SSH Key Management

#### Deploy SSH Keys
- **POST** `/api/containers/{name}/authkey`
- Deploys SSH authorization keys to container

### Port Forwarding

#### Create Port Forward
- **POST** `/api/containers/{name}/portforward`
- Body: `{"name": "rule-name"}`
- Creates port forwarding rule for container

## WebSocket Events

Connect to `/` with Socket.IO client for real-time updates.

### Client Events
- `connect`: Join the server
- `join_room`: Join a specific room
- `leave_room`: Leave a room

### Server Events
- `connected`: Connection confirmation
- `container_update`: Real-time container operation updates

Update event types:
- `container_create_start/success/error`
- `container_delete_start/success/error`
- `container_restart_start/success/error`
- `network_setup_start/success/error`
- `authkey_deploy_start/success/error`
- `portforward_create_start/success/error`

## Error Handling

All endpoints return appropriate HTTP status codes:
- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `500`: Internal Server Error

Error responses include:
```json
{
  "error": "Error description",
  "details": "Additional error details"
}
```

## Security Features

- Input validation and sanitization
- Container/image name validation
- Command injection prevention
- Proper error handling and logging
- Timeout handling for long-running operations

## Example Usage

### JavaScript/Fetch API
```javascript
// List containers
const response = await fetch('http://localhost:5000/api/containers');
const containers = await response.json();

// Create container
const createResponse = await fetch('http://localhost:5000/api/containers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'my-container', image: 'ubuntu:20.04' })
});
```

### WebSocket (Socket.IO)
```javascript
const socket = io('http://localhost:5000');

socket.on('connected', (data) => {
  console.log('Connected to server');
});

socket.on('container_update', (data) => {
  console.log('Container update:', data);
});
```

### cURL Examples
```bash
# Health check
curl http://localhost:5000/api/health

# List containers
curl http://localhost:5000/api/containers

# Create container
curl -X POST http://localhost:5000/api/containers \
  -H "Content-Type: application/json" \
  -d '{"name": "test-container", "image": "ubuntu:20.04"}'

# Delete container
curl -X DELETE http://localhost:5000/api/containers/test-container
```

## Logging

All operations are logged to:
- Console output (when running in foreground)
- `lxc-api.log` file (when running as daemon)

Log levels include INFO, WARNING, and ERROR messages with timestamps.

## Development

### Development Mode
```bash
# Start in development mode with auto-reload and debug logging
./start-server.sh dev
```

### Dependencies
See `requirements.txt` for Python dependencies. Main components:
- Flask: Web framework
- Flask-CORS: CORS support
- Flask-SocketIO: WebSocket support
- psutil: System monitoring

### Testing
The server includes comprehensive error handling and validation. All LXC commands are executed safely with proper timeout handling.