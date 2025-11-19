const express = require('express');
const bodyParser = require('body-parser');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const MAP_DIR = process.env.MAP_DIR || '/etc/nginx/mapped-urls';
const DOMAIN = process.env.DOMAIN || 'gkgpt.in';

// Middleware
app.use(bodyParser.json());

// Ensure map directory exists (if running locally for testing, might fail if no permissions, handled in logic)
// In production, this dir should be created by the setup script or manually as per instructions.

app.post('/api/add-url', (req, res) => {
    const { runpodUrl } = req.body;

    if (!runpodUrl) {
        return res.status(400).json({ error: 'runpodUrl is required' });
    }

    // Basic validation of URL
    try {
        new URL(runpodUrl);
    } catch (e) {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    // Generate 6-char ID
    const id = crypto.randomBytes(4).toString('hex').slice(0, 6);
    const confFile = path.join(MAP_DIR, `${id}.conf`);

    // Extract host for headers
    let runpodHost = '';
    try {
        const urlObj = new URL(runpodUrl);
        runpodHost = urlObj.hostname;
    } catch (e) {
        // Should be caught above, but safe fallback
        return res.status(400).json({ error: 'Invalid URL hostname' });
    }

    const configContent = `location /${id}/ {
    rewrite ^/${id}/(.*)$ /$1 break;
    proxy_pass ${runpodUrl};

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_ssl_server_name on;
    proxy_ssl_name ${runpodHost};

    proxy_set_header Host ${runpodHost};
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 3600;
    proxy_send_timeout 3600;
    proxy_buffering off;
}
`;

    // Write file
    try {
        // Check if we are in dry-run mode or local test
        if (process.env.DRY_RUN === 'true') {
            console.log(`[DRY RUN] Would write to ${confFile}:`);
            console.log(configContent);
            console.log(`[DRY RUN] Would reload nginx`);
            return res.json({
                success: true,
                id: id,
                publicUrl: `http://${DOMAIN}/${id}/`,
                targetUrl: runpodUrl,
                message: 'Dry run successful'
            });
        }

        fs.writeFileSync(confFile, configContent);

        // Reload Nginx
        exec('sudo nginx -t && sudo systemctl reload nginx', (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return res.status(500).json({ error: 'Failed to reload Nginx', details: stderr });
            }
            
            res.json({
                success: true,
                id: id,
                publicUrl: `http://${DOMAIN}/${id}/`,
                targetUrl: runpodUrl
            });
        });

    } catch (err) {
        console.error('File write error:', err);
        return res.status(500).json({ error: 'Failed to write config file', details: err.message });
    }
});

app.get('/health', (req, res) => {
    res.send('Server is running');
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Mapping directory: ${MAP_DIR}`);
});
