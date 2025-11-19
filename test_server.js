const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

// Start server in dry-run mode
const env = { ...process.env, DRY_RUN: 'true', PORT: '3001' };
const serverProcess = spawn('node', ['server.js'], {
    cwd: __dirname,
    env: env,
    stdio: 'inherit' // Pipe output to parent to see logs
});

console.log('Starting server for testing...');

// Wait for server to start
setTimeout(() => {
    const data = JSON.stringify({
        runpodUrl: 'https://test-id.proxy.runpod.net/'
    });

    const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/add-url',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    const req = http.request(options, (res) => {
        console.log(`StatusCode: ${res.statusCode}`);
        
        let body = '';
        res.on('data', (chunk) => {
            body += chunk;
        });

        res.on('end', () => {
            console.log('Response Body:', body);
            serverProcess.kill(); // Stop server
        });
    });

    req.on('error', (error) => {
        console.error('Request error:', error);
        serverProcess.kill();
    });

    req.write(data);
    req.end();

}, 2000); // Wait 2s for server to boot
