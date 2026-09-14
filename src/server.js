const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const db = require('./db');
const redis = require('./redis');

const keysRoutes = require('./routes/keys');
const protectedRoutes = require('./routes/protected');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint for Docker
app.get('/health', (req, res) => res.status(200).send('OK'));

// API Routes
app.use('/api', keysRoutes);
app.use('/api', protectedRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
