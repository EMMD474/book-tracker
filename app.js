/**
 * app.js — Express server for Book Reading Tracker
 *
 * Run:  npm install && npm start
 * Then: http://localhost:3000
 *
 * Demo credentials:
 *   admin / admin123
 *   alice / password
 *   bob   / bob1234
 */

'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const {
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
} = require('./database');

// ─── Book catalogue ───────────────────────────────────────────────────────────

const BOOKS = {
  '1984': { file: '1984.pdf', title: '1984', author: 'George Orwell' },
  'dune': { file: 'dune.pdf', title: 'Dune', author: 'Frank Herbert' },
  'the-hobbit': { file: 'the-hobbit.pdf', title: 'The Hobbit', author: 'J.R.R. Tolkien' },
  'brave-new-world': { file: 'brave-new-world.pdf', title: 'Brave New World', author: 'Aldous Huxley' },
  'pride-and-prejudice': { file: null, title: 'Pride and Prejudice', author: 'Jane Austen' },
  'great-gatsby': { file: null, title: 'The Great Gatsby', author: 'F. Scott Fitzgerald' },
};

const TITLE_TO_SLUG = Object.fromEntries(
  Object.entries(BOOKS).map(([slug, b]) => [b.title, slug])
);

const app = express();
const PORT = 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const userId = req.cookies.user_id;
  const username = req.cookies.username;

  if (!userId || !username) {
    const returnTo = encodeURIComponent(req.originalUrl);
    return res.redirect('/login.html?returnTo=' + returnTo);
  }
  req.userId = userId;
  req.username = username;
  next();
}

