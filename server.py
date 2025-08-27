#!/usr/bin/env python3
"""
LXC Tools Backend API Server
A robust Flask-based API server for managing LXC containers through web interface.
"""

import os
import sys
import json
import logging
import subprocess
import threading
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room
import psutil


class LxcApiServer:
    def __init__(self):
        self.app = Flask(__name__)
        self.app.config['SECRET_KEY'] = 'lxc-tools-secret-key-change-in-production'
        
        # Enable CORS for all routes
        CORS(self.app, cors_allowed_origins="*")
        
        # Initialize SocketIO with CORS support
        self.socketIo = SocketIO(
            self.app, 
            cors_allowed_origins="*",
            async_mode='threading',
            logger=True,
            engineio_logger=True
        )
        
        # Setup logging
        self.setupLogging()
        
        # Get project root directory
        self.projectRoot = os.path.dirname(os.path.abspath(__file__))
        
        # Active command processes
        self.activeProcesses: Dict[str, subprocess.Popen] = {}
        
        # Setup routes
        self.setupRoutes()
        self.setupSocketEvents()
        
        self.logger.info("LXC API Server initialized")

    def setupLogging(self):
        """Configure application logging."""
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.StreamHandler(sys.stdout),
                logging.FileHandler('lxc-api.log')
            ]
        )
        self.logger = logging.getLogger('lxc-api')

    def validateContainerName(self, name: str) -> bool:
        """Validate container name to prevent command injection."""
        if not name or not isinstance(name, str):
            return False
        # Only allow alphanumeric chars, dashes, and underscores
        return name.replace('-', '').replace('_', '').isalnum() and len(name) <= 64

    def validateImageName(self, image: str) -> bool:
        """Validate image name format."""
        if not image or not isinstance(image, str):
            return False
        # Basic validation for image names (ubuntu:20.04, etc.)
        return len(image) <= 128 and ':' in image and image.count(':') <= 2

    def executeCommand(self, command: List[str], timeout: int = 30, requireSudo: bool = False) -> Tuple[bool, str, str]:
        """
        Safely execute shell commands with proper error handling.
        
        Args:
            command: List of command components
            timeout: Command timeout in seconds
            requireSudo: Whether command requires sudo privileges
            
        Returns:
            Tuple of (success, stdout, stderr)
        """
        try:
            if requireSudo and command[0] != 'sudo':
                command = ['sudo'] + command
                
            self.logger.info(f"Executing command: {' '.join(command)}")
            
            result = subprocess.run(
                command,
                cwd=self.projectRoot,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False
            )
            
            success = result.returncode == 0
            stdout = result.stdout.strip()
            stderr = result.stderr.strip()
            
            if not success:
                self.logger.error(f"Command failed: {' '.join(command)}, stderr: {stderr}")
            
            return success, stdout, stderr
            
        except subprocess.TimeoutExpired:
            self.logger.error(f"Command timed out: {' '.join(command)}")
            return False, "", "Command timed out"
        except Exception as e:
            self.logger.error(f"Command execution error: {str(e)}")
            return False, "", str(e)

    def executeScript(self, scriptName: str, args: List[str] = None, timeout: int = 60) -> Tuple[bool, str, str]:
        """Execute LXC script with arguments."""
        scriptPath = os.path.join(self.projectRoot, scriptName)
        
        if not os.path.exists(scriptPath):
            return False, "", f"Script {scriptName} not found"
            
        if not os.access(scriptPath, os.X_OK):
            return False, "", f"Script {scriptName} is not executable"
            
        command = [scriptPath]
        if args:
            command.extend(args)
            
        requireSudo = scriptName in ['lstImages', 'setupNetwork']
        return self.executeCommand(command, timeout, requireSudo)

    def broadcastUpdate(self, eventType: str, data: Dict):
        """Broadcast updates to all connected WebSocket clients."""
        try:
            self.socketIo.emit('container_update', {
                'type': eventType,
                'data': data,
                'timestamp': datetime.utcnow().isoformat()
            })
        except Exception as e:
            self.logger.error(f"Failed to broadcast update: {str(e)}")

    def setupRoutes(self):
        """Setup all API routes."""
        
        @self.app.route('/api/health', methods=['GET'])
        def healthCheck():
            """Health check endpoint."""
            return jsonify({
                'status': 'healthy',
                'timestamp': datetime.utcnow().isoformat(),
                'version': '1.0.0'
            })

        @self.app.route('/api/containers', methods=['GET'])
        def listContainers():
            """List all LXC containers."""
            try:
                success, stdout, stderr = self.executeScript('lx')
                
                if not success:
                    return jsonify({
                        'error': 'Failed to list containers',
                        'details': stderr
                    }), 500
                
                # Parse LXC list output (basic parsing)
                containers = []
                lines = stdout.split('\n')
                
                for line in lines[3:]:  # Skip header lines
                    if line.strip() and '|' in line:
                        parts = [p.strip() for p in line.split('|')]
                        if len(parts) >= 4 and parts[1]:  # Has container name
                            containers.append({
                                'name': parts[1],
                                'state': parts[2] if len(parts) > 2 else 'unknown',
                                'ipv4': parts[3] if len(parts) > 3 else '',
                                'ipv6': parts[4] if len(parts) > 4 else '',
                                'type': parts[5] if len(parts) > 5 else 'container'
                            })
                
                return jsonify({
                    'containers': containers,
                    'count': len(containers)
                })
                
            except Exception as e:
                self.logger.error(f"Error listing containers: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/containers', methods=['POST'])
        def createContainer():
            """Create a new LXC container."""
            try:
                data = request.get_json()
                
                if not data or 'image' not in data or 'name' not in data:
                    return jsonify({'error': 'Missing required fields: image, name'}), 400
                
                containerName = data['name']
                image = data['image']
                
                if not self.validateContainerName(containerName):
                    return jsonify({'error': 'Invalid container name'}), 400
                
                if not self.validateImageName(image):
                    return jsonify({'error': 'Invalid image name'}), 400
                
                # Broadcast start event
                self.broadcastUpdate('container_create_start', {
                    'name': containerName,
                    'image': image
                })
                
                success, stdout, stderr = self.executeScript('newlx', [image, containerName], timeout=120)
                
                if success:
                    self.broadcastUpdate('container_create_success', {
                        'name': containerName,
                        'image': image
                    })
                    return jsonify({
                        'message': f'Container {containerName} created successfully',
                        'name': containerName,
                        'image': image
                    }), 201
                else:
                    self.broadcastUpdate('container_create_error', {
                        'name': containerName,
                        'error': stderr
                    })
                    return jsonify({
                        'error': 'Failed to create container',
                        'details': stderr
                    }), 500
                    
            except Exception as e:
                self.logger.error(f"Error creating container: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/containers/<containerName>', methods=['DELETE'])
        def deleteContainer(containerName):
            """Delete an LXC container."""
            try:
                if not self.validateContainerName(containerName):
                    return jsonify({'error': 'Invalid container name'}), 400
                
                self.broadcastUpdate('container_delete_start', {'name': containerName})
                
                success, stdout, stderr = self.executeScript('rmlx', [containerName])
                
                if success:
                    self.broadcastUpdate('container_delete_success', {'name': containerName})
                    return jsonify({'message': f'Container {containerName} deleted successfully'})
                else:
                    self.broadcastUpdate('container_delete_error', {
                        'name': containerName,
                        'error': stderr
                    })
                    return jsonify({
                        'error': 'Failed to delete container',
                        'details': stderr
                    }), 500
                    
            except Exception as e:
                self.logger.error(f"Error deleting container: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/containers/<containerName>/restart', methods=['POST'])
        def restartContainer(containerName):
            """Restart an LXC container."""
            try:
                if not self.validateContainerName(containerName):
                    return jsonify({'error': 'Invalid container name'}), 400
                
                self.broadcastUpdate('container_restart_start', {'name': containerName})
                
                success, stdout, stderr = self.executeScript('redolx', [containerName])
                
                if success:
                    self.broadcastUpdate('container_restart_success', {'name': containerName})
                    return jsonify({'message': f'Container {containerName} restarted successfully'})
                else:
                    self.broadcastUpdate('container_restart_error', {
                        'name': containerName,
                        'error': stderr
                    })
                    return jsonify({
                        'error': 'Failed to restart container',
                        'details': stderr
                    }), 500
                    
            except Exception as e:
                self.logger.error(f"Error restarting container: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/containers/<containerName>/connect', methods=['POST'])
        def getConnectionInfo(containerName):
            """Get connection information for a container."""
            try:
                if not self.validateContainerName(containerName):
                    return jsonify({'error': 'Invalid container name'}), 400
                
                # Get container info
                success, stdout, stderr = self.executeCommand(['lxc', 'info', containerName])
                
                if not success:
                    return jsonify({
                        'error': 'Failed to get container info',
                        'details': stderr
                    }), 500
                
                # Parse container info to extract IP
                ipAddress = None
                for line in stdout.split('\n'):
                    if 'inet' in line and 'global' in line:
                        parts = line.strip().split()
                        if len(parts) >= 2:
                            ipAddress = parts[1].split('/')[0]
                            break
                
                return jsonify({
                    'name': containerName,
                    'ipAddress': ipAddress,
                    'connectionCommand': f'lxc exec {containerName} -- /bin/bash',
                    'sshCommand': f'ssh root@{ipAddress}' if ipAddress else None
                })
                
            except Exception as e:
                self.logger.error(f"Error getting connection info: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/images', methods=['GET'])
        def listImages():
            """List available LXC images."""
            try:
                success, stdout, stderr = self.executeScript('lstImages')
                
                if not success:
                    return jsonify({
                        'error': 'Failed to list images',
                        'details': stderr
                    }), 500
                
                # Parse image list output
                images = []
                lines = stdout.split('\n')
                
                for line in lines[3:]:  # Skip header lines
                    if line.strip() and '|' in line:
                        parts = [p.strip() for p in line.split('|')]
                        if len(parts) >= 3 and parts[1]:  # Has alias
                            images.append({
                                'alias': parts[1],
                                'fingerprint': parts[2] if len(parts) > 2 else '',
                                'public': parts[3] if len(parts) > 3 else '',
                                'description': parts[4] if len(parts) > 4 else '',
                                'architecture': parts[5] if len(parts) > 5 else '',
                                'size': parts[6] if len(parts) > 6 else ''
                            })
                
                return jsonify({
                    'images': images,
                    'count': len(images)
                })
                
            except Exception as e:
                self.logger.error(f"Error listing images: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/network/setup', methods=['POST'])
        def setupNetwork():
            """Setup macvlan network for containers."""
            try:
                self.broadcastUpdate('network_setup_start', {})
                
                success, stdout, stderr = self.executeScript('setupNetwork')
                
                if success:
                    self.broadcastUpdate('network_setup_success', {})
                    return jsonify({'message': 'Network setup completed successfully'})
                else:
                    self.broadcastUpdate('network_setup_error', {'error': stderr})
                    return jsonify({
                        'error': 'Failed to setup network',
                        'details': stderr
                    }), 500
                    
            except Exception as e:
                self.logger.error(f"Error setting up network: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/containers/<containerName>/authkey', methods=['POST'])
        def deployAuthKey(containerName):
            """Deploy SSH authorization keys to container."""
            try:
                if not self.validateContainerName(containerName):
                    return jsonify({'error': 'Invalid container name'}), 400
                
                self.broadcastUpdate('authkey_deploy_start', {'name': containerName})
                
                success, stdout, stderr = self.executeScript('authkey', [containerName])
                
                if success:
                    self.broadcastUpdate('authkey_deploy_success', {'name': containerName})
                    return jsonify({'message': f'SSH keys deployed to {containerName} successfully'})
                else:
                    self.broadcastUpdate('authkey_deploy_error', {
                        'name': containerName,
                        'error': stderr
                    })
                    return jsonify({
                        'error': 'Failed to deploy SSH keys',
                        'details': stderr
                    }), 500
                    
            except Exception as e:
                self.logger.error(f"Error deploying auth key: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

        @self.app.route('/api/containers/<containerName>/portforward', methods=['POST'])
        def createPortForward(containerName):
            """Create port forwarding rule for container."""
            try:
                if not self.validateContainerName(containerName):
                    return jsonify({'error': 'Invalid container name'}), 400
                
                data = request.get_json()
                if not data or 'name' not in data:
                    return jsonify({'error': 'Missing required field: name'}), 400
                
                ruleName = data['name']
                if not ruleName.replace('-', '').replace('_', '').isalnum():
                    return jsonify({'error': 'Invalid rule name'}), 400
                
                self.broadcastUpdate('portforward_create_start', {
                    'container': containerName,
                    'rule': ruleName
                })
                
                success, stdout, stderr = self.executeScript('pflx', [containerName, ruleName])
                
                if success:
                    self.broadcastUpdate('portforward_create_success', {
                        'container': containerName,
                        'rule': ruleName
                    })
                    return jsonify({
                        'message': f'Port forward rule {ruleName} created for {containerName}'
                    })
                else:
                    self.broadcastUpdate('portforward_create_error', {
                        'container': containerName,
                        'error': stderr
                    })
                    return jsonify({
                        'error': 'Failed to create port forward',
                        'details': stderr
                    }), 500
                    
            except Exception as e:
                self.logger.error(f"Error creating port forward: {str(e)}")
                return jsonify({'error': 'Internal server error'}), 500

    def setupSocketEvents(self):
        """Setup WebSocket event handlers."""
        
        @self.socketIo.on('connect')
        def handleConnect():
            """Handle client connection."""
            self.logger.info(f"Client connected: {request.sid}")
            emit('connected', {'message': 'Connected to LXC API Server'})
        
        @self.socketIo.on('disconnect')
        def handleDisconnect():
            """Handle client disconnection."""
            self.logger.info(f"Client disconnected: {request.sid}")
        
        @self.socketIo.on('join_room')
        def handleJoinRoom(data):
            """Handle room join requests."""
            room = data.get('room', 'default')
            join_room(room)
            self.logger.info(f"Client {request.sid} joined room {room}")
            emit('joined_room', {'room': room})
        
        @self.socketIo.on('leave_room')
        def handleLeaveRoom(data):
            """Handle room leave requests."""
            room = data.get('room', 'default')
            leave_room(room)
            self.logger.info(f"Client {request.sid} left room {room}")
            emit('left_room', {'room': room})

    def run(self, host='0.0.0.0', port=5000, debug=False):
        """Run the Flask application with SocketIO."""
        self.logger.info(f"Starting LXC API Server on {host}:{port}")
        self.socketIo.run(self.app, host=host, port=port, debug=debug)


def main():
    """Main entry point."""
    server = LxcApiServer()
    
    # Get configuration from environment variables
    host = os.getenv('LXC_API_HOST', '0.0.0.0')
    port = int(os.getenv('LXC_API_PORT', '5000'))
    debug = os.getenv('LXC_API_DEBUG', 'false').lower() == 'true'
    
    server.run(host=host, port=port, debug=debug)


if __name__ == '__main__':
    main()