import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// IMPORTANT: Specific routes must come BEFORE dynamic routes
// Get current user (must come before /:id)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      data: user,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users (admin only)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash');
    res.json({
      data: users,
      count: users.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID (must come AFTER specific routes)
router.get('/:id', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      data: user,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update user (PATCH)
router.patch('/:id', authenticate, async (req, res) => {
  try {
    // Only allow users to update themselves
    if (req.params.id !== req.userId.toString()) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You can only update your own profile' }
      });
    }

    const updates = req.body;
    // Allowed fields to update
    const allowedUpdates = ['displayName', 'bio', 'avatar', 'preferences'];
    
    const updateData = {};
    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        updateData[key] = updates[key];
      }
    }
    
    // Also allow profile setup fields
    if (updates.bio !== undefined) {
      updateData.bio = updates.bio;
    }
    if (updates.avatar !== undefined) {
      updateData.avatar = updates.avatar;
    }
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-passwordHash');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      data: user,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete user (soft delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    // Only allow users to delete themselves or admin
    if (req.params.id !== req.userId.toString() && !req.userRoles.includes('admin')) {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'You can only delete your own account' }
      });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.isActive = false;
    await user.save();

    res.json({
      data: { message: 'User deactivated successfully' },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
