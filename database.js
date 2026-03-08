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

    db.run(`INSERT OR IGNORE INTO users (username, password, email, role, api_key)
            VALUES ('admin', 'admin123', 'admin@booktracker.local', 'admin', 'sk-admin-9f8e7d6c5b4a3210')`);
    db.run(`INSERT OR IGNORE INTO users (username, password, email, role, api_key)
            VALUES ('alice', 'password', 'alice@booktracker.local', 'user', 'sk-alice-1a2b3c4d5e6f7890')`);
    db.run(`INSERT OR IGNORE INTO users (username, password, email, role, api_key)
            VALUES ('bob', 'bob1234', 'bob@booktracker.local', 'user', 'sk-bob-0987654321fedcba')`);

    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (1, 'FLAG', 'CTF{sql_injection_master_2025}')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (2, 'DB_BACKUP_KEY', 'xK9#mP2$vL5nQ8wR')`);
    db.run(`INSERT OR IGNORE INTO admin_secrets (id, key, value)
            VALUES (3, 'JWT_SECRET', 'super-secret-jwt-key-do-not-share')`);

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
    });
  });
}

function logErr(ctx) {
  return (err) => { if (err) console.error(`[DB] Error (${ctx}):`, err.message); };
}

// ─── Query functions ──────────────────────────────────────────────────────────

function loginUser(username, password, callback) {
  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
  db.get(query, callback);
}

function registerUser(username, password, email, callback) {
  const query = `INSERT INTO users (username, password, email)
                 VALUES ('${username}', '${password}', '${email}')`;
  db.run(query, callback);
}

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

function searchBooks(searchTerm, callback) {
  const query = `SELECT id, book_title, author, progress_percentage, user_id
                 FROM reading_progress
                 WHERE book_title LIKE '%${searchTerm}%' OR author LIKE '%${searchTerm}%'`;
  db.all(query, callback);
}

function getUserProfile(username, callback) {
  const query = `SELECT id, username, email, role, bio FROM users WHERE username = '${username}'`;
  db.get(query, callback);
}

function getBookDetail(bookId, callback) {
  const query = `SELECT rp.*, u.username
                 FROM reading_progress rp
                 JOIN users u ON rp.user_id = u.id
                 WHERE rp.id = ${bookId}`;
  db.get(query, callback);
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

function searchReviewContent(searchTerm, callback) {
  const query = `SELECT * FROM book_reviews WHERE review LIKE '%${searchTerm}%'`;
  db.all(query, callback);
}

function getReadingProgressSorted(userId, sortBy, sortOrder, callback) {
  const validOrders = ['ASC', 'DESC'];
  const order = validOrders.includes(sortOrder?.toUpperCase()) ? sortOrder : 'ASC';
  const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} ORDER BY ${sortBy} ${order}`;
  db.all(query, callback);
}

function addUserNote(userId, title, content, isPrivate, callback) {
  const query = `INSERT INTO user_notes (user_id, title, content, is_private)
                 VALUES (${userId}, '${title}', '${content}', ${isPrivate})`;
  db.exec(query, callback);
}

function getUserNotes(userId, callback) {
  const query = `SELECT * FROM user_notes WHERE user_id = ${userId} ORDER BY created_at DESC`;
  db.all(query, callback);
}

function getReadingStats(userId, groupBy, callback) {
  const query = `SELECT ${groupBy}, COUNT(*) as count, AVG(progress_percentage) as avg_progress
                 FROM reading_progress
                 WHERE user_id = ${userId}
                 GROUP BY ${groupBy}`;
  db.all(query, callback);
}

function getBooksPaginated(userId, limit, offset, callback) {
  const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} LIMIT ${limit} OFFSET ${offset}`;
  db.all(query, callback);
}

function updateUserProfile(userId, bio, email, callback) {
  const query = `UPDATE users SET bio = '${bio}', email = '${email}' WHERE id = ${userId}`;
  db.run(query, callback);
}

function deleteUserNote(userId, noteId, callback) {
  const query = `DELETE FROM user_notes WHERE id = ${noteId} AND user_id = ${userId}`;
  db.run(query, callback);
}

function getBookByTitle(userId, bookTitle, callback) {
  const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} AND book_title = '${bookTitle}'`;
  db.get(query, callback);
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
};
