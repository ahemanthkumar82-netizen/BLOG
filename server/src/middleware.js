import jwt from "jsonwebtoken";
import { db } from "./db.js";

export function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: "Please log in to continue." });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid token subject.");
    req.user = { id: userId, username: payload.username };
    return next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please log in to continue." });
  const user = dbAdminLookup(req.user.id);
  if (!user) return res.status(401).json({ error: "Your account is no longer available." });
  if (user.role !== "admin") return res.status(403).json({ error: "Administrator access is required." });
  req.user.role = user.role;
  return next();
}

function dbAdminLookup(userId) {
  return db.prepare("SELECT role FROM users WHERE id = ?").get(userId);
}

export function optionalAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const userId = Number(payload.sub);
    if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("Invalid token subject.");
    req.user = { id: userId, username: payload.username };
    return next();
  } catch {
    return res.status(401).json({ error: "Your session has expired. Please log in again." });
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}
