import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import mongoose from 'mongoose';
import morgan from 'morgan';

dotenv.config();
const app = express();
// <------------------------- USER ROUTES IMPORT  -------------------->
import userSignUpRoutes from './routes/user/userRoutes';
// <------------------------- UNMATCHED ROUTES IMPORT  -------------------->
import leaseRoutes from './routes/lease/leaseRoutes'
import sendMailRoute from './routes/mail-route/mail.route';
const PORT = process.env.PORT ?? 3000;

// <------------------------- DATABASE CONNECT -------------------->
const MONGO_URI: any = process.env.MONGODB_URL;
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(MONGO_URI);
    console.log(`MongoDB Database Connected: ${conn.connection.host}`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

// <---------------------- MIDDLEWARES -------------------->
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use(cookieParser());
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}
app.use(cors({ origin: '*' }));
app.use(helmet());
// PREVENT PARAMETER POLLUTION
app.use(hpp());

// User  Routes
app.use('/api/user', userSignUpRoutes);

// Lease
app.use('/api/v1', leaseRoutes);

// MAIL
app.use('/api/mail', sendMailRoute);
// Root Route (Return Running Message)
app.get('/', (req: Request, res: Response) => {
  res.send('Server is running...');
});
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at ${PORT}`);
  });
});