function htmlPage(title, body, username = null) {
  const navRight = username
    ? `<a href="/dashboard">My Books</a>
      <span class="nav-greeting">Hi, <strong>${username}</strong></span>
      <a href="/logout" class="btn btn-small btn-outline">Logout</a>`
    : `<a href="/login.html" class="btn btn-small">Login</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — BookTracker</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <nav class="navbar">
    <a class="navbar-brand" href="/">📚 BookTracker</a>
    <div class="navbar-links">
      <a href="/">Home</a>
      ${navRight}
    </div>
  </nav>
  <main class="container">
    ${body}
  </main>
  <footer class="footer">
    <p>BookTracker &copy; 2025</p>
  </footer>
</body>
</html>`;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.post('/login', (req, res) => {
  const { username, password, _returnTo } = req.body;

  if (!username || !password) {
    return res.redirect('/login.html?error=missing');
  }

  loginUser(username, password, (err, user) => {
    if (err) {
      return res.send(htmlPage('Error', `
        <div class="alert alert-danger"><strong>Something went wrong:</strong> ${err.message}</div>
        <a href="/login.html" class="btn">Back to Login</a>
      `));
    }

    if (user) {
      res.cookie('user_id', String(user.id), { maxAge: 86400000, httpOnly: false });
      res.cookie('username', user.username, { maxAge: 86400000, httpOnly: false });
      return res.redirect(_returnTo || '/dashboard');
    }

    return res.redirect('/login.html?error=invalid');
  });
});

app.post('/register', (req, res) => {
  const { username, password, email } = req.body;

  if (!username || !password) {
    return res.redirect('/register.html?error=missing');
  }

  registerUser(username, password, email || '', (err) => {
    if (err) {
      return res.send(htmlPage('Registration Error', `
        <div class="alert alert-danger">
          <strong>Registration failed:</strong> ${err.message}
        </div>
        <a href="/register.html" class="btn">Try Again</a>
      `));
    }
    return res.redirect('/login.html?registered=1');
  });
});

app.get('/dashboard', requireAuth, (req, res) => {
  const userId = req.userId;
  const username = req.username;

  getReadingProgress(userId, (err, books) => {
    if (err) {
      return res.send(htmlPage('Error', `
        <div class="alert alert-danger"><strong>Could not load reading list:</strong> ${err.message}</div>
      `, username));
    }

    const totalBooks = books.length;
    const completedBooks = books.filter(b => b.progress_percentage >= 100).length;
    const inProgress = books.filter(b => b.progress_percentage > 0 && b.progress_percentage < 100).length;
    const avgProgress = totalBooks
      ? Math.round(books.reduce((s, b) => s + b.progress_percentage, 0) / totalBooks)
      : 0;

    const statsBar = `
      <div class="stats-bar">
        <div class="stat-card">
          <span class="stat-number">${totalBooks}</span>
          <span class="stat-label">Books Tracked</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${inProgress}</span>
          <span class="stat-label">In Progress</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${completedBooks}</span>
          <span class="stat-label">Completed</span>
        </div>
        <div class="stat-card">
          <span class="stat-number">${avgProgress}%</span>
          <span class="stat-label">Avg Progress</span>
        </div>
      </div>
    `;

    const bookRows = books.length
      ? books.map(book => {
        const slug = TITLE_TO_SLUG[book.book_title];
        const readBtn = slug
          ? `<a href="/read?title=${slug}" class="btn btn-small">Continue Reading</a>`
          : '';
        return `
            <tr>
              <td class="book-title-cell">
                ${book.book_title}
                <span class="book-author" style="display:block">${book.author}</span>
              </td>
              <td>
                <div class="progress-container">
                  <div class="progress-fill" style="width:${book.progress_percentage}%"></div>
                </div>
                <span class="progress-label">${book.progress_percentage}%</span>
              </td>
              <td>
                <div class="dash-actions">
                  ${readBtn}
                  <form method="POST" action="/update-progress" class="inline-form">
                    <input type="hidden" name="book_title" value="${book.book_title}">
                    <input type="number" name="progress" value="${book.progress_percentage}"
                           min="0" max="100" class="progress-input">
                    <button type="submit" class="btn btn-small">Save</button>
                  </form>
                  <form method="POST" action="/delete-book" class="inline-form">
                    <input type="hidden" name="book_id" value="${book.id}">
                    <button type="submit" class="btn btn-small btn-danger">Remove</button>
                  </form>
                </div>
              </td>
            </tr>
          `;
      }).join('')
      : `<tr><td colspan="3" class="empty-state">No books yet — click any book on the home page to start reading!</td></tr>`;

    const body = `
      <div class="dashboard-header">
        <h1>Welcome back, ${username}!</h1>
        <p class="subtitle">Track your reading journey</p>
      </div>

      ${statsBar}

      <section class="card">
        <h2>Your Reading List</h2>
        <div class="table-wrapper">
          <table class="data-table">
            <thead>
              <tr>
                <th>Book</th>
                <th>Progress</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${bookRows}</tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>Add Another Book</h2>
        <p style="color:var(--clr-muted);font-size:.88rem;margin-bottom:1rem;">
          Books opened from the home page are added automatically.
          Use this form to track any other book.
        </p>
        <form method="POST" action="/add-book" class="add-book-form">
          <div class="form-row">
            <div class="form-group">
              <label for="book_title">Title *</label>
              <input type="text" id="book_title" name="book_title"
                     placeholder="e.g. The Great Gatsby" required>
            </div>
            <div class="form-group">
              <label for="author">Author</label>
              <input type="text" id="author" name="author"
                     placeholder="e.g. F. Scott Fitzgerald">
            </div>
            <div class="form-group">
              <label for="progress">Progress (%)</label>
              <input type="number" id="progress" name="progress"
                     min="0" max="100" value="0">
            </div>
          </div>
          <button type="submit" class="btn">Add Book</button>
        </form>
      </section>
    `;

    return res.send(htmlPage('Dashboard', body, username));
  });
});

app.post('/add-book', requireAuth, (req, res) => {
  const userId = req.userId;
  const bookTitle = req.body.book_title || '';
  const author = req.body.author || 'Unknown';
  const progress = parseInt(req.body.progress, 10) || 0;
  const redirect = req.body._redirect || '/dashboard';

  addBookProgress(userId, bookTitle, author, progress, (err) => {
    if (err) {
      return res.send(htmlPage('Error', `
        <div class="alert alert-danger">
          <strong>Failed to add book:</strong> ${err.message}
        </div>
        <a href="/dashboard" class="btn">Back to Dashboard</a>
      `));
    }
    return res.redirect(redirect);
  });
});

app.post('/update-progress', requireAuth, (req, res) => {
  const userId = req.userId;
  const bookTitle = req.body.book_title || '';
  const progress = parseInt(req.body.progress, 10) || 0;
  const redirect = req.body._redirect || '/dashboard';

  updateBookProgress(userId, bookTitle, progress, (err) => {
    if (err) {
      return res.send(htmlPage('Error', `
        <div class="alert alert-danger">
          <strong>Failed to update progress:</strong> ${err.message}
        </div>
        <a href="/dashboard" class="btn">Back to Dashboard</a>
      `));
    }
    return res.redirect(redirect);
  });
});

app.post('/delete-book', requireAuth, (req, res) => {
  const userId = req.userId;
  const bookId = req.body.book_id;

  deleteBook(userId, bookId, (err) => {
    if (err) {
      return res.send(htmlPage('Error', `
        <div class="alert alert-danger">
          <strong>Failed to remove book:</strong> ${err.message}
        </div>
        <a href="/dashboard" class="btn">Back to Dashboard</a>
      `));
    }
    return res.redirect('/dashboard');
  });
});

app.get('/read', requireAuth, (req, res) => {
  const slug = req.query.title || '';
  const book = BOOKS[slug];
  const userId = req.userId;
  const username = req.username;

  if (!book) {
    return res.status(404).send(htmlPage('Not Found', `
      <div class="alert alert-danger">Book not found or no PDF available.</div>
      <a href="/" class="btn">Back to Home</a>
    `, username));
  }

  function renderReader(progress) {
    const trackerPanel = `
      <div class="tracker-panel">
        <span class="tracker-label">📖 Your progress</span>
        <div class="tracker-progress">
          <div class="progress-container">
            <div class="progress-fill" style="width:${progress}%"></div>
          </div>
          <span class="progress-label">${progress}%</span>
        </div>
        <form method="POST" action="/update-progress" class="inline-form">
          <input type="hidden" name="book_title" value="${book.title}">
          <input type="hidden" name="_redirect"  value="/read?title=${slug}">
          <input type="number" name="progress" value="${progress}"
                 min="0" max="100" class="progress-input" title="Update %">
          <button type="submit" class="btn btn-small">Save Progress</button>
        </form>
      </div>`;

    const readerContent = book.file
      ? `<div class="reader-frame-wrap">
           <iframe class="reader-frame" src="/pdf/${slug}"
                   title="${book.title}" allowfullscreen></iframe>
         </div>`
      : `<div class="no-pdf-notice">
           <div class="no-pdf-icon">📄</div>
           <h2>${book.title}</h2>
           <p>A PDF for this book isn't available yet, but it's been added to your reading list so you can track your progress.</p>
           <a href="/" class="btn btn-outline">Back to Library</a>
         </div>`;

    const body = `
      <div class="reader-header">
        <div class="reader-meta">
          <h1 class="reader-title">${book.title}</h1>
          <p class="reader-author">${book.author}</p>
        </div>
        ${trackerPanel}
        <div class="reader-actions">
          <a href="/dashboard" class="btn btn-outline btn-small">My Books</a>
          <a href="/"          class="btn btn-small">Home</a>
        </div>
      </div>
      ${readerContent}
    `;
    return res.send(htmlPage(book.title, body, username));
  }

  getReadingProgress(userId, (err, rows) => {
    const all = err ? [] : rows;
    const tracked = all.find(b => b.book_title === book.title);

    if (tracked) {
      return renderReader(tracked.progress_percentage);
    }

    addBookProgress(userId, book.title, book.author, 0, () => {
      renderReader(0);
    });
  });
});

app.get('/pdf/:slug', requireAuth, (req, res) => {
  const book = BOOKS[req.params.slug];

  if (!book || !book.file) {
    return res.status(404).send('PDF not available');
  }

  const filePath = path.join(__dirname, 'books', book.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('PDF file missing on server');
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${book.file}"`);
  fs.createReadStream(filePath).pipe(res);
});

app.get('/logout', (req, res) => {
  res.clearCookie('user_id');
  res.clearCookie('username');
  return res.redirect('/login.html?logout=1');
});

// ─── API Endpoints ───────────────────────────────────────────────────────────

app.get('/api/search', (req, res) => {
  const q = req.query.q || '';

  if (!q) {
    return res.json({ results: [], message: 'Provide a search term via ?q=' });
  }

  searchBooks(q, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message, query_hint: `Search term was: ${q}` });
    }
    return res.json({ results: rows, count: rows.length });
  });
});

