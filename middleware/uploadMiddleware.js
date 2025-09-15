const multer = require('multer');

// Memory storage -> req.file.buffer is available
const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
  if (/image\/(png|jpe?g|gif|webp)/i.test(file.mimetype)) return cb(null, true);
  cb(new Error('Only image files are allowed'));
};

module.exports = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
