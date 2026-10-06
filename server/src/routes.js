import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { db } from "./db.js";
import { asyncRoute, optionalAuth, requireAdmin, requireAuth } from "./middleware.js";

export const router = Router();

const authSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/).optional(),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(72)
});
const postSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1).max(50000)
});
const commentSchema = z.object({
  content: z.string().trim().min(1).max(2000)
});

const userView = (user) => ({ id: user.id, username: user.username, email: user.email, role: user.role });
const tokenCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/"
};

function setSession(res, user) {
  const token = jwt.sign(
    { username: user.username },
    process.env.JWT_SECRET,
    { subject: String(user.id), expiresIn: "7d" }
  );
  res.cookie("token", token, tokenCookieOptions);
}

router.post("/auth/register", asyncRoute(async (req, res) => {
  const parsed = authSchema.safeParse(req.body);
  if (!parsed.success || !parsed.data.username) {
    return res.status(400).json({ error: "Enter a valid username, email, and password of at least 8 characters." });
  }

  const { username, email, password } = parsed.data;
  const passwordHash = await bcrypt.hash(password, 12);
  try {
    const result = db.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)"
    ).run(username, email.toLowerCase(), passwordHash);
    const user = db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(result.lastInsertRowid);
    setSession(res, user);
    return res.status(201).json({ user });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ error: "That username or email is already registered." });
    }
    throw error;
  }
}));

router.post("/auth/login", asyncRoute(async (req, res) => {
  const parsed = z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(72)
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Enter a valid email and password." });

  const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE").get(parsed.data.email);
  if (!user || !(await bcrypt.compare(parsed.data.password, user.password_hash))) {
    return res.status(401).json({ error: "Incorrect email or password." });
  }
  setSession(res, user);
  return res.json({ user: userView(user) });
}));

router.post("/auth/logout", (_req, res) => {
  res.clearCookie("token", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" });
  res.status(204).end();
});

router.get("/auth/me", requireAuth, (req, res) => {
  const user = db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(401).json({ error: "Your account is no longer available." });
  res.json({ user });
});

router.get("/posts", optionalAuth, (req, res) => {
  const posts = db.prepare(`
    SELECT p.id, p.title, p.content, p.created_at AS createdAt, p.updated_at AS updatedAt,
      u.id AS authorId, u.username AS author,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likeCount,
      EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS likedByUser,
      EXISTS (SELECT 1 FROM post_bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS bookmarkedByUser
    FROM posts p JOIN users u ON u.id = p.author_id
    ORDER BY p.created_at DESC, p.id DESC
  `).all(req.user?.id ?? null, req.user?.id ?? null);
  res.json({
    posts: posts.map((post) => ({
      ...post,
      likedByUser: Boolean(post.likedByUser),
      bookmarkedByUser: Boolean(post.bookmarkedByUser)
    }))
  });
});

router.get("/posts/:postId", optionalAuth, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  const post = db.prepare(`
    SELECT p.id, p.title, p.content, p.created_at AS createdAt, p.updated_at AS updatedAt,
      u.id AS authorId, u.username AS author,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likeCount,
      EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS likedByUser,
      EXISTS (SELECT 1 FROM post_bookmarks b WHERE b.post_id = p.id AND b.user_id = ?) AS bookmarkedByUser
    FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?
  `).get(req.user?.id ?? null, req.user?.id ?? null, postId);
  if (!post) return res.status(404).json({ error: "Post not found." });
  res.json({
    post: {
      ...post,
      likedByUser: Boolean(post.likedByUser),
      bookmarkedByUser: Boolean(post.bookmarkedByUser)
    }
  });
});

