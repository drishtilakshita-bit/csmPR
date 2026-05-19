# CSM Metrics Dashboard

Customer Success Metrics dashboard that reads from **Metabase** query cards. Each metric is one Metabase card; filters (account ID, start date, end date) are passed to Metabase as query parameters.

- **Frontend**: Next.js (App Router) + shadcn/ui, deployed on **Vercel**
- **Backend**: Next.js API routes (Vercel Serverless Functions) proxy requests to Metabase so the API key never hits the browser

## Prerequisites

- **Metabase** instance with query cards that use template tags: `account_id`, `start_date`, `end_date`
- **Metabase API key** with access to those cards

## Setup

1. **Install dependencies**

   ```bash
   cd "/Users/namratapanga/Desktop/CSM Dashoard"
   npm install
   ```

2. **Environment variables**

   Copy `.env.example` to `.env.local` and set:

   - `METABASE_SITE_URL` – base URL of your Metabase instance (e.g. `https://metabase.yourcompany.com`)
   - `METABASE_API_KEY` – API key from Metabase (Admin → Settings → Authentication → API Keys)

3. **Configure metrics**

   Edit `lib/metrics-config.ts`: add an entry per metric (`metricKey → { cardId, label, cardType }`). Ensure each Metabase card has SQL variables `{{account_id}}`, `{{start_date}}`, `{{end_date}}`.

4. **Run locally**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000), set account ID and date range, then click **Apply**.

## Deploy on Vercel

1. Push the repo to GitHub and import the project in [Vercel](https://vercel.com).
2. In **Settings → Environment Variables**, add `METABASE_SITE_URL` and `METABASE_API_KEY`.
3. Deploy; each push can auto-deploy.

## Adding a new metric

1. In Metabase, create a new question with a native SQL query using `{{account_id}}`, `{{start_date}}`, `{{end_date}}`.
2. Note the card ID (e.g. from the URL: `/question/123` → card ID `123`).
3. In `lib/metrics-config.ts`, add a new key to `METRICS_CONFIG` with `cardId`, `label`, and `cardType` (`"number"` | `"table"` | `"chart"`).
4. Redeploy; the new metric appears on the dashboard.

## File structure

- `app/page.tsx` – Dashboard page (filters + metric cards grid)
- `app/api/metrics/route.ts` – List of metrics
- `app/api/metrics/[cardId]/route.ts` – Proxy to Metabase card query
- `app/components/FilterBar.tsx` – Account ID, start/end date, Apply
- `app/components/MetricCard.tsx` – Fetches and displays one metric
- `lib/metrics-config.ts` – Metric key → card ID and display config
- `lib/metabase.ts` – Build parameters and call Metabase API (server-only)
