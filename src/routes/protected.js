const express = require('express');
const { authenticateKey } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const auditLogger = require('../middleware/auditLogger');
const router = express.Router();

// Apply audit logger to protected routes so it catches responses (like 429)
router.use('/protected', authenticateKey, auditLogger, rateLimiter);

router.get('/protected', (req, res) => {
    res.status(200).json({
        message: 'You have accessed the protected endpoint successfully.',
        tenantId: req.apiKey.tenant_id,
        keyId: req.apiKey.id
    });
});

module.exports = router;