router.post("/posts", requireAuth, (req, res) => {
  const parsed = postSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "A title (up to 160 characters) and content are required." });
  const result = db.prepare("INSERT INTO posts (title, content, author_id) VALUES (?, ?, ?)").run(
    parsed.data.title, parsed.data.content, req.user.id
  );
  const post = db.prepare(`
    SELECT p.id, p.title, p.content, p.created_at AS createdAt, p.updated_at AS updatedAt,
      u.id AS authorId, u.username AS author
    FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ post });
});

router.put("/posts/:postId/like", requireAuth, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return res.status(404).json({ error: "Post not found." });
  db.prepare("INSERT OR IGNORE INTO post_likes (post_id, user_id) VALUES (?, ?)").run(postId, req.user.id);
  const likeCount = db.prepare("SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?").get(postId).count;
  res.json({ likedByUser: true, likeCount });
});

router.delete("/posts/:postId/like", requireAuth, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return res.status(404).json({ error: "Post not found." });
  db.prepare("DELETE FROM post_likes WHERE post_id = ? AND user_id = ?").run(postId, req.user.id);
  const likeCount = db.prepare("SELECT COUNT(*) AS count FROM post_likes WHERE post_id = ?").get(postId).count;
  res.json({ likedByUser: false, likeCount });
});

router.put("/posts/:postId/bookmark", requireAuth, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return res.status(404).json({ error: "Post not found." });
  db.prepare("INSERT OR IGNORE INTO post_bookmarks (post_id, user_id) VALUES (?, ?)").run(postId, req.user.id);
  res.json({ bookmarkedByUser: true });
});

router.delete("/posts/:postId/bookmark", requireAuth, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return res.status(404).json({ error: "Post not found." });
  db.prepare("DELETE FROM post_bookmarks WHERE post_id = ? AND user_id = ?").run(postId, req.user.id);
  res.json({ bookmarkedByUser: false });
});

router.put("/posts/:postId", requireAuth, (req, res) => {
  const postId = Number(req.params.postId);
  const parsed = postSchema.safeParse(req.body);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!parsed.success) return res.status(400).json({ error: "A title (up to 160 characters) and content are required." });
  const result = db.prepare(`
    UPDATE posts SET title = ?, content = ?, updated_at = datetime('now')
    WHERE id = ? AND author_id = ?
  `).run(parsed.data.title, parsed.data.content, postId, req.user.id);
  if (!result.changes) {
    const exists = db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId);
    return res.status(exists ? 403 : 404).json({ error: exists ? "Only the author can edit this post." : "Post not found." });
  }
  const post = db.prepare(`
    SELECT p.id, p.title, p.content, p.created_at AS createdAt, p.updated_at AS updatedAt,
      u.id AS authorId, u.username AS author
    FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?
  `).get(postId);
  res.json({ post });
});

router.delete("/posts/:postId", requireAuth, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  const result = db.prepare("DELETE FROM posts WHERE id = ? AND author_id = ?").run(postId, req.user.id);
  if (!result.changes) {
    const exists = db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId);
    return res.status(exists ? 403 : 404).json({ error: exists ? "Only the author can delete this post." : "Post not found." });
  }
  res.status(204).end();
});

router.get("/posts/:postId/comments", (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return res.status(404).json({ error: "Post not found." });
  const comments = db.prepare(`
    SELECT c.id, c.content, c.created_at AS createdAt, u.id AS authorId, u.username AS author
    FROM comments c JOIN users u ON u.id = c.author_id
    WHERE c.post_id = ? ORDER BY c.created_at ASC, c.id ASC
  `).all(postId);
  res.json({ comments });
});

router.post("/posts/:postId/comments", requireAuth, (req, res) => {
  const postId = Number(req.params.postId);
  const parsed = commentSchema.safeParse(req.body);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  if (!parsed.success) return res.status(400).json({ error: "Comment must contain 1–2,000 characters." });
  if (!db.prepare("SELECT 1 FROM posts WHERE id = ?").get(postId)) return res.status(404).json({ error: "Post not found." });
  const result = db.prepare("INSERT INTO comments (content, post_id, author_id) VALUES (?, ?, ?)").run(
    parsed.data.content, postId, req.user.id
  );
  const comment = db.prepare(`
    SELECT c.id, c.content, c.created_at AS createdAt, u.id AS authorId, u.username AS author
    FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json({ comment });
});

router.delete("/comments/:commentId", requireAuth, (req, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(commentId) || commentId < 1) return res.status(400).json({ error: "Invalid comment ID." });
  const result = db.prepare("DELETE FROM comments WHERE id = ? AND author_id = ?").run(commentId, req.user.id);
  if (!result.changes) {
    const exists = db.prepare("SELECT 1 FROM comments WHERE id = ?").get(commentId);
    return res.status(exists ? 403 : 404).json({ error: exists ? "You can only delete your own comments." : "Comment not found." });
  }
  res.status(204).end();
});