app.get('/api/profile/:username', (req, res) => {
  const username = req.params.username;

  getUserProfile(username, (err, user) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!user) {
      return res.status(404).json({ error: 'User not found', searched: username });
    }
    return res.json({ profile: user });
  });
});

app.get('/api/book/:id', (req, res) => {
  const bookId = req.params.id;

  getBookDetail(bookId, (err, book) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }
    return res.json({ book });
  });
});

app.post('/api/reviews', requireAuth, (req, res) => {
  const userId = req.userId;
  const bookTitle = req.body.book_title || '';
  const rating = parseInt(req.body.rating, 10) || 5;
  const review = req.body.review || '';

  if (!bookTitle) {
    return res.status(400).json({ error: 'book_title is required' });
  }

  addBookReview(userId, bookTitle, rating, review, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json({ success: true, message: 'Review added' });
  });
});

app.get('/api/reviews/:bookTitle', (req, res) => {
  const bookTitle = req.params.bookTitle;

  getBookReviews(bookTitle, (err, reviews) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json({ reviews, count: reviews.length });
  });
});

app.get('/api/reviews/search', (req, res) => {
  const q = req.query.q || '';

  searchReviewContent(q, (err, reviews) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (reviews.length > 0) {
      const firstReviewText = reviews[0].review;
      const reportQuery = `SELECT * FROM book_reviews WHERE review = '${firstReviewText}'`;
      const { db } = require('./database');
      db.all(reportQuery, (err2, reportRows) => {
        if (err2) {
          return res.status(500).json({
            error: err2.message,
            note: 'Error occurred during report generation from stored review data'
          });
        }
        return res.json({ reviews, report: reportRows });
      });
    } else {
      return res.json({ reviews: [], report: [] });
    }
  });
});

