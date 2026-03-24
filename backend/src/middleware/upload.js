const multer = require('multer')
const path = require('path')
const fs = require('fs')

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../public/uploads/vehicles')
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}

// For email campaigns
const emailUploadsDir = path.join(__dirname, '../../public/uploads/campaigns')
if (!fs.existsSync(emailUploadsDir)) {
  fs.mkdirSync(emailUploadsDir, { recursive: true })
}

// Configure storage for vehicles
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    const nameWithoutExt = path.basename(file.originalname, ext)
    cb(null, `${nameWithoutExt}-${uniqueSuffix}${ext}`)
  },
})

// Configure storage for email campaigns
const emailStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, emailUploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    const ext = path.extname(file.originalname)
    const nameWithoutExt = path.basename(file.originalname, ext)
    cb(null, `campaign-${nameWithoutExt}-${uniqueSuffix}${ext}`)
  },
})

// File filter - only allow images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
  const mimetype = allowedTypes.test(file.mimetype)

  if (mimetype && extname) {
    return cb(null, true)
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'))
  }
}

// Multer instances
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
})

const uploadEmail = multer({
  storage: emailStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter,
})

module.exports = { upload, uploadEmail }
