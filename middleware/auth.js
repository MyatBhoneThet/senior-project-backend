// backend/middlewares/auth.js
const jwt = require('jsonwebtoken');

exports.auth = (req, res, next) => {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // keep the fields you encode in your token (id, email, etc.)
    req.user = { _id: decoded.id || decoded._id, email: decoded.email };
    if (!req.user._id) return res.status(401).json({ message: 'Invalid token payload' });

    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized', error: err.message });
  }
};
