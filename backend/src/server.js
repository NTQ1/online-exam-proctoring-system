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
import monitoringSessionRoutes from './routes/monitoringSessionRoutes.js'
import violationRouter from './routes/violationRoute.js'   // thêm dòng này
import examHistoryRouter from './routes/examHistoryRoutes.js'
import blockchainRouter from './routes/blockchainRoutes.js'



import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001

app.use(express.static(path.join(__dirname, '../public')))
app.use('/screenshots', express.static(path.join(__dirname, '../public/screenshots')))
app.use('/ai-violations', express.static(path.join(__dirname, '../public/ai-violations')))
app.use('/uploads/ai-violations', express.static(path.join(__dirname, '../public/ai-violations')))

app.use(express.json({ limit: '50mb' }))
app.use(cookieParser())

app.use(cors({
  origin: (origin, callback) => {
    // Cho phép requests không có origin (server-to-server, Postman, curl)
    if (!origin) return callback(null, true)

    // Cho phép tất cả chrome-extension:// origins
    if (origin.startsWith('chrome-extension://')) {
      return callback(null, true)
    }

    // Nếu CORS_ALLOW_ALL=true thì mở toàn bộ (dùng khi dev trên LAN)
    if (process.env.CORS_ALLOW_ALL === 'true') {
      return callback(null, true)
    }

    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:5173',
      'http://localhost:3000',
    ].filter(Boolean)

    // Cho phép thêm danh sách origins từ env (phân cách bởi dấu phẩy)
    if (process.env.EXTRA_ORIGINS) {
      process.env.EXTRA_ORIGINS.split(',').forEach(o => allowedOrigins.push(o.trim()))
    }

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error(`CORS: origin ${origin} not allowed`))
  },
  credentials: true,
}))

// public routes
app.use('/api/auth', authRoute)
app.use('/api', proctorRouter)
app.use('/api/sessions', monitoringSessionRoutes)
app.use('/api/exam-participants', examParticipantRouter)
app.use('/api/violations', violationRouter)   // thêm dòng này
app.use('/api/exam-history', examHistoryRouter)
app.use('/api/blockchain', blockchainRouter)




// private routes
app.use(protectedRoute)

app.use('/api/user', userRouter)
app.use('/api/exam-rooms', examRoomRouter)

async function start() {
  await connectDB()

  // Lắng nghe trên 0.0.0.0 để các thiết bị trong mạng LAN có thể kết nối
  const HOST = process.env.HOST || '0.0.0.0'
  app.listen(PORT, HOST, () => {
    console.log(`Server đang chạy tại http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
    if (HOST === '0.0.0.0') {
      console.log(`Truy cập từ thiết bị khác trong mạng LAN: http://<IP_CỦA_MÁY_NÀY>:${PORT}`)
    }
  })
}

start()