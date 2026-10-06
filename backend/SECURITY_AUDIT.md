# Sherish Platform - Security Audit Report

**Date:** October 6, 2026  
**Auditor:** Koda (Backend & Software Architecture Specialist)  
**Target:** Sherish E-Commerce Tri-Portal Backend API (`backend/src`)  
**Scope:** Authentication, Authorization (RBAC), Route Protection, SQL/NoSQL Injection, Input Sanitization, Rate Limiting & Brute-Force Prevention.

---

## 1. Executive Summary

An in-depth security review of the Sherish API engine was conducted across all routes, middlewares, services, and database queries. The backend is built with Express.js and Prisma ORM atop PostgreSQL 16.

All critical vulnerabilities identified during the audit were remediated, including adding missing authentication & role-based access checks on sensitive operational endpoints, integrating strict rate limiting on authentication routes, and hardening input validation.

---

## 2. Findings & Remediation Matrix

| Finding ID | Component | Vulnerability / Concern | Risk Level | Status | Remediation Summary |
|---|---|---|---|---|---|
| **SEC-01** | `routes/auth.js` | Lack of Rate Limiting on `/login` and `/register` (Brute-force / Credential Stuffing) | **HIGH** | **FIXED** | Implemented `express-rate-limit` with 10 attempts/15m on login and 20 requests/15m on registration. |
| **SEC-02** | `routes/telegram.js` | Unprotected Internal Endpoints (`/send-message`, `/notify-order-status`, `/notify-payment-reminder`) | **HIGH** | **FIXED** | Added `authenticateToken` and explicit `authorizeRoles` RBAC middleware on all administrative trigger routes. |
| **SEC-03** | `routes/auth.js` | Input validation and sanitization for registration & login | **MEDIUM** | **FIXED** | Added email format regex validation, lowercase normalization, password length constraint (min 6 chars), and string sanitization. |
| **SEC-04** | `routes/auth.js` | Duplicate `/sales` route definition in router | **LOW** | **FIXED** | Removed redundant route handler definition. |
| **SEC-05** | Database Layer | Raw SQL injection risk assessment | **INFO** | **NOTED / SECURE** | Verified: Prisma ORM parameterized queries are used exclusively across all models. No raw `$queryRawUnsafe` or `$executeRawUnsafe` present. |
| **SEC-06** | `routes/orders.js` & `routes/mitra.js` | Horizontal Privilege Escalation (IDOR) on Order & Profile access | **MEDIUM** | **NOTED / SECURE** | Verified: Customer and Mitra roles are strictly scoped to `req.user.id` or `mitraProfile.id`. |
| **SEC-07** | `routes/payment.js` | Webhook verification integrity for Midtrans | **MEDIUM** | **NOTED / SECURE** | Verified: Webhook handles signature checks and falls back safely without unhandled crashes. |

---

## 3. Detailed Audit Review

### 3.1 Authentication & RBAC (Role-Based Access Control)
- **Middleware:** `src/middlewares/auth.js` implements standard JWT extraction and role validation via `authenticateToken` and `authorizeRoles`.
- **Role Hierarchy:** Supports `CUSTOMER`, `MITRA`, `ADMIN_CATALOG`, `ADMIN_FINANCE`, `ADMIN_QUALITY`, `ADMIN_CS`, and `SUPER_ADMIN`.
- **Findings:**
  - `routes/telegram.js` previously exposed administrative notification endpoints without token verification.
  - **Resolution:** Applied `authenticateToken` and `authorizeRoles('ADMIN_CS', 'ADMIN_FINANCE', 'SUPER_ADMIN')` on all outbound push routes.

### 3.2 SQL Injection & Data Access Safety
- **ORM:** Prisma ORM handles automatic SQL parameterization and escaping for PostgreSQL.
- **Audit Result:** 0 raw SQL queries detected. All queries use typed Prisma operations (`findUnique`, `findMany`, `create`, `update`, `aggregate`).

### 3.3 Rate Limiting & Denial of Service (DoS)
- **Implementation:** Added `express-rate-limit` to guard authentication routes:
  - `loginLimiter`: 10 requests / 15 minutes per IP address.
  - `authLimiter`: 20 requests / 15 minutes per IP address.
  - Custom user-friendly error response in Indonesian.

### 3.4 Input Sanitization & Type Safety
- Email addresses are trimmed, case-normalized (`toLowerCase()`), and validated against standard email format regex.
- Minimum password length constraint enforced at API level.
- String sanitation on store names, work areas, and addresses prevents unintended malformed JSON payloads.

---

## 4. Load Testing Preparation & Recommendations

1. **Database Indexing:**
   - Indexes exist on `User.email`, `Product.slug`, `Order.orderNumber`, `Invoice.invoiceNumber`, `Category.slug`, and `MitraProfile.userId`.
   - Recommended for high traffic: Add composite index on `(Order.userId, Order.status, Order.createdAt)` and `(MitraProfile.referralSalesId, MitraProfile.status)`.

2. **Connection Pooling:**
   - PostgreSQL connection pool size should be tuned in production via `DATABASE_URL` query parameters: e.g., `postgresql://user:pass@host:5432/db?connection_limit=20&pool_timeout=10`.

3. **Benchmarking Tools:**
   - Recommended load test tools: `k6` or `autocannon` targeting `GET /api/products` and `POST /api/orders` under simulated 500-1000 concurrent virtual users (VUs).
