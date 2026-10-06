import "dotenv/config";
import { db } from "../src/db.js";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: npm run admin:promote -- <existing-account-email>");
  process.exitCode = 1;
} else {
  const promote = db.transaction((accountEmail) => {
    const adminCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").get().count;
    if (adminCount > 0) throw new Error("An administrator already exists; bootstrap is one-time only.");
    const account = db.prepare("SELECT id, username, email FROM users WHERE email = ? COLLATE NOCASE").get(accountEmail);
    if (!account) throw new Error("No account exists for that email. Register the account first.");
    db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(account.id);
    return account;
  });

  try {
    const account = promote.immediate(email);
    console.log(`Administrator access granted to ${account.username} (${account.email}).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

db.close();
