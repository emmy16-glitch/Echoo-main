import express from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Get database status
router.get('/status', authenticate, async (req, res) => {
  try {
    const status = {
      connected: mongoose.connection.readyState === 1,
      database: mongoose.connection.name,
      host: mongoose.connection.host,
      collections: await mongoose.connection.db.listCollections().toArray(),
    };
    res.json({
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
