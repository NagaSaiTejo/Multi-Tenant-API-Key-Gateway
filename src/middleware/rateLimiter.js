const redis = require('../redis');

const rateLimiter = async (req, res, next) => {
    if (!req.apiKey) {
        return res.status(500).json({ error: 'Rate limiter requires authentication.' });
    }

    const keyId = req.apiKey.id;
    const rateLimit = req.apiKey.rate_limit_per_minute;
    const windowSizeInSeconds = 60;
    const windowSizeInMillis = windowSizeInSeconds * 1000;
    
    const currentTime = Date.now();
    const redisKey = `rate_limit:${keyId}`;

    try {
        // We use MULTI/EXEC for a transaction
        // a. Remove timestamps outside the current window
        // b. Add the current timestamp
        // c. Count the elements in the sorted set
        const results = await redis.multi()
            .zremrangebyscore(redisKey, 0, currentTime - windowSizeInMillis)
            .zadd(redisKey, currentTime, currentTime)
            .zcard(redisKey)
            // Optional: set expiration on the sorted set to clean up inactive keys
            .expire(redisKey, windowSizeInSeconds)
            .exec();

        // results is an array of [err, response] for each command in the transaction
        const requestCount = results[2][1];

        if (requestCount > rateLimit) {
            // Set Retry-After header. In a sliding window, we could calculate the exact time 
            // until a slot frees up, but for simplicity we'll just set it to windowSizeInSeconds
            // or a calculated value based on the oldest request.
            res.set('Retry-After', windowSizeInSeconds.toString());
            // Important: We still want to log this request, so instead of returning immediately,
            // we can set a flag and call next, or we can let auditLogger handle it as long as we don't throw.
            // Wait, the requirement says "Every request to this endpoint that passes authentication (even if it gets rate-limited) must create a new row in the audit_logs table."
            // This means we should either log it here, OR we should use next() but set something so downstream knows it's 429.
            // Actually, a better approach is to set the status code and return, but we need the audit logger to run.
            // Let's ensure the auditLogger middleware is placed AFTER rateLimiter, OR we log it right here for 429.
            // Let's handle it by attaching properties to res.locals and calling next().
            
            // Wait, Express sends response immediately if we do res.status(429).send().
            // If we use an event listener on res 'finish', we can log it!
            
            return res.status(429).json({ error: 'Too Many Requests' });
        }

        next();
    } catch (err) {
        console.error('Redis error during rate limiting:', err);
        return res.status(500).json({ error: 'Internal Server Error' });
    }
};

module.exports = rateLimiter;
