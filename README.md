# Glass

Dashboard that aggregates AI, MedTech, DefenceTech, and broader technology headlines, classifies each item, and provides live filtering.

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
   - `glass.secatr.com`
4. In secatr **Advanced DNS**, add:
   - Type: `CNAME`
   - Host: `glass`
   - Target: your Render hostname (for example `glass.onrender.com`)
5. Wait for SSL provisioning, then open:
   - `https://glass.secatr.com`

## What it includes

- Aggregated feed API at `/api/news`
- Source deduplication and sorting by publish date
- Impact tagging (`High`, `Medium`, `Low`)
- Category tagging (AI, MedTech, DefenceTech, cybersecurity, cloud, semiconductors, etc.)
- Geolocation inference for major countries/cities mentioned in each story
- Global world map with traffic-light impact hotspots
- Frontend dashboard with:
  - Search
  - Location filter
  - Impact filter
  - Click map marker to focus related story
  - Auto-refresh every 5 minutes
