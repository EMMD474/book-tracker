'use strict';

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ─── Database connection ──────────────────────────────────────────────────────

const DB_PATH = path.join(__dirname, 'books.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[DB] Failed to open database:', err.message);
    process.exit(1);
  }
  console.log('[DB] Connected →', DB_PATH);
  initializeDatabase();
});

// ─── Schema & seed data ───────────────────────────────────────────────────────

function initializeDatabase() {
  db.serialize(() => {

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT    UNIQUE NOT NULL,
        password TEXT    NOT NULL,
        email    TEXT,
        role     TEXT    DEFAULT 'user',
        bio      TEXT    DEFAULT '',
        api_key  TEXT    DEFAULT NULL
      )
    `, logErr('users'));

    db.run(`
      CREATE TABLE IF NOT EXISTS reading_progress (
        id                  INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id             INTEGER NOT NULL,
        book_title          TEXT    NOT NULL,
        author              TEXT    DEFAULT 'Unknown',
        progress_percentage INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, logErr('reading_progress'));

    db.run(`
      CREATE TABLE IF NOT EXISTS book_reviews (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        book_title TEXT    NOT NULL,
        rating     INTEGER DEFAULT 5,
        review     TEXT    DEFAULT '',
        created_at TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, logErr('book_reviews'));

    db.run(`
      CREATE TABLE IF NOT EXISTS user_notes (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id    INTEGER NOT NULL,
        title      TEXT    NOT NULL,
        content    TEXT    DEFAULT '',
        is_private INTEGER DEFAULT 1,
        created_at TEXT    DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `, logErr('user_notes'));

    db.run(`
      CREATE TABLE IF NOT EXISTS admin_secrets (
        id     INTEGER PRIMARY KEY AUTOINCREMENT,
        key    TEXT    NOT NULL,
        value  TEXT    NOT NULL
      )
    `, logErr('admin_secrets'));

    // ── Challenge 09: Hidden table — requires enumeration via sqlite_master ──
    db.run(`
      CREATE TABLE IF NOT EXISTS vault_credentials (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        service    TEXT NOT NULL,
        credential TEXT NOT NULL,
        added_at   TEXT DEFAULT (datetime('now'))
      )
    `, logErr('vault_credentials'));

    // ── Challenge 10: Audit log with trigger-based flag ──
    db.run(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        action    TEXT    NOT NULL,
        detail    TEXT    DEFAULT '',
        timestamp TEXT    DEFAULT (datetime('now'))
      )
    `, logErr('audit_log'));

    // ── Challenge 12: Invite codes table for privilege escalation ──
    db.run(`
      CREATE TABLE IF NOT EXISTS invite_codes (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        code      TEXT    UNIQUE NOT NULL,
        role      TEXT    NOT NULL,
        used      INTEGER DEFAULT 0,
        used_by   INTEGER DEFAULT NULL
      )
    `, logErr('invite_codes'));

    // ─── Seed users ───────────────────────────────────────────────────────
    db.run(`INSERT OR IGNORE INTO users (username, password, email, role, api_key)
            VALUES ('admin', 'admin123', 'admin@booktracker.local', 'admin', 'sk-admin-9f8e7d6c5b4a3210')`);
    db.run(`INSERT OR IGNORE INTO users (username, password, email, role, api_key)
            VALUES ('alice', 'password', 'alice@booktracker.local', 'user', 'sk-alice-1a2b3c4d5e6f7890')`);
    db.run(`INSERT OR IGNORE INTO users (username, password, email, role, api_key)
            VALUES ('bob', 'bob1234', 'bob@booktracker.local', 'user', 'sk-bob-0987654321fedcba')`);
    db.run(`INSERT OR IGNORE INTO users (username, password, email, role, api_key)
            VALUES ('charlie', 'ch@rli3!', 'charlie@booktracker.local', 'moderator', NULL)`);

    // ─── Seed secrets (multi-layer) ───────────────────────────────────────
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (1, 'FLAG_1', 'DevNull{sql_injection_login_bypass}')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (2, 'FLAG_2', 'DevNull{union_select_data_exfil}')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (3, 'FLAG_3', 'DevNull{blind_sqli_boolean_master}')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (4, 'FLAG_4', 'DevNull{stacked_queries_rce_chain}')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (5, 'FLAG_5', 'DevNull{second_order_injection_pro}')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (6, 'DB_BACKUP_KEY', 'xK9#mP2$vL5nQ8wR')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (7, 'JWT_SECRET', 'super-secret-jwt-key-do-not-share')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (8, 'MASTER_FLAG', 'DevNull{you_owned_the_entire_database}')`);

    // ─── Seed vault credentials (hidden table challenge) ──────────────────
    db.run(`INSERT OR IGNORE INTO vault_credentials (id, service, credential)
            VALUES (1, 'AWS_ROOT', 'AKIA3EXAMPLE7KEY9012')`);
    db.run(`INSERT OR IGNORE INTO vault_credentials (id, service, credential)
            VALUES (2, 'STRIPE_LIVE', 'sk_live_51ExAmPlEkEy000000')`);
    db.run(`INSERT OR IGNORE INTO vault_credentials (id, service, credential)
            VALUES (3, 'FLAG_VAULT', 'DevNull{hidden_table_recon_pwned}')`);

    // ─── Seed invite codes (privilege escalation challenge) ───────────────
    db.run(`INSERT OR IGNORE INTO invite_codes (id, code, role, used)
            VALUES (1, 'ADMIN-OVERRIDE-7X9Q', 'admin', 0)`);
    db.run(`INSERT OR IGNORE INTO invite_codes (id, code, role, used)
            VALUES (2, 'MOD-INVITE-3K8P', 'moderator', 0)`);
    db.run(`INSERT OR IGNORE INTO invite_codes (id, code, role, used)
            VALUES (3, 'FLAG_CODE', 'DevNull{invite_code_priv_escalation}', 0)`);

    // Normalize seeded flags for existing databases where INSERT OR IGNORE
    // would otherwise leave older flag formats in place.
    db.run(`UPDATE admin_secrets
            SET value = CASE key
              WHEN 'FLAG_1' THEN 'DevNull{sql_injection_login_bypass}'
              WHEN 'FLAG_2' THEN 'DevNull{union_select_data_exfil}'
              WHEN 'FLAG_3' THEN 'DevNull{blind_sqli_boolean_master}'
              WHEN 'FLAG_4' THEN 'DevNull{stacked_queries_rce_chain}'
              WHEN 'FLAG_5' THEN 'DevNull{second_order_injection_pro}'
              WHEN 'MASTER_FLAG' THEN 'DevNull{you_owned_the_entire_database}'
              ELSE value
            END
            WHERE key IN ('FLAG_1', 'FLAG_2', 'FLAG_3', 'FLAG_4', 'FLAG_5', 'MASTER_FLAG')`);
    db.run(`UPDATE vault_credentials
            SET credential = 'DevNull{hidden_table_recon_pwned}'
            WHERE service = 'FLAG_VAULT'`);
    db.run(`UPDATE invite_codes
            SET role = 'DevNull{invite_code_priv_escalation}'
            WHERE code = 'FLAG_CODE'`);

    // ─── Seed reading progress ────────────────────────────────────────────
    db.get(`SELECT id FROM users WHERE username = 'admin'`, (err, row) => {
      if (err || !row) return;
      const uid = row.id;
      const seed = [
        [uid, '1984', 'George Orwell', 45],
        [uid, 'Dune', 'Frank Herbert', 80],
        [uid, 'The Hobbit', 'J.R.R. Tolkien', 100],
        [uid, 'Pride and Prejudice', 'Jane Austen', 20],
      ];
      seed.forEach(([u, t, a, p]) => {
        db.run(`
          INSERT OR IGNORE INTO reading_progress (user_id, book_title, author, progress_percentage)
          SELECT ${u}, '${t}', '${a}', ${p}
          WHERE NOT EXISTS (
            SELECT 1 FROM reading_progress WHERE user_id = ${u} AND book_title = '${t}'
          )
        `);
      });

      db.run(`INSERT OR IGNORE INTO book_reviews (id, user_id, book_title, rating, review)
              VALUES (1, ${uid}, '1984', 5, 'A masterpiece of dystopian fiction.')`);
      db.run(`INSERT OR IGNORE INTO book_reviews (id, user_id, book_title, rating, review)
              VALUES (2, ${uid}, 'Dune', 4, 'Epic world-building, a bit slow in parts.')`);

      db.run(`INSERT OR IGNORE INTO user_notes (id, user_id, title, content, is_private)
              VALUES (1, ${uid}, 'Reading Goals 2025', 'Read 50 books this year!', 1)`);
      db.run(`INSERT OR IGNORE INTO user_notes (id, user_id, title, content, is_private)
              VALUES (2, ${uid}, 'Favorite Quotes', 'War is peace. Freedom is slavery. Ignorance is strength.', 0)`);
      db.run(`INSERT OR IGNORE INTO user_notes (id, user_id, title, content, is_private)
              VALUES (3, ${uid}, 'Admin TODO', 'Move FLAG_5 to a secure vault. Also rotate the JWT secret.', 1)`);

      // Seed an audit log entry as breadcrumb
      db.run(`INSERT OR IGNORE INTO audit_log (id, action, detail)
              VALUES (1, 'SYSTEM_INIT', 'Database initialized. Vault table seeded with 3 credentials.')`);
      db.run(`INSERT OR IGNORE INTO audit_log (id, action, detail)
              VALUES (2, 'SECRET_NOTE', 'DevNull{audit_log_forensics_win}')`);
      db.run(`UPDATE audit_log
              SET detail = 'DevNull{audit_log_forensics_win}'
              WHERE action = 'SECRET_NOTE'`);
    });
  });
}

function logErr(ctx) {
  return (err) => { if (err) console.error(`[DB] Error (${ctx}):`, err.message); };
}

// ─── Query functions ──────────────────────────────────────────────────────────

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 01 — Classic Login Bypass (Easy)                                ║
// ║  Vulnerability: String concat in WHERE clause                              ║
// ║  Technique:     ' OR '1'='1' --                                            ║
// ║  Goal:          Bypass authentication, log in as admin                      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function loginUser(username, password, callback) {
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  db.get(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 02 — Registration-based Second-Order Injection (Medium)         ║
// ║  Vulnerability: User-controlled data stored unsanitized, used later        ║
// ║  Technique:     Register with a crafted username, trigger on profile view  ║
// ║  Goal:          Execute injected SQL when the username is used in later     ║
// ║                 queries (e.g., getUserProfile)                              ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function registerUser(username, password, email, callback) {
  const query = `INSERT INTO users (username, password, email)
                 VALUES ('${username}', '${password}', '${email}')`;
  db.run(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 03 — UNION-Based Data Exfiltration (Medium)                     ║
// ║  Vulnerability: Unsanitized search term in LIKE clause                     ║
// ║  Technique:     ' UNION SELECT id,key,value,1,2 FROM admin_secrets --      ║
// ║  Goal:          Extract flags and secrets from admin_secrets table          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function searchBooks(searchTerm, callback) {
  const query = `SELECT id, book_title, author, progress_percentage, user_id
                 FROM reading_progress
                 WHERE book_title LIKE '%${searchTerm}%' OR author LIKE '%${searchTerm}%'`;
  db.all(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 04 — Boolean-Based Blind SQL Injection (Hard)                   ║
// ║  Vulnerability: User-controlled profile lookup returns exists/not-exists   ║
// ║  Technique:     ' AND SUBSTR((SELECT value FROM admin_secrets WHERE       ║
// ║                 id=1),1,1)='C' --                                          ║
// ║  Goal:          Extract secrets character-by-character via true/false      ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function getUserProfile(username, callback) {
  const query = `SELECT id, username, email, role, bio FROM users WHERE username = '${username}'`;
  db.get(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 05 — ORDER BY Injection (Medium)                                ║
// ║  Vulnerability: sortBy parameter injected directly into ORDER BY clause    ║
// ║  Technique:     (CASE WHEN (SELECT ...) THEN book_title ELSE author END)  ║
// ║  Goal:          Extract data via conditional ordering / error-based SQLi   ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function getReadingProgressSorted(userId, sortBy, sortOrder, callback) {
  const validOrders = ['ASC', 'DESC'];
  const order = validOrders.includes(sortOrder?.toUpperCase()) ? sortOrder : 'ASC';
  const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} ORDER BY ${sortBy} ${order}`;
  db.all(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 06 — Stacked Queries / INSERT Injection (Hard)                  ║
// ║  Vulnerability: db.exec allows multiple statements separated by ;          ║
// ║  Technique:     title'); INSERT INTO admin_secrets ... --                   ║
// ║  Goal:          Write arbitrary data, modify other tables, or drop tables  ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function addUserNote(userId, title, content, isPrivate, callback) {
  const query = `INSERT INTO user_notes (user_id, title, content, is_private)
                 VALUES (${userId}, '${title}', '${content}', ${isPrivate})`;
  db.exec(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 07 — Error-Based Extraction (Medium)                            ║
// ║  Vulnerability: Unsanitized GROUP BY from user input; errors returned raw  ║
// ║  Technique:     Use invalid expressions to trigger errors that leak data   ║
// ║                 e.g., group_by=1; SELECT * FROM admin_secrets              ║
// ║  Goal:          Extract schema info or data through error messages          ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function getReadingStats(userId, groupBy, callback) {
  const query = `SELECT ${groupBy}, COUNT(*) as count, AVG(progress_percentage) as avg_progress
                 FROM reading_progress
                 WHERE user_id = ${userId}
                 GROUP BY ${groupBy}`;
  db.all(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 08 — Integer-Based Injection via Pagination (Medium)            ║
// ║  Vulnerability: LIMIT and OFFSET taken directly from query params          ║
// ║  Technique:     Use LIMIT/OFFSET as injection points:                      ║
// ║                 ?limit=1 UNION SELECT * FROM users --                      ║
// ║  Goal:          Dump full user table or escalate to other tables            ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function getBooksPaginated(userId, limit, offset, callback) {
  const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} LIMIT ${limit} OFFSET ${offset}`;
  db.all(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 09 — Hidden Table Discovery (Hard)                              ║
// ║  Vulnerability: Book detail lookup with unsanitized bookId                 ║
// ║  Technique:     UNION SELECT on sqlite_master to find vault_credentials    ║
// ║                 Then: UNION SELECT from vault_credentials                  ║
// ║  Goal:          Discover hidden tables, extract vault credentials + flag   ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function getBookDetail(bookId, callback) {
  const query = `SELECT rp.*, u.username
                 FROM reading_progress rp
                 JOIN users u ON rp.user_id = u.id
                 WHERE rp.id = ${bookId}`;
  db.get(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 10 — Second-Order via Profile Update (Hard)                     ║
// ║  Vulnerability: Bio/email stored raw, then re-used in string-concat       ║
// ║                 queries elsewhere (e.g., audit log, report generation)     ║
// ║  Technique:     Set bio to SQL payload, then trigger a report/export that  ║
// ║                 uses the stored bio value in a new query                   ║
// ║  Goal:          Achieve second-order SQL injection via stored profile data ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function updateUserProfile(userId, bio, email, callback) {
  const query = `UPDATE users SET bio = '${bio}', email = '${email}' WHERE id = ${userId}`;
  db.run(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 11 — Chained Review Search / Stored Data Injection (Expert)     ║
// ║  Vulnerability: Review content from DB re-injected into a second query     ║
// ║  Technique:     First inject a crafted review via /api/reviews, then       ║
// ║                 trigger /api/reviews/search to execute the stored payload  ║
// ║  Goal:          Multi-step: store payload → trigger second-order execution ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function searchReviewContent(searchTerm, callback) {
  const query = `SELECT * FROM book_reviews WHERE review LIKE '%${searchTerm}%'`;
  db.all(query, callback);
}

// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  CHALLENGE 12 — API Key Bypass + Raw Query Execution (Expert)              ║
// ║  Vulnerability: Admin API key check via string concat; then raw SQL exec   ║
// ║  Technique:     Bypass auth with: ' OR '1'='1                              ║
// ║                 Then execute arbitrary SQL via the query parameter          ║
// ║  Goal:          Full database takeover — read any table, modify data       ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
function verifyAdminApiKey(apiKey, callback) {
  const query = `SELECT * FROM users WHERE api_key = '${apiKey}' AND role = 'admin'`;
  db.get(query, callback);
}

// ─── Standard functions (still contain injection points) ──────────────────────

function getUserById(id, callback) {
  const query = `SELECT * FROM users WHERE id = ${id}`;
  db.get(query, callback);
}

function getReadingProgress(userId, callback) {
  const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} ORDER BY id DESC`;
  db.all(query, callback);
}

function addBookProgress(userId, bookTitle, author, progress, callback) {
  const query = `INSERT INTO reading_progress (user_id, book_title, author, progress_percentage)
                 VALUES (${userId}, '${bookTitle}', '${author}', ${progress})`;
  db.run(query, callback);
}

function updateBookProgress(userId, bookTitle, progress, callback) {
  const query = `UPDATE reading_progress
                 SET progress_percentage = ${progress}
                 WHERE user_id = ${userId} AND book_title = '${bookTitle}'`;
  db.run(query, callback);
}

function deleteBook(userId, bookId, callback) {
  const query = `DELETE FROM reading_progress WHERE id = ${bookId} AND user_id = ${userId}`;
  db.run(query, callback);
}

function addBookReview(userId, bookTitle, rating, review, callback) {
  const query = `INSERT INTO book_reviews (user_id, book_title, rating, review)
                 VALUES (${userId}, '${bookTitle}', ${rating}, '${review}')`;
  db.run(query, callback);
}

function getBookReviews(bookTitle, callback) {
  const query = `SELECT br.*, u.username
                 FROM book_reviews br
                 JOIN users u ON br.user_id = u.id
                 WHERE br.book_title = '${bookTitle}'
                 ORDER BY br.created_at DESC`;
  db.all(query, callback);
}

function getUserNotes(userId, callback) {
  const query = `SELECT * FROM user_notes WHERE user_id = ${userId} ORDER BY created_at DESC`;
  db.all(query, callback);
}

function deleteUserNote(userId, noteId, callback) {
  const query = `DELETE FROM user_notes WHERE id = ${noteId} AND user_id = ${userId}`;
  db.run(query, callback);
}

function getBookByTitle(userId, bookTitle, callback) {
  const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} AND book_title = '${bookTitle}'`;
  db.get(query, callback);
}

// ── New: generate user report (uses stored bio — second-order trigger) ────────
function generateUserReport(userId, callback) {
  db.get(`SELECT * FROM users WHERE id = ${userId}`, (err, user) => {
    if (err || !user) return callback(err, null);
    // Vulnerable: stored bio value is interpolated into a new query
    const reportQuery = `SELECT * FROM user_notes WHERE user_id = ${userId} AND title != '${user.bio}'`;
    db.all(reportQuery, (err2, notes) => {
      callback(err2, { user, notes });
    });
  });
}

// ── New: list audit log entries (for challenge 10 discovery) ──────────────────
function getAuditLog(actionFilter, callback) {
  const query = `SELECT * FROM audit_log WHERE action LIKE '%${actionFilter}%' ORDER BY timestamp DESC`;
  db.all(query, callback);
}

// ── New: redeem invite code (for privilege escalation challenge) ──────────────
function redeemInviteCode(userId, code, callback) {
  const query = `SELECT * FROM invite_codes WHERE code = '${code}' AND used = 0`;
  db.get(query, (err, invite) => {
    if (err) return callback(err, null);
    if (!invite) return callback(null, null);
    // Mark as used and upgrade user
    db.run(`UPDATE invite_codes SET used = 1, used_by = ${userId} WHERE id = ${invite.id}`);
    db.run(`UPDATE users SET role = '${invite.role}' WHERE id = ${userId}`, (err2) => {
      callback(err2, invite);
    });
  });
}

// ── New: export user data as JSON (leaks everything for the user) ─────────────
function exportUserData(userId, tables, callback) {
  // tables param is user-controlled — allows injecting into table name
  const query = `SELECT * FROM ${tables} WHERE user_id = ${userId}`;
  db.all(query, callback);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  db,
  loginUser,
  registerUser,
  getUserById,
  getReadingProgress,
  addBookProgress,
  updateBookProgress,
  deleteBook,
  searchBooks,
  getUserProfile,
  getBookDetail,
  addBookReview,
  getBookReviews,
  searchReviewContent,
  getReadingProgressSorted,
  addUserNote,
  getUserNotes,
  getReadingStats,
  getBooksPaginated,
  updateUserProfile,
  deleteUserNote,
  getBookByTitle,
  verifyAdminApiKey,
  generateUserReport,
  getAuditLog,
  redeemInviteCode,
  exportUserData,
};
