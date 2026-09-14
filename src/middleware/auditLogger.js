const db = require('../db');

const auditLogger = (req, res, next) => {
    // We want to log the request after it has been fully processed 
    // to capture the final status code.
    res.on('finish', async () => {
        // Only log if the request was authenticated (has req.apiKey)
        if (req.apiKey) {
            try {
                await db.query(
                    `INSERT INTO audit_logs (api_key_id, endpoint, status_code) 
                     VALUES ($1, $2, $3)`,
                    [req.apiKey.id, req.originalUrl || req.path, res.statusCode]
                );
            } catch (err) {
                console.error('Failed to write audit log:', err);
            }
        }
    });

    next();
};

module.exports = auditLogger;
