const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashKey, authenticateKey } = require('../middleware/auth');
const router = express.Router();

const PREFIX = 'sk_live_';

const generateKey = () => {
    // Generate 32 bytes of secure random data
    const buffer = crypto.randomBytes(32);
    // Convert to base64 url-safe
    const base64UrlSafe = buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
    return `${PREFIX}${base64UrlSafe}`;
};

// Issue a new API key
router.post('/tenants/:tenantId/keys', async (req, res) => {
    const { tenantId } = req.params;
    const { rateLimitPerMinute = 100 } = req.body;

    const apiKey = generateKey();
    const keyHash = hashKey(apiKey);
    const lastFour = apiKey.slice(-4);

    try {
        const result = await db.query(
            `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, last_four, rate_limit_per_minute) 
             VALUES ($1, $2, $3, $4, $5) RETURNING id, last_four, rate_limit_per_minute`,
            [tenantId, keyHash, PREFIX, lastFour, rateLimitPerMinute]
        );

        const keyRecord = result.rows[0];
        
        res.status(201).json({
            apiKey,
            keyRecord: {
                id: keyRecord.id,
                lastFour: keyRecord.last_four,
                rateLimitPerMinute: keyRecord.rate_limit_per_minute
            }
        });
    } catch (err) {
        console.error('Error generating key:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// List API keys
router.get('/tenants/:tenantId/keys', async (req, res) => {
    const { tenantId } = req.params;

    try {
        const result = await db.query(
            `SELECT id, key_prefix, last_four, created_at, is_active 
             FROM api_keys 
             WHERE tenant_id = $1
             ORDER BY created_at DESC`,
            [tenantId]
        );

        const keys = result.rows.map(row => ({
            id: row.id,
            maskedKey: `${row.key_prefix}...${row.last_four}`,
            createdAt: row.created_at,
            isActive: row.is_active
        }));

        res.status(200).json(keys);
    } catch (err) {
        console.error('Error listing keys:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Revoke an API key
router.delete('/keys/:keyId', async (req, res) => {
    const { keyId } = req.params;

    try {
        // Immediate revocation sets is_active to false
        await db.query(
            `UPDATE api_keys SET is_active = FALSE WHERE id = $1`,
            [keyId]
        );
        res.status(204).send();
    } catch (err) {
        console.error('Error revoking key:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Rotate an API key
router.post('/keys/:keyId/rotate', async (req, res) => {
    const { keyId } = req.params;

    try {
        // 1. Get the current key details to inherit properties
        const oldKeyResult = await db.query(
            `SELECT tenant_id, rate_limit_per_minute FROM api_keys WHERE id = $1`,
            [keyId]
        );

        if (oldKeyResult.rows.length === 0) {
            return res.status(404).json({ error: 'Key not found' });
        }

        const { tenant_id, rate_limit_per_minute } = oldKeyResult.rows[0];

        // 2. Generate new key
        const newApiKey = generateKey();
        const newKeyHash = hashKey(newApiKey);
        const newLastFour = newApiKey.slice(-4);

        // 3. Start a transaction
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            // Set old key's expiration to 1 minute from now
            await client.query(
                `UPDATE api_keys SET expires_at = NOW() + interval '1 minute' WHERE id = $1`,
                [keyId]
            );

            // Insert new key
            await client.query(
                `INSERT INTO api_keys (tenant_id, key_hash, key_prefix, last_four, rate_limit_per_minute) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [tenant_id, newKeyHash, PREFIX, newLastFour, rate_limit_per_minute]
            );

            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.status(200).json({ newApiKey });
    } catch (err) {
        console.error('Error rotating key:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get audit logs for a tenant
router.get('/tenants/:tenantId/logs', async (req, res) => {
    const { tenantId } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    try {
        const result = await db.query(
            `SELECT al.id, ak.key_prefix, ak.last_four, al.endpoint, al.status_code, al.timestamp 
             FROM audit_logs al
             JOIN api_keys ak ON al.api_key_id = ak.id
             WHERE ak.tenant_id = $1
             ORDER BY al.timestamp DESC
             LIMIT $2 OFFSET $3`,
            [tenantId, limit, offset]
        );

        const logs = result.rows.map(row => ({
            id: row.id,
            maskedKey: `${row.key_prefix}...${row.last_four}`,
            endpoint: row.endpoint,
            statusCode: row.status_code,
            timestamp: row.timestamp
        }));

        res.status(200).json(logs);
    } catch (err) {
        console.error('Error fetching audit logs:', err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

module.exports = router;
