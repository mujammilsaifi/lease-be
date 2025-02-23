import mongoose from 'mongoose';

const MONGO_URI: string = process.env.MONGODB_URL!;
if (!MONGO_URI) {
  console.error('MongoDB URI is not defined in the environment variables');
  process.exit(1);
}

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    console.log('MongoDB connection established successfully');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1); 
  }
};

export default connectDB;
