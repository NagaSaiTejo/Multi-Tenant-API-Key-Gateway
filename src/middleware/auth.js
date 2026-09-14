const crypto = require('crypto');
const db = require('../db');

const hashKey = (key) => crypto.createHash('sha256').update(key).digest('hex');

const authenticateKey = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or invalid Authorization header' });
    }

    const providedKey = authHeader.split(' ')[1];
    const hashedProvidedKey = hashKey(providedKey);

    try {
        const result = await db.query(
            `SELECT id, tenant_id, rate_limit_per_minute 
             FROM api_keys 
             WHERE key_hash = $1 
               AND is_active = TRUE 
               AND (expires_at IS NULL OR expires_at > NOW())`,
            [hashedProvidedKey]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Unauthorized: Invalid or expired API key' });
        }

        // Attach key details to the request object for downstream use
        req.apiKey = result.rows[0];
        next();
    } catch (err) {
        console.error('Database error during authentication:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = {
    authenticateKey,
    hashKey
};
