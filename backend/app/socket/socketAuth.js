import jwt from "jsonwebtoken";

export function verifySocketToken(token) {
  if (!token || typeof token !== "string") return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}
