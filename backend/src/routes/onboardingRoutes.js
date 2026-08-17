import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.js';
import {
  chooseUserType,
  chooseCreatorType,
  updateContentInfo,
  updateOrganizationDetails,
  getOnboardingStatus,
  completeOnboarding,
  skipOnboarding,
  completeProfileSetup,
  uploadProfilePicture,
  skipProfileSetup,
} from '../controllers/onboardingController.js';

const router = express.Router();

// Configure multer for avatar uploads
const AVATAR_DIR = path.join(process.cwd(), 'uploads', 'avatars');
if (!fs.existsSync(AVATAR_DIR)) {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AVATAR_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WEBP images are allowed'), false);
    }
  },
});

// All onboarding routes require authentication
router.use(authenticate);

// Get onboarding status
router.get('/status', getOnboardingStatus);

// Step 1: Choose user type (Listener or Creator)
router.post('/choose-type', chooseUserType);

// Step 2: Choose creator type (Individual or Organization)
router.post('/choose-creator-type', chooseCreatorType);

// Step 3: Update content info (Category + Description)
router.post('/content-info', updateContentInfo);

// Step 4: Update organization details (for Organization creators)
router.post('/organization-details', updateOrganizationDetails);

// Step 5: Complete profile setup
router.post('/profile-setup', completeProfileSetup);

// Upload profile picture
router.post('/upload-avatar', upload.single('avatar'), uploadProfilePicture);

// Skip profile setup
router.post('/skip-profile', skipProfileSetup);

// Complete onboarding
router.post('/complete', completeOnboarding);

// Skip onboarding
router.post('/skip', skipOnboarding);

export default router;
