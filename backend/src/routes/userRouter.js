import express from 'express';
import { authMe } from '../controllers/userController.js';
import { signUp, signIn, signOut, refreshToken } from '../controllers/authController.js'

const router = express.Router();

router.get('/me',authMe);
router.post('/refresh', refreshToken); // Route làm mới token


export default router;