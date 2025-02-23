import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';

export const getUser = async (token: string): Promise<User | null> => {
  const decoded: any = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!);
  try {
    const user = await User.findById(decoded.id); 
    return user
  } catch (error) {    
    return null
  }
    
};

export const getExactRole = async (token: string) => {
  const user = await getUser(token);
  return user?.role;
};

export const setUser = (user: any) => {
  return jwt.sign({ id: user._id, role: user.role }, process.env.ACCESS_TOKEN_SECRET!, { expiresIn: '24h' });
}; 