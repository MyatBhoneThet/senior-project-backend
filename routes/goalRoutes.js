// backend/routes/goalRoutes.js
const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const goalController = require('../controllers/goalController'); // <-- ADD THIS

// Order: specific paths first, then param paths
router.get('/', protect, goalController.listGoals);
router.post('/', protect, goalController.createGoal);
router.post('/auto-allocate', protect, goalController.autoAllocateNow);
router.post('/:id/fund', protect, goalController.fundGoal);
router.delete('/:id', protect, goalController.deleteGoal);

module.exports = router;
