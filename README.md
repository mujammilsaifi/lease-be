# Lease Backend

## Overview

---

## Table of Contents
- [Features](#features)
- [Architecture](#architecture)
- [Setup & Installation](#setup--installation)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [API Endpoints](#api-endpoints)
- [Data Models](#data-models)
- [Authentication & Authorization](#authentication--authorization)
- [File Upload & Email](#file-upload--email)
- [Contribution Guidelines](#contribution-guidelines)

---

## Features
- User and admin management with role-based access control
- Lease management with versioning and modification tracking
- Period management for lease terms
- Secure authentication using JWT
- File upload and email sending (monthly financial reports)
- RESTful API design

---

## Architecture

```
Express (TypeScript)
│
├── Models (Mongoose)
├── Controllers (Business Logic)
├── Routes (API Endpoints)
├── Middlewares (Auth, Validation)
├── Services (Auth, Utility)
├── Config (DB, Email, Multer)
└── Public (Static/Uploads)
```

---

## Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone ""
   cd lease/be
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment variables:**
   - Create a `.env` file in the root with the following variables:
     ```env
     PORT=3000
     MONGODB_URL=your_mongodb_connection_string
     ACCESS_TOKEN_SECRET=your_jwt_secret
     USER_EMAIL=your_gmail_address
     USER_PASSWORD=your_gmail_app_password
     NODE_ENV=development
     ```
4. **Run the development server:**
   ```bash
   npm run dev
   ```

---

## Environment Variables
- `PORT`: Port for the server (default: 3000)
- `MONGODB_URL`: MongoDB connection string
- `ACCESS_TOKEN_SECRET`: Secret for JWT signing
- `USER_EMAIL`: Gmail address for sending emails
- `USER_PASSWORD`: Gmail app password
- `NODE_ENV`: Environment (development/production)

---

## Scripts
- `npm run dev` – Start server with hot reload (nodemon)
- `npm run build` – Compile TypeScript to JavaScript
- `npm start` – Build and run the server
- `npm run lint` – Lint the codebase
- `npm run clean` – Remove build artifacts

---

## API Endpoints

### User & Admin
- `POST   /api/user/login` – Admin login
- `GET    /api/user/logout` – Admin logout
- `GET    /api/user/admin` – Get all admins (MASTER, ADMIN)
- `POST   /api/user/admin` – Create admin (MASTER, ADMIN)
- `PUT    /api/user/admin/:id` – Update admin (MASTER, ADMIN)
- `DELETE /api/user/admin/:id` – Delete admin (MASTER, ADMIN)
- `GET    /api/user/user` – Get all users (SUB_ADMIN)
- `POST   /api/user/user` – Create user (SUB_ADMIN)
- `PUT    /api/user/user/:id` – Update user (SUB_ADMIN)
- `DELETE /api/user/user/:id` – Delete user (SUB_ADMIN)

### Lease
- `GET    /api/v1/lease` – Get leases for a user
- `GET    /api/v1/lease/movement` – Get lease movement data
- `POST   /api/v1/lease` – Create new lease(s)
- `PUT    /api/v1/lease/:id` – Update lease
- `DELETE /api/v1/lease/:id` – Delete lease
- `PUT    /api/v1/lease-modification/:id` – Modify lease (versioning)

### Period
- `GET    /api/v1/period` – Get periods
- `POST   /api/v1/period` – Create period
- `PUT    /api/v1/period/:id` – Update period
- `DELETE /api/v1/period/:id` – Delete period

### Mail
- `POST   /api/mail/upload` – Upload Excel file and send email report

---

## Data Models

### User
- `email`, `fullName`, `password`, `role` (MASTER, ADMIN, SUB_ADMIN, USER, GUEST), `status`, `creatorId`, `location`, `user_limit`, `avatar`, `coverImage`, `refreshToken`

### Lease
- Complex schema supporting versioning, status (active, close, modified), lessor details, payment terms, escalations, rent-free periods, cut-off calculations, and more.

### Period
- `startDate`, `endDate`, `status`, `createdAt`, `updatedAt`

---

## Authentication & Authorization
- **JWT-based authentication**: Users and admins receive a token on login.
- **Role-based access control**: Endpoints are protected by middleware (`restrictTo`) to allow only specific roles.
- **Token validation**: Middleware checks for valid tokens and user roles.

---

## File Upload & Email
- Uses **Multer** for file uploads (in-memory storage).
- Uses **Nodemailer** to send emails with Excel attachments (monthly financial reports).
- Configure sender email and password in `.env`.

---

## Project Structure

```
be/
├── src/
│   ├── app.ts                # Main entry point
│   ├── config/               # DB, email, multer configs
│   ├── controllers/          # Business logic
│   ├── middlewares/          # Auth, role checks
│   ├── models/               # Mongoose schemas
│   ├── routes/               # API endpoints
│   ├── services/             # Auth logic
│   └── @types/               # TypeScript types
├── public/                   # Static files (e.g., Excel)
├── package.json
├── tsconfig.json
└── README.md
```

---

## Contribution Guidelines
1. Fork the repository and create a new branch for your feature or bugfix.
2. Write clear, concise commit messages.
3. Ensure code passes linting and builds successfully.
4. Submit a pull request with a detailed description of your changes.

---

## License
ISC

---

## Author
Mujammil Khan 