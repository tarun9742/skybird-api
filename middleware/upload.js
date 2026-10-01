const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

const privateTempDir = path.join(
  path.resolve(
    process.env.VIDEO_STORAGE_PATH || path.join(__dirname, "../private-videos"),
  ),
  "tmp",
);
const thumbnailDir = path.join(__dirname, "../uploads/thumbnails");

fs.mkdirSync(privateTempDir, { recursive: true });
fs.mkdirSync(thumbnailDir, { recursive: true });

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, file.fieldname === "thumbnail" ? thumbnailDir : privateTempDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname).toLowerCase()}`;
    cb(null, uniqueName);
  },
});

const memoryStorage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mov|avi|mkv/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase(),
  );
  const mimetype = allowedTypes.test(file.mimetype);
  if (extname && mimetype) return cb(null, true);
  cb(
    new Error(
      "Only images (jpeg, jpg, png, gif, webp) and videos (mp4, webm, mov, avi, mkv) are allowed",
    ),
  );
};

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
  fileFilter,
});

const memoryUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB
  fileFilter,
});

module.exports = { upload, memoryUpload };