router.get("/admin/overview", requireAuth, requireAdmin, (_req, res) => {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS userCount,
      (SELECT COUNT(*) FROM posts) AS postCount,
      (SELECT COUNT(*) FROM comments) AS commentCount,
      (SELECT COUNT(*) FROM users WHERE role = 'admin') AS adminCount
  `).get();
  res.json({ stats });
});

router.get("/admin/posts", requireAuth, requireAdmin, (_req, res) => {
  const posts = db.prepare(`
    SELECT p.id, p.title, p.created_at AS createdAt, u.username AS author,
      (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) AS commentCount,
      (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likeCount
    FROM posts p JOIN users u ON u.id = p.author_id
    ORDER BY p.created_at DESC, p.id DESC
  `).all();
  res.json({ posts });
});

router.get("/admin/comments", requireAuth, requireAdmin, (_req, res) => {
  const comments = db.prepare(`
    SELECT c.id, c.content, c.created_at AS createdAt, c.post_id AS postId,
      p.title AS postTitle, u.username AS author
    FROM comments c JOIN posts p ON p.id = c.post_id JOIN users u ON u.id = c.author_id
    ORDER BY c.created_at DESC, c.id DESC
  `).all();
  res.json({ comments });
});

router.get("/admin/users", requireAuth, requireAdmin, (_req, res) => {
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.created_at AS createdAt,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = u.id) AS postCount,
      (SELECT COUNT(*) FROM comments c WHERE c.author_id = u.id) AS commentCount
    FROM users u ORDER BY u.created_at DESC, u.id DESC
  `).all();
  res.json({ users });
});

router.patch("/admin/users/:userId/role", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const parsed = z.object({ role: z.enum(["user", "admin"]) }).safeParse(req.body);
  if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: "Invalid user ID." });
  if (!parsed.success) return res.status(400).json({ error: "Role must be user or admin." });
  const updateRole = db.transaction(() => {
    const target = db.prepare("SELECT id, username, email, role FROM users WHERE id = ?").get(userId);
    if (!target) return { status: 404, error: "User not found." };
    if (target.id === req.user.id && parsed.data.role !== "admin") {
      return { status: 400, error: "You cannot remove your own administrator access." };
    }
    if (target.role === "admin" && parsed.data.role === "user") {
      const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
      if (adminCount <= 1) return { status: 409, error: "The last administrator cannot be demoted." };
    }
    db.prepare("UPDATE users SET role = ? WHERE id = ?").run(parsed.data.role, userId);
    return { user: { ...target, role: parsed.data.role } };
  });
  const result = updateRole.immediate();
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.json(result);
});

router.delete("/admin/users/:userId", requireAuth, requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId < 1) return res.status(400).json({ error: "Invalid user ID." });
  if (userId === req.user.id) return res.status(400).json({ error: "You cannot delete your own account from the admin panel." });
  const deleteUser = db.transaction(() => {
    const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(userId);
    if (!target) return { status: 404, error: "User not found." };
    if (target.role === "admin") {
      const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
      if (adminCount <= 1) return { status: 409, error: "The last administrator cannot be deleted." };
    }
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
    return { status: 204 };
  });
  const result = deleteUser.immediate();
  if (result.error) return res.status(result.status).json({ error: result.error });
  res.status(204).end();
});

router.delete("/admin/posts/:postId", requireAuth, requireAdmin, (req, res) => {
  const postId = Number(req.params.postId);
  if (!Number.isInteger(postId) || postId < 1) return res.status(400).json({ error: "Invalid post ID." });
  const result = db.prepare("DELETE FROM posts WHERE id = ?").run(postId);
  if (!result.changes) return res.status(404).json({ error: "Post not found." });
  res.status(204).end();
});

router.delete("/admin/comments/:commentId", requireAuth, requireAdmin, (req, res) => {
  const commentId = Number(req.params.commentId);
  if (!Number.isInteger(commentId) || commentId < 1) return res.status(400).json({ error: "Invalid comment ID." });
  const result = db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);
  if (!result.changes) return res.status(404).json({ error: "Comment not found." });
  res.status(204).end();
});
