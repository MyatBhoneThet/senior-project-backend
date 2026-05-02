const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const debtController = require('../controllers/debtController');

router.use(protect);

router.get('/unread-counts', debtController.getUnreadCounts);
router.get('/', debtController.getAll);
router.post('/lend', debtController.createLend);
router.post('/borrow', debtController.createBorrow);
router.get('/:id', debtController.getOne);
router.patch('/:id', debtController.updateOne);
router.post('/:id/mark-repaid', debtController.markRepaid);
router.post('/:id/repayments', debtController.addPartialRepayment);
router.post('/:id/reminders', debtController.sendReminder);
router.post('/:id/chat', debtController.openChat);
router.get('/:id/chat/messages', debtController.getMessages);
router.post('/:id/chat/messages', debtController.sendMessage);

module.exports = router;
