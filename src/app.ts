// server.ts
import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import morgan from 'morgan';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGODB_URL as string;

// ---------------------------
// Routes
// ---------------------------
import userSignUpRoutes from './routes/user/userRoutes';
import leaseRoutes from './routes/lease/leaseRoutes';
import sendMailRoute from './routes/mail-route/mail.route';

// ---------------------------
// Database Connection
// ---------------------------
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(` MongoDB Connected: ${mongoose.connection.host}`);
  } catch (error: any) {
    console.error('MongoDB Connection Failed:', error.message);
    process.exit(1);
  }
};

// ---------------------------
// Global Middleware
// ---------------------------
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());
app.use(cors({ origin: '*', credentials: true }));
app.use(helmet());
app.use(hpp());

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// ---------------------------
// Routes
// ---------------------------
app.get('/', (req: Request, res: Response) => {
  res.send('🚀 Server is running...');
});

app.use('/api/user', userSignUpRoutes);
app.use('/api/v1', leaseRoutes);
app.use('/api/mail', sendMailRoute);

// Optional: Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    dbConnected: mongoose.connection.readyState === 1,
  });
});

// Optional: Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('💥 Global Error:', err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// ---------------------------
// Start Server
// ---------------------------
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
  });
});
