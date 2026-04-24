import jwt from 'jsonwebtoken';

export interface AuthUserClaims {
  id?: string;
  _id?: string;
  role?: string;
  subRole?: string;
  fullName?: string;
  email?: string;
  token?: string;
  adminId?: string;
  locationId?: string;
  Location?: string;
  location?: string;
  which?: string;
  userLimit?: number;
  user_limit?: number;
  [key: string]: any;
}

const normalizeClaims = (decoded: any): AuthUserClaims => ({
  ...decoded,
  id: decoded.id || decoded._id,
  _id: decoded._id || decoded.id,
  role: decoded.role,
  userLimit: decoded.userLimit ?? decoded.user_limit,
  user_limit: decoded.user_limit ?? decoded.userLimit,
});

export const getUser = async (token: string): Promise<AuthUserClaims | null> => {
  try {
    let decoded: any;
    try {
      // Try to verify with local secret first
      decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET!);
    } catch (verifyError) {
      // If verification fails, decode without verification (trusting the external source)
      decoded = jwt.decode(token);
    }

    if (!decoded || typeof decoded === "string") {
      return null;
    }

    return normalizeClaims(decoded);
  } catch (error) {
    console.error("Auth Service: Error processing token:", error);
    return null;
  }
};

export const getExactRole = async (token: string) => {
  const claims = await getUser(token);
  return claims?.role;
};

export const setUser = (user: any) => {
  return jwt.sign(
    { id: user._id, _id: user._id, role: user.role },
    process.env.ACCESS_TOKEN_SECRET!,
    { expiresIn: '24h' }
  );
}; 
