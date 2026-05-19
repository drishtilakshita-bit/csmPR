# CSM Metrics Dashboard – To Do

Basic steps to get the dashboard running and add metrics.

---

## 1. Install and run locally

- [ ] Open terminal and go to the project folder:
  ```bash
  cd "/Users/namratapanga/Desktop/CSM Dashoard"
  ```
- [ ] Install dependencies (if not done yet):
  ```bash
  npm install
  ```
- [ ] Copy `.env.example` to `.env.local`
- [ ] In `.env.local`, set:
  - `METABASE_SITE_URL` = your Metabase URL (e.g. `https://metabase.yourcompany.com`)
  - `METABASE_API_KEY` = your Metabase API key
- [ ] Start the app:
  ```bash
  npm run dev
  ```
- [ ] Open [http://localhost:3000](http://localhost:3000) and check that the dashboard loads

---

## 2. Configure Metabase

- [ ] In Metabase, create or open a **Question** (native SQL) for each metric you want
- [ ] In the SQL, add the three variables and use them in the query:
  - `{{account_id}}`
  - `{{start_date}}`
  - `{{end_date}}`
  (Example: `WHERE account_id = {{account_id}} AND date BETWEEN {{start_date}} AND {{end_date}}`)
- [ ] Save the question and note its **card ID** (from the URL, e.g. `/question/123` → card ID is `123`)
- [ ] Create an **API key** in Metabase (Admin → Settings → Authentication → API Keys) and give the key access to the collections that contain these questions

---

## 3. Add metrics to the dashboard

- [ ] Open `lib/metrics-config.ts`
- [ ] For each Metabase card you want on the dashboard, add or edit an entry in `METRICS_CONFIG`:
  - Use a short **key** (e.g. `conversations_count`)
  - Set **cardId** to the Metabase card ID
  - Set **label** to what you want to show on the dashboard
  - Set **cardType** to `"number"` (one value), `"table"` (rows/columns), or `"chart"`
- [ ] Restart `npm run dev` if it’s running; the new metrics should appear on the dashboard

---

## 4. Deploy on Vercel

- [ ] Push the project to GitHub (or your Git provider)
- [ ] In [Vercel](https://vercel.com), create a new project and import this repo
- [ ] In the project’s **Settings → Environment Variables**, add:
  - `METABASE_SITE_URL`
  - `METABASE_API_KEY`
- [ ] Deploy; later pushes to the main branch can auto-deploy if you enable that

---

## 5. Use the dashboard

- [ ] Enter an **Account ID** in the filter
- [ ] Choose **Start date** and **End date**
- [ ] Click **Apply**
- [ ] Confirm that the metric cards load with data from Metabase

---

## Quick reference

| Task | Where |
|------|--------|
| Metabase URL and API key | `.env.local` |
| List of metrics and card IDs | `lib/metrics-config.ts` |
| Metabase API call (server-only) | `lib/metabase.ts` |
| Run app locally | `npm run dev` |
| Build for production | `npm run build` |
