# Alohomora

Dashboard that aggregates cybersecurity headlines from major RSS sources, classifies each item, and provides live filtering.

## Run

1. Install Node.js 18+.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:3000`.

## Deploy (Render + secatr DNS)

1. Push this repo to GitHub.
2. In Render, create a new **Blueprint** service from the repo.
   - Render will detect `render.yaml`.
   - Health check path is `/healthz`.
3. After deploy, in Render open your web service and add custom domain:
   - `alohomora.secatr.com`
4. In secatr **Advanced DNS**, add:
   - Type: `CNAME`
   - Host: `alohomora`
   - Target: your Render hostname (for example `alohomora.onrender.com`)
5. Wait for SSL provisioning, then open:
   - `https://alohomora.secatr.com`

## What it includes

- Aggregated feed API at `/api/news`
- Source deduplication and sorting by publish date
- Severity tagging (`Critical`, `High`, `Medium`, `Low`)
- Category tagging (ransomware, vulnerability, breach, etc.)
- Geolocation inference for major countries/cities mentioned in each story
- Global world map with severity-colored hotspots
- Frontend dashboard with:
  - Search
  - Location filter
  - Severity filter
  - Click map marker to focus related story
  - Auto-refresh every 5 minutes
