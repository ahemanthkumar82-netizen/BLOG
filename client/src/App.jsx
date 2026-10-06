import { createContext, useContext, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

async function request(url, options = {}) {
  const response = await fetch(`/api${url}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options
  });
  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

function AdminProtected({ children }) {
  const { user, authLoading } = useAuth();
  const location = useLocation();
  if (authLoading) return <PageMessage>Loading your account…</PageMessage>;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return user.role === "admin" ? children : <Navigate to="/" replace />;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(`${value.replace(" ", "T")}Z`));
}

function Navbar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  return (
    <header className="site-header">
      <nav className="nav wrap" aria-label="Main navigation">
        <Link className="brand" to="/" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">f.</span> fieldnotes
        </Link>
        <button className="menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
          <span /><span /><span />
        </button>
        <div className={`nav-links ${menuOpen ? "open" : ""}`}>
          <Link to="/" onClick={() => setMenuOpen(false)}>Explore</Link>
          {user ? (
            <>
              {user.role === "admin" && <Link to="/admin" onClick={() => setMenuOpen(false)}>Admin</Link>}
              <Link className="write-link" to="/posts/new" onClick={() => setMenuOpen(false)}>Write a story <span>↗</span></Link>
              <span className="nav-user">Hi, {user.username}</span>
              <button className="text-button" onClick={async () => {
                setMenuOpen(false);
                setLogoutError("");
                try {
                  await logout();
                } catch (error) {
                  setLogoutError(error.message);
                }
              }}>Log out</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
              <Link className="button button-dark nav-join" to="/register" onClick={() => setMenuOpen(false)}>Join Fieldnotes</Link>
            </>
          )}
        </div>
      </nav>
      {logoutError && <div className="logout-error" role="alert">{logoutError}</div>}
    </header>
  );
}

function PageMessage({ children, error = false }) {
  return <div className={`page-message ${error ? "error" : ""}`} role={error ? "alert" : "status"}>{children}</div>;
}

function PostCard({ post }) {
  const excerpt = post.content.length > 190 ? `${post.content.slice(0, 190).trim()}…` : post.content;
  return (
    <article className="post-card">
      <div className="card-meta"><span className="avatar">{post.author.slice(0, 1).toUpperCase()}</span><span>{post.author}</span><span className="meta-dot">·</span><time>{formatDate(post.createdAt)}</time></div>
      <Link className="card-title" to={`/posts/${post.id}`}><h2>{post.title}</h2></Link>
      <p className="card-excerpt">{excerpt}</p>
      <div className="card-footer">
        <Link to={`/posts/${post.id}`} className="read-link">Read story <span>→</span></Link>
        <PostEngagement post={post} compact />
        <span className="comment-count">◌ {post.commentCount}</span>
      </div>
    </article>
  );
}

function HomePage() {
  const { user, authLoading } = useAuth();
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    request("/posts")
      .then(({ posts: data }) => setPosts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [authLoading, user?.id]);

  return (
    <main>
      <section className="hero wrap">
        <div className="hero-kicker"><span className="kicker-line" /> A home for curious minds</div>
        <h1>Ideas are better<br />when <em>shared.</em></h1>
        <p>Thoughtful stories, fresh perspectives, and conversations that stay with you.</p>
        <Link to="/posts/new" className="button button-dark hero-button">Share your story <span>↗</span></Link>
        <div className="hero-art" aria-hidden="true">
          <span className="sun" /><span className="art-leaf leaf-one" /><span className="art-leaf leaf-two" />
          <span className="art-stem" /><span className="art-caption">GROW<br />THROUGH<br />WORDS</span>
        </div>
      </section>
      <section className="stories-section">
        <div className="wrap">
          <div className="section-heading"><div><span className="eyebrow">THE LATEST</span><h2>Stories from the community</h2></div><span className="heading-note">Good ideas deserve a good read.</span></div>
          {loading ? <PageMessage>Finding the latest stories…</PageMessage> : error ? <PageMessage error>{error}</PageMessage> : posts.length ? (
            <div className="post-grid">{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>
          ) : (
            <div className="empty-state"><span className="empty-icon">✳</span><h3>The first page is yours.</h3><p>There are no stories here yet. Start the conversation.</p><Link to="/posts/new" className="read-link">Write the first story <span>→</span></Link></div>
          )}
        </div>
      </section>
      <footer className="site-footer wrap"><Link className="brand" to="/"><span className="brand-mark">f.</span> fieldnotes</Link><span>Made for the love of a good story.</span><span>© 2026 Fieldnotes</span></footer>
    </main>
  );
}

function AuthPage({ mode }) {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isRegister = mode === "register";
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  if (user) return <Navigate to="/" replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await request(`/auth/${mode}`, { method: "POST", body: JSON.stringify(form) });
      login(result.user);
      const destination = location.state?.from;
      navigate(typeof destination === "string" && destination.startsWith("/") && !destination.startsWith("//") ? destination : "/");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <span className="eyebrow">{isRegister ? "YOUR NEXT CHAPTER" : "WELCOME BACK"}</span>
        <h1>{isRegister ? "Make room for ideas." : "Good to see you."}</h1>
        <p className="auth-intro">{isRegister ? "Join a community of people who think, write, and share." : "Pick up where your reading left off."}</p>
        {error && <PageMessage error>{error}</PageMessage>}
        <form onSubmit={submit} className="form-stack">
          {isRegister && <label>Username<input autoComplete="username" required minLength="3" maxLength="24" pattern="[A-Za-z0-9_]+" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="Your public name" /></label>}
          <label>Email address<input autoComplete="email" type="email" required maxLength="254" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@example.com" /></label>
          <label>Password<input autoComplete={isRegister ? "new-password" : "current-password"} type="password" required minLength={isRegister ? 8 : 1} maxLength="72" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={isRegister ? "At least 8 characters" : "Your password"} /></label>
          <button className="button button-dark full-button" disabled={loading}>{loading ? "Please wait…" : isRegister ? "Create your account" : "Log in"} <span>→</span></button>
        </form>
        <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Fieldnotes?"} <Link to={isRegister ? "/login" : "/register"}>{isRegister ? "Log in" : "Create an account"}</Link></p>
      </div>
      <div className="auth-aside"><div className="quote-mark">“</div><blockquote>Writing is thinking.<br />To write well is to think clearly.</blockquote><span>— DAVID MCCULLOUGH</span><div className="aside-decoration">f<span>.</span></div></div>
    </main>
  );
}

function Protected({ children }) {
  const { user, authLoading } = useAuth();
  if (authLoading) return <PageMessage>Loading your account…</PageMessage>;
  return user ? children : <Navigate to="/login" replace />;
}

function PostEngagement({ post, compact = false }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [liked, setLiked] = useState(Boolean(post.likedByUser));
  const [likeCount, setLikeCount] = useState(post.likeCount ?? 0);
  const [bookmarked, setBookmarked] = useState(Boolean(post.bookmarkedByUser));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLiked(Boolean(post.likedByUser));
    setLikeCount(post.likeCount ?? 0);
    setBookmarked(Boolean(post.bookmarkedByUser));
  }, [post.id, post.likedByUser, post.likeCount, post.bookmarkedByUser]);

  async function toggle(kind, currentlyActive) {
    if (!user) {
      navigate("/login", { state: { from: location.pathname } });
      return;
    }
    setPending(true);
    setError("");
    try {
      const result = await request(`/posts/${post.id}/${kind}`, { method: currentlyActive ? "DELETE" : "PUT" });
      if (kind === "like") {
        setLiked(result.likedByUser);
        setLikeCount(result.likeCount);
      } else {
        setBookmarked(result.bookmarkedByUser);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={`engagement ${compact ? "compact" : ""}`}>
      <button className={`engagement-button like-button ${liked ? "active" : ""}`} type="button" disabled={pending} aria-pressed={liked} aria-label={liked ? "Unlike story" : "Like story"} onClick={() => toggle("like", liked)}>
        <span aria-hidden="true">{liked ? "♥" : "♡"}</span><span>{likeCount}</span>
      </button>
      <button className={`engagement-button bookmark-button ${bookmarked ? "active" : ""}`} type="button" disabled={pending} aria-pressed={bookmarked} aria-label={bookmarked ? "Remove bookmark" : "Bookmark story"} onClick={() => toggle("bookmark", bookmarked)}>
        <span aria-hidden="true">{bookmarked ? "▣" : "▱"}</span>{compact ? null : <span>{bookmarked ? "Saved" : "Save"}</span>}
      </button>
      {error && <span className="engagement-error" role="alert">{error}</span>}
    </div>
  );
}

function AdminPage() {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState("posts");
  const [overview, setOverview] = useState(null);
  const [posts, setPosts] = useState([]);
  const [comments, setComments] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    setError("");
    try {
      const [overviewResult, postsResult, commentsResult, usersResult] = await Promise.all([
        request("/admin/overview"),
        request("/admin/posts"),
        request("/admin/comments"),
        request("/admin/users")
      ]);
      setOverview(overviewResult.stats);
      setPosts(postsResult.posts);
      setComments(commentsResult.comments);
      setUsers(usersResult.users);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function perform(key, action) {
    setBusy(key);
    setError("");
    try {
      await action();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  }

  function removePost(post) {
    if (!window.confirm(`Delete "${post.title}" and its comments? This cannot be undone.`)) return;
    perform(`post-${post.id}`, () => request(`/admin/posts/${post.id}`, { method: "DELETE" }));
  }

  function removeComment(comment) {
    if (!window.confirm(`Delete this comment by ${comment.author}?`)) return;
    perform(`comment-${comment.id}`, () => request(`/admin/comments/${comment.id}`, { method: "DELETE" }));
  }

  function updateRole(user) {
    const role = user.role === "admin" ? "user" : "admin";
    if (!window.confirm(`${role === "admin" ? "Grant administrator access to" : "Remove administrator access from"} ${user.username}?`)) return;
    perform(`user-${user.id}`, () => request(`/admin/users/${user.id}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role })
    }));
  }

  function removeUser(user) {
    if (!window.confirm(`Delete ${user.username} and all of their posts and comments? This cannot be undone.`)) return;
    perform(`user-${user.id}`, () => request(`/admin/users/${user.id}`, { method: "DELETE" }));
  }

  return (
    <main className="admin-page wrap">
      <div className="admin-heading">
        <div><span className="eyebrow">FIELDNOTES CONTROL ROOM</span><h1>Admin panel</h1><p>Keep the community thoughtful and running smoothly.</p></div>
        <button className="button button-dark" disabled={loading} onClick={() => { setLoading(true); load(); }}>↻ Refresh</button>
      </div>
      {error && <PageMessage error>{error}</PageMessage>}
      {overview && <div className="admin-stats">
        {[["Members", overview.userCount], ["Stories", overview.postCount], ["Responses", overview.commentCount], ["Admins", overview.adminCount]].map(([label, value]) => (
          <div className="admin-stat" key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </div>}
      <div className="admin-tabs" role="tablist" aria-label="Admin data">
        {[["posts", "Stories", posts.length], ["comments", "Comments", comments.length], ["users", "Members", users.length]].map(([key, label, count]) => (
          <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}<span>{count}</span></button>
        ))}
      </div>
      {loading ? <PageMessage>Loading the control room…</PageMessage> : (
        <div className="admin-table-wrap">
          {tab === "posts" && <table className="admin-table"><thead><tr><th>Story</th><th>Author</th><th>Published</th><th>Engagement</th><th /></tr></thead><tbody>
            {posts.map((post) => <tr key={post.id}><td><Link to={`/posts/${post.id}`}>{post.title}</Link></td><td>{post.author}</td><td>{formatDate(post.createdAt)}</td><td>♥ {post.likeCount} · ◌ {post.commentCount}</td><td><button className="admin-action danger-text" disabled={busy === `post-${post.id}`} onClick={() => removePost(post)}>{busy === `post-${post.id}` ? "Removing…" : "Delete"}</button></td></tr>)}
            {!posts.length && <tr><td colSpan="5" className="admin-empty">No stories to show.</td></tr>}
          </tbody></table>}
          {tab === "comments" && <table className="admin-table"><thead><tr><th>Comment</th><th>Author</th><th>Story</th><th>Posted</th><th /></tr></thead><tbody>
            {comments.map((comment) => <tr key={comment.id}><td className="admin-comment-text">{comment.content}</td><td>{comment.author}</td><td><Link to={`/posts/${comment.postId}`}>{comment.postTitle}</Link></td><td>{formatDate(comment.createdAt)}</td><td><button className="admin-action danger-text" disabled={busy === `comment-${comment.id}`} onClick={() => removeComment(comment)}>{busy === `comment-${comment.id}` ? "Removing…" : "Delete"}</button></td></tr>)}
            {!comments.length && <tr><td colSpan="5" className="admin-empty">No comments to show.</td></tr>}
          </tbody></table>}
          {tab === "users" && <table className="admin-table"><thead><tr><th>Member</th><th>Email</th><th>Joined</th><th>Activity</th><th>Role</th><th /></tr></thead><tbody>
            {users.map((member) => <tr key={member.id}><td>{member.username}</td><td>{member.email}</td><td>{formatDate(member.createdAt)}</td><td>{member.postCount} stories · {member.commentCount} responses</td><td><span className={`role-badge ${member.role}`}>{member.role}</span></td><td className="admin-user-actions"><button className="admin-action" disabled={busy === `user-${member.id}` || (member.id === currentUser?.id && member.role === "admin")} onClick={() => updateRole(member)}>{member.role === "admin" ? "Demote" : "Make admin"}</button>{member.id !== currentUser?.id && <button className="admin-action danger-text" disabled={busy === `user-${member.id}`} onClick={() => removeUser(member)}>Delete</button>}</td></tr>)}
            {!users.length && <tr><td colSpan="6" className="admin-empty">No members to show.</td></tr>}
          </tbody></table>}
        </div>
      )}
    </main>
  );
}

function PostForm({ edit = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState({ title: "", content: "" });
  const [loading, setLoading] = useState(edit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!edit) return;
    request(`/posts/${id}`).then(({ post }) => {
      setForm({ title: post.title, content: post.content });
      if (post.authorId !== user?.id) throw new Error("Only the author can edit this post.");
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [edit, id, user?.id]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const result = await request(edit ? `/posts/${id}` : "/posts", {
        method: edit ? "PUT" : "POST",
        body: JSON.stringify(form)
      });
      navigate(`/posts/${result.post.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageMessage>Loading story…</PageMessage>;
  return (
    <main className="editor-page wrap">
      <Link to={edit ? `/posts/${id}` : "/"} className="back-link">← Back</Link>
      <span className="eyebrow">{edit ? "REFINE YOUR STORY" : "YOUR WORDS, YOUR SPACE"}</span>
      <h1>{edit ? "Edit your story" : "Start a story"}</h1>
      <p className="editor-intro">Take your time. The best stories start with a first draft.</p>
      {error && <PageMessage error>{error}</PageMessage>}
      <form onSubmit={submit} className="editor-form">
        <label htmlFor="post-title">Title</label>
        <input id="post-title" required maxLength="160" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Give your story a name" />
        <div className="editor-label-row"><label htmlFor="post-content">Your story</label><span>{form.content.length.toLocaleString()} / 50,000</span></div>
        <textarea id="post-content" required maxLength="50000" rows="14" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="What would you like to share?" />
        <div className="editor-actions"><span>Stories are public and open for conversation.</span><button className="button button-dark" disabled={saving}>{saving ? "Saving…" : edit ? "Save changes" : "Publish story"} <span>↗</span></button></div>
      </form>
    </main>
  );
}

function PostPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [commentError, setCommentError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [postResult, commentResult] = await Promise.all([request(`/posts/${id}`), request(`/posts/${id}/comments`)]);
      setPost(postResult.post);
      setComments(commentResult.comments);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function addComment(event) {
    event.preventDefault();
    setSubmitting(true);
    setCommentError("");
    try {
      const result = await request(`/posts/${id}/comments`, { method: "POST", body: JSON.stringify({ content: comment }) });
      setComments((existing) => [...existing, result.comment]);
      setComment("");
    } catch (err) {
      setCommentError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function deletePost() {
    if (!window.confirm("Delete this story and all its comments? This cannot be undone.")) return;
    try {
      await request(`/posts/${id}`, { method: "DELETE" });
      navigate("/");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteComment(commentId) {
    try {
      await request(`/comments/${commentId}`, { method: "DELETE" });
      setComments((existing) => existing.filter((item) => item.id !== commentId));
    } catch (err) {
      setCommentError(err.message);
    }
  }

  if (loading) return <PageMessage>Loading story…</PageMessage>;
  if (error && !post) return <main className="wrap detail-error"><PageMessage error>{error}</PageMessage><Link to="/" className="back-link">← Back to stories</Link></main>;
  if (!post) return null;

  return (
    <main className="detail-page wrap">
      <Link to="/" className="back-link">← All stories</Link>
      <article className="story">
        <div className="story-kicker"><span className="eyebrow">A FIELDNOTE</span><span className="story-dot">✳</span><span>{formatDate(post.createdAt)}</span></div>
        <h1>{post.title}</h1>
        <div className="story-byline"><span className="avatar">{post.author.slice(0, 1).toUpperCase()}</span><span>Written by <strong>{post.author}</strong></span>{post.updatedAt !== post.createdAt && <span className="edited-note">Updated {formatDate(post.updatedAt)}</span>}</div>
        <PostEngagement post={post} />
        {user?.id === post.authorId && <div className="owner-actions"><Link className="text-button" to={`/posts/${id}/edit`}>Edit story</Link><button className="text-button danger-text" onClick={deletePost}>Delete story</button></div>}
        <div className="story-content">{post.content.split(/\n{2,}/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
      </article>
      <section className="comments-section">
        <div className="comments-heading"><span className="eyebrow">THE CONVERSATION</span><h2>Thoughts &amp; responses <span>{comments.length}</span></h2></div>
        {user ? (
          <form className="comment-form" onSubmit={addComment}>
            <div className="comment-avatar">{user.username.slice(0, 1).toUpperCase()}</div>
            <div className="comment-input-wrap"><textarea required maxLength="2000" rows="3" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add something thoughtful…" /><div className="comment-submit"><span>{comment.length} / 2,000</span><button className="button button-dark" disabled={submitting}>{submitting ? "Posting…" : "Post response"} <span>→</span></button></div></div>
          </form>
        ) : <div className="sign-in-note"><span>Want to join the conversation?</span><Link to="/login">Log in</Link><span>or</span><Link to="/register">create an account</Link>.</div>}
        {commentError && <PageMessage error>{commentError}</PageMessage>}
        {comments.length ? <div className="comment-list">{comments.map((item) => (
          <article className="comment" key={item.id}>
            <div className="avatar">{item.author.slice(0, 1).toUpperCase()}</div>
            <div className="comment-body"><div className="comment-meta"><strong>{item.author}</strong><time>{formatDate(item.createdAt)}</time>{user?.id === item.authorId && <button className="comment-delete" onClick={() => deleteComment(item.id)}>Delete</button>}</div><p>{item.content}</p></div>
          </article>
        ))}</div> : <p className="no-comments">No responses yet. Be the first to share a thought.</p>}
      </section>
      <div className="detail-bottom"><Link to="/" className="read-link">← Discover more stories</Link></div>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    request("/auth/me").then(({ user: current }) => setUser(current)).catch(() => setUser(null)).finally(() => setAuthLoading(false));
  }, []);

  async function logout() {
    await request("/auth/logout", { method: "POST" });
    setUser(null);
  }

  function login(nextUser) {
    setUser(nextUser);
  }

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout }}>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/admin" element={<AdminProtected><AdminPage /></AdminProtected>} />
        <Route path="/posts/new" element={<Protected><PostForm /></Protected>} />
        <Route path="/posts/:id/edit" element={<Protected><PostForm edit /></Protected>} />
        <Route path="/posts/:id" element={<PostPage />} />
        <Route path="*" element={<main className="wrap not-found"><span className="eyebrow">404 · LOST IN THE MARGINS</span><h1>This page wandered off.</h1><Link to="/" className="read-link">Back to the stories <span>→</span></Link></main>} />
      </Routes>
    </AuthContext.Provider>
  );
}
