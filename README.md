# Meru Lead Manager

A small, responsive lead tracking app built for the Meru Technosoft Full Stack Developer screening assignment. The React frontend talks to an Express REST API backed by SQLite.

## Features

- Create, list, edit, and delete leads. Delete asks for confirmation.
- Capture name, email, phone, company, source, and status.
- Search by lead name and filter by status.
- Validate required fields, email, phone, source, and status in both the browser and API.
- Show a pipeline count for New, Contacted, Qualified, and Lost.
- Sign up and sign in with password hashing and private, account-owned leads.
- SQLite persistence with indexes for status and name.
- API tests for CRUD, searching, filtering, and invalid input.

## Tech choices

- **React + Vite** for a quick, responsive single-page interface.
- **Node.js + Express** for a small REST API with clear resource routes.
- **SQLite via Node's built-in `node:sqlite`** for durable local storage without a separate database service or native package install. For a single-user take-home app, it keeps setup simple while still demonstrating relational persistence.
- **Node crypto** for salted scrypt password hashes and random, hashed server-side sessions stored in SQLite. The browser only receives an HttpOnly, SameSite cookie.
- **node:test + Supertest** for API coverage.

## Run locally

Requirements: Node.js 22.13 or newer and npm (the built-in `node:sqlite` module is used).

```sh
npm install
copy .env.example .env
npm run dev
```

Open the Vite URL printed by the command (usually <http://localhost:5173>). The API listens on <http://localhost:4000>; Vite proxies `/api` requests to it. SQLite creates `data/leads.db` on first run. On macOS/Linux, use `cp .env.example .env` instead of `copy`.

To run the production version locally:

```sh
npm run build
npm start
```

Then open <http://localhost:4000>. Configuration is optional; `.env.example` documents `PORT` and `DATABASE_PATH`.

## API

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/meta` | Valid source and status values |
| `GET` | `/api/auth/me` | Current account, if signed in |
| `POST` | `/api/auth/register` | Create an account and sign in |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Revoke the current session |
| `GET` | `/api/stats` | Pipeline totals by status |
| `GET` | `/api/leads?q=asha&status=New` | List, search by name, and filter by status |
| `GET` | `/api/leads/:id` | Fetch one lead |
| `POST` | `/api/leads` | Create a lead |
| `PUT` | `/api/leads/:id` | Replace lead fields, including status |
| `DELETE` | `/api/leads/:id` | Delete a lead |

Create and update requests accept JSON with `name`, `email`, `phone`, `company`, `source`, and `status`. A validation failure returns HTTP 400 with an `errors` object keyed by field; missing records return HTTP 404.

Account creation accepts `name`, `email`, and `password`; passwords must contain at least eight characters. Each account can only access its own leads. Existing rows from the pre-auth version are retained with no owner and are not visible to newly registered accounts.

Run the automated API tests with:

```sh
npm test
```

## Assumptions and scope

- Each account represents one sales user; team sharing and invitations are out of scope.
- Sources are a short fixed list; statuses are fixed to the four values in the assignment.
- The list is intentionally unpaginated to keep the core workflow small. The API supports query filters and the dashboard summarizes the currently loaded leads.
- SQLite is suitable for local evaluation and a small single-instance deployment. A hosted multi-instance production service should use PostgreSQL and migrations.

## Deployment

The server serves the built frontend and API from the same origin. A Node host can use `npm install`, `npm run build`, then `npm start`, with `PORT` and a persistent `DATABASE_PATH` configured. Persist the directory containing the SQLite file across restarts. For Vercel/Render/Railway, set the build command to `npm run build`, start command to `npm start`, and attach persistent storage if the host supports it. I have not published a live demo because that requires a hosting account and persistent-volume setup.

## With more time

- Add password reset, account verification, login rate limiting, and team roles.
- Add pagination, sorting, and server-side summary counts.
- Add database migrations, structured logging, and stronger phone normalization.
- Add frontend component tests and accessibility checks.
- Deploy to a host with managed PostgreSQL and a persistent, production-ready configuration.

## Note

I’m particularly proud of keeping the end-to-end workflow small and cohesive: a lead can be created, found, qualified, and removed with validation handled on both sides. The most important design choice was using SQLite so the application runs locally with a single command and no separate database setup.
