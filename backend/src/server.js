import express from 'express'
import dotenv from 'dotenv'
import { connectDB } from './libs/data.js'
import authRoute from './routes/authRoute.js'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { protectedRoute } from './middlewares/authMiddleware.js'
import userRouter from './routes/userRouter.js'
import examParticipantRouter from './routes/examParticipantRoute.js'
import examRoomRouter from './routes/examRoomRoute.js'
import proctorRouter from './routes/proctorRoute.js'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

// Serve static files (for AI violation images)
app.use(express.static(path.join(__dirname, '../public')))

//middleware
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL
, credentials: true // Allow extension to connect
}))

//public  routes
app.use('/api/auth', authRoute)

// Proctoring extension routes (must be before protectedRoute as it has its own auth)
app.use('/api', proctorRouter)

//private routes
app.use(protectedRoute) // middleware xác thực cho tất cả các route sau nó
app.use('/api/user', userRouter)
app.use('/api/exam-rooms', examRoomRouter)
app.use('/api/exam-participants', examParticipantRouter)

async function start() {
  await connectDB()
  app.listen(PORT, () => {
    console.log(`Server đang chạy trên cổng ${PORT}`)
  })
}

start()