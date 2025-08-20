// backend/controllers/userController.js
const User = require('../models/User');
const bcrypt = require('bcryptjs');

// PUT /users/me/preferences
exports.updatePreferences = async (req, res) => {
  try {
    const { currency, theme, weekStartsOn, language } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (currency) user.currency = currency;
    if (theme) user.theme = theme;
    if (weekStartsOn) user.weekStartsOn = weekStartsOn;
    if (language) user.language = language;

    await user.save();
    return res.json({
      message: 'Preferences updated',
      user: {
        _id: user._id,
        currency: user.currency,
        theme: user.theme,
        weekStartsOn: user.weekStartsOn,
        language: user.language,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: 'Error updating preferences', error: err.message });
  }
};

// DELETE /users/me
exports.deleteMe = async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user._id);
    return res.json({ message: 'Account deleted' });
  } catch (err) {
    return res.status(500).json({ message: 'Error deleting account', error: err.message });
  }
};

// POST /api/v1/auth/change-password  (we mount this under authRoutes below)
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Missing password fields' });
    }
    const user = await User.findById(req.user._id);
    if (!user || !user.password) return res.status(400).json({ message: 'Current password is incorrect' });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    user.password = newPassword; // will be hashed by pre-save hook
    await user.save();
    return res.json({ message: 'Password updated' });
  } catch (err) {
    return res.status(500).json({ message: 'Error updating password', error: err.message });
  }
};
