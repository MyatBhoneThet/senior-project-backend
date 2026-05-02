const multer = require('multer');

// Memory storage -> req.file.buffer is available
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (String(file.mimetype || '').toLowerCase().startsWith('image/')) return cb(null, true);
  cb(new Error('Only image files are allowed'));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});
