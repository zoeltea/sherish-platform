# Sherish Platform - Backend Deployment & Database Migration Guide

This guide describes how to deploy the Sherish backend API, configure environment variables, execute database migrations using Prisma, and perform rollbacks in case of deployment failures.

---

## 1. Required Environment Variables

Ensure the following environment variables are set in production (`.env` or container orchestration platform):

| Variable | Description | Example / Default | Required |
|---|---|---|---|
| `PORT` | HTTP Server port | `8000` (Docker internal) / `8095` (Host) | Yes |
| `NODE_ENV` | Environment mode | `production` or `development` | Yes |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/sherish_db?schema=public` | Yes |
| `JWT_SECRET` | Secret key for signing JWT tokens | `min_32_chars_random_secure_key` | Yes |
| `STORAGE_DIR` | Directory for uploaded media files | `/app/storage/uploads` | Yes |
| `MIDTRANS_SERVER_KEY` | Midtrans Server Key | `SB-Mid-server-xxxx` (Sandbox) / `Mid-server-xxxx` (Prod) | Yes |
| `MIDTRANS_CLIENT_KEY` | Midtrans Client Key | `SB-Mid-client-xxxx` (Sandbox) / `Mid-client-xxxx` (Prod) | Yes |
| `MIDTRANS_IS_PRODUCTION` | Midtrans production mode flag | `false` (Sandbox) or `true` (Live) | Yes |
| `BACKEND_URL` | Public backend base URL | `https://api.sherish.id` | Yes |
| `ZEPHYR_BOT_TOKEN` | Telegram Bot Token for notification bot | `123456789:ABCdef...` | Optional |
| `ZEPHYR_BOT_NAME` | Telegram Bot username | `@agent_zoel_zephyr_bot` | Optional |
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` | Optional |
| `SMTP_PORT` | SMTP server port | `587` | Optional |
| `SMTP_USER` | SMTP username / email | `notifications@sherish.id` | Optional |
| `SMTP_PASS` | SMTP application password | `secret_app_password` | Optional |
| `EMAIL_FROM` | Default sender header | `"Sherish Living" <no-reply@sherish.id>` | Optional |

---

## 2. Database Migration Steps (Prisma)

### A. Initializing / Applying Migrations in Production
To apply pending database migrations safely without data loss on a production PostgreSQL database:

```bash
# 1. Generate Prisma Client
npx prisma generate

# 2. Deploy pending migrations
npx prisma migrate deploy
```

> **Note:** Do NOT run `prisma db push` or `prisma migrate reset` in production as it can drop tables or overwrite data. Use `prisma migrate deploy`.

### B. Seeding Initial System Data (If fresh deployment)
```bash
node prisma/seed.js
```

---

## 3. Production Build & Start Steps (Docker / Standalone)

### Using Docker Compose:
```bash
# 1. Build and start services in background
docker compose up -d --build

# 2. Verify health status
docker compose ps
curl -s http://localhost:8095/health
```

### Standalone Node.js:
```bash
cd backend
npm install --production
npx prisma generate
npx prisma migrate deploy
npm start
```

---

## 4. Rollback & Disaster Recovery Procedures

### Scenario A: Migration Deployment Failure
If a migration fails during `prisma migrate deploy`:
1. Check migration status:
   ```bash
   npx prisma migrate status
   ```
2. If a migration is marked as failed, resolve with:
   ```bash
   npx prisma migrate resolve --rolled-back "<migration_name>"
   ```
3. Re-apply fixed migration script.

### Scenario B: Database Backup & Restore
Always take a snapshot before running production migrations:

```bash
# Backup:
docker exec -t sherish-postgres pg_dump -U sherish -d sherish_db > backup_sherish_$(date +%Y%m%d_%H%M%S).sql

# Restore if rollback is required:
docker exec -i sherish-postgres psql -U sherish -d sherish_db < backup_sherish_<timestamp>.sql
```

### Scenario C: Application Rollback (Docker)
To rollback to a previous Git commit or Docker image:
```bash
git checkout <previous_stable_commit_hash>
docker compose up -d --build sherish-backend
```