app.get('/api/books', requireAuth, (req, res) => {
  const userId = req.userId;
  const sortBy = req.query.sort || 'id';
  const order = req.query.order || 'DESC';

  getReadingProgressSorted(userId, sortBy, order, (err, books) => {
    if (err) {
      return res.status(500).json({ error: err.message, sort: sortBy, order });
    }
    return res.json({ books, count: books.length });
  });
});

app.post('/api/notes', requireAuth, (req, res) => {
  const userId = req.userId;
  const title = req.body.title || '';
  const content = req.body.content || '';
  const isPrivate = req.body.is_private !== undefined ? req.body.is_private : 1;

  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }

  addUserNote(userId, title, content, isPrivate, (err) => {
    if (err) {
      return res.status(500).json({
        error: err.message,
        hint: 'Note creation failed — check your input'
      });
    }
    return res.json({ success: true, message: 'Note created' });
  });
});

app.get('/api/notes', requireAuth, (req, res) => {
  const userId = req.userId;

  getUserNotes(userId, (err, notes) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json({ notes, count: notes.length });
  });
});

app.delete('/api/notes/:id', requireAuth, (req, res) => {
  const userId = req.userId;
  const noteId = req.params.id;

  deleteUserNote(userId, noteId, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json({ success: true, message: 'Note deleted' });
  });
});

app.get('/api/stats', requireAuth, (req, res) => {
  const userId = req.userId;
  const groupBy = req.query.group_by || 'author';

  getReadingStats(userId, groupBy, (err, stats) => {
    if (err) {
      return res.status(500).json({
        error: err.message,
        attempted_group: groupBy
      });
    }
    return res.json({ stats, grouped_by: groupBy });
  });
});

app.get('/api/books/page', requireAuth, (req, res) => {
  const userId = req.userId;
  const limit = req.query.limit || '10';
  const offset = req.query.offset || '0';

  getBooksPaginated(userId, limit, offset, (err, books) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json({ books, count: books.length, limit, offset });
  });
});

app.post('/api/profile', requireAuth, (req, res) => {
  const userId = req.userId;
  const bio = req.body.bio || '';
  const email = req.body.email || '';

  updateUserProfile(userId, bio, email, (err) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    return res.json({ success: true, message: 'Profile updated' });
  });
});

app.get('/api/my-book', requireAuth, (req, res) => {
  const userId = req.userId;
  const bookTitle = req.query.title || '';

  getBookByTitle(userId, bookTitle, (err, book) => {
    if (err) {
      return res.status(500).json({
        error: err.message,
        detail: `Failed to look up book: ${bookTitle}`,
        sql_hint: 'Check the book title format'
      });
    }
    if (!book) {
      return res.status(404).json({ error: 'Book not found in your list', title: bookTitle });
    }
    return res.json({ book });
  });
});

app.post('/api/admin/query', (req, res) => {
  const apiKey = req.headers['x-api-key'] || req.body.api_key || '';
  const sql = req.body.query || '';

  const authQuery = `SELECT * FROM users WHERE api_key = '${apiKey}' AND role = 'admin'`;

  const { db } = require('./database');
  db.get(authQuery, (err, admin) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!admin) {
      return res.status(403).json({ error: 'Invalid API key or insufficient privileges' });
    }

    db.all(sql, (err2, rows) => {
      if (err2) {
        return res.status(500).json({ error: err2.message, query: sql });
      }
      return res.json({ results: rows, count: rows.length, executed: sql });
    });
  });
});

// ─── 404 fallback ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  res.status(404).send(htmlPage('Not Found', `
    <div class="alert alert-danger">Page not found.</div>
    <a href="/" class="btn">Go Home</a>
  `));
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[APP] BookTracker running → http://localhost:${PORT}`);
  console.log('[APP] Demo credentials:  admin/admin123  alice/password  bob/bob1234');
});
