# Fieldnotes Blog

A responsive blog with user accounts, author-owned posts, comments, likes, and private bookmarks. The frontend uses React and Vite; the REST API uses Express and SQLite.

## Requirements

- Node.js 20 or newer
- npm

## Setup and run

```sh
npm install
```

Copy `.env.example` to `.env` and set a unique, long `JWT_SECRET`. The app uses SQLite by default and creates the database file automatically.

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The API runs on port 3001 and the Vite development server proxies `/api` requests to it.

## Admin access

Register the account that should become the first administrator, then run this command from the project root:

```sh
npm run admin:promote --workspace server -- admin@example.com
```

The command promotes an existing account only when no administrator exists yet; it cannot be used to grant additional admin roles after bootstrap. Existing databases are migrated automatically with a `role` column. Administrators can open **Admin** in the navigation to view counts, delete posts/comments/users, and grant or remove admin roles. The last administrator cannot be demoted or deleted, and admins cannot delete their own account from the panel.

For production, build the frontend and start the server:

```sh
npm run build
npm start
```

The Express server serves the built frontend from `client/dist`.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3001` | Express server port |
| `JWT_SECRET` | Development fallback only | Secret used to sign session JWTs; set a strong value outside local development |
| `DATABASE_PATH` | `./server/data/blog.db` | SQLite database file path |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origin for credentialed API requests |

The SQLite database includes `users`, `posts`, `comments`, `post_likes`, and `post_bookmarks`, with foreign keys and cascading deletes enabled. Passwords are stored as bcrypt hashes. JWTs are sent in an HTTP-only cookie.

## API

All routes are prefixed with `/api`. Authentication routes set/clear the session cookie. Protected routes require a valid cookie.

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/health` | Public | Health check |
| `POST` | `/auth/register` | Public | Create account (`username`, `email`, `password`) |
| `POST` | `/auth/login` | Public | Log in (`email`, `password`) |
| `POST` | `/auth/logout` | Public | Clear session cookie |
| `GET` | `/auth/me` | Signed in | Return current user |
| `GET` | `/posts` | Public | List posts and comment counts |
| `GET` | `/posts/:postId` | Public | Read one post, like count, and signed-in user's like/bookmark state |
| `PUT` | `/posts/:postId/like` | Signed in | Like a post (idempotent) |
| `DELETE` | `/posts/:postId/like` | Signed in | Remove your like |
| `PUT` | `/posts/:postId/bookmark` | Signed in | Privately bookmark a post (idempotent) |
| `DELETE` | `/posts/:postId/bookmark` | Signed in | Remove your bookmark |
| `POST` | `/posts` | Signed in | Create post (`title`, `content`) |
| `PUT` | `/posts/:postId` | Author only | Update post (`title`, `content`) |
| `DELETE` | `/posts/:postId` | Author only | Delete post and its comments |
| `GET` | `/posts/:postId/comments` | Public | List comments |
| `POST` | `/posts/:postId/comments` | Signed in | Add comment (`content`) |
| `DELETE` | `/comments/:commentId` | Comment author only | Delete comment |
| `GET` | `/admin/overview` | Admin | Counts of users, posts, comments, and admins |
| `GET` | `/admin/posts` | Admin | List posts for moderation |
| `DELETE` | `/admin/posts/:postId` | Admin | Delete any post |
| `GET` | `/admin/comments` | Admin | List comments for moderation |
| `DELETE` | `/admin/comments/:commentId` | Admin | Delete any comment |
| `GET` | `/admin/users` | Admin | List user accounts and activity |
| `PATCH` | `/admin/users/:userId/role` | Admin | Set role to `user` or `admin` |
| `DELETE` | `/admin/users/:userId` | Admin | Delete a user and their content |

Post lists and details include `likeCount`, `likedByUser`, and `bookmarkedByUser`. Like totals are public; bookmark state is private to the signed-in user. Like and bookmark writes are idempotent and unique per user and post.

Errors use JSON in the form `{ "error": "..." }`. Invalid inputs return `400`, unauthenticated requests `401`, ownership violations `403`, missing records `404`, and duplicate account identifiers `409`.
