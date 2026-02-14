# SmartReviewInsights 2.0

Next.js + Neon(Postgres) + Prisma MVP for slug-preserving migration from WordPress.

## 1) Setup

```bash
npm install
cp .env.example .env
# fill DATABASE_URL + ADMIN_TOKEN + provider credentials
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed
npm run dev
```

## 2) Environment

Create `.env` with:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DB?sslmode=require"
ADMIN_TOKEN="change-this-admin-token"

AMAZON_CREATOR_CREDENTIAL_ID=""
AMAZON_CREATOR_CREDENTIAL_SECRET=""
AMAZON_CREATOR_CREDENTIAL_VERSION="2.1"
AMAZON_CREATOR_PARTNER_TAG="yourtag-20"
AMAZON_CREATOR_MARKETPLACE="www.amazon.com"
AMAZON_CREATOR_API_BASE_URL="https://creatorsapi.amazon/catalog/v1"
AMAZON_CREATOR_AUTH_URL="https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token"
AMAZON_API_ENABLED="0"

GOOGLE_CSE_API_KEY=""
GOOGLE_CSE_CX=""
# or legacy aliases:
# GOOGLE_API_KEY=""
# GOOGLE_CX=""
```

## 3) Modes

- `AMAZON_API_ENABLED=0` (default): no Amazon API dependency, automation uses link generation / Google CSE discovery.
- `AMAZON_API_ENABLED=1`: Amazon Creators API discovery + sync.

## 4) Automation Sources

Automation supports source-scoped niches for:
- `AMAZON`
- `ALIEXPRESS`
- `TEMU`
- `ALIBABA`
- `EBAY`

With `GOOGLE_CSE_API_KEY` + `GOOGLE_CSE_CX` (or `GOOGLE_API_KEY` + `GOOGLE_CX`), run mode discovers links from selected source domains and ingests them as offers.

## 5) Routes

- `/` home listing
- `/category/...` category landing
- `/<anything>` catch-all page by slug
- `/sitemap.xml` dynamic sitemap
- `/robots.txt` robots rules
- `/admin/login` private admin login (session cookie)
- `/admin/affiliates` affiliate admin
- `/admin/posts` post/page editor (edit/delete)
- `/admin/automation` automation setup + run log + Amazon connection test
- `/admin/analytics` click analytics

## 6) WordPress import (WXR)

```bash
npm run import:wxr -- ./wordpress-export.xml
```

This imports `post` and `page` entries into `Page` with HTML->Markdown conversion.
