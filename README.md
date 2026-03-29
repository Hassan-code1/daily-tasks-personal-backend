# Daily Tasks Calendar — Backend (API)

A high-performance, secure, and production-ready Node.js/Express API that powers the Daily Tasks Calendar. Built with a focus on security, scalability, and real-time task aggregation.

## 🚀 Features

- **JWT Authentication**: Secure user registration and login.
- **Task Management**: Full CRUD operations with support for **Daily Recurring Tasks**.
- **Per-Day Completion Tracking**: Uses a secondary `TaskCompletion` model to track infinite recurrence completion independently per day.
- **Aggregation Pipeline**: Efficiently calculates daily task completion ratios using MongoDB aggregation (merging static and dynamic tasks).
- **Security Hardened**: 
  - `Helmet.js` for secure HTTP headers.
  - `Express-Rate-Limit` to prevent Brute-force and DDoS attacks.
  - CORS-restricted origin to prevent unauthorized cross-site requests.
  - `Bcrypt.js` for high-entropy password hashing.
  - Automatic input validation and sanitization using `Express-Validator`.
- **Production Ready**: Optimized for deployment on platforms like Render or DigitalOcean.

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB (via Mongoose ODM)
- **Security**: JWT, Bcrypt, Helmet, Rate-Limiting
- **Validation**: Express-Validator

## 📦 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16+)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Hassan-code1/daily-tasks-personal-backend.git
   cd daily-tasks-personal-backend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the root directory (refer to `.env.example`):
   ```env
   MONGODB_URI=your_mongodb_connection_string
   PORT=5000
   JWT_SECRET=your_long_random_jwt_secret
   FRONTEND_URL=your_frontend_url (e.g., http://localhost:5173)
   NODE_ENV=development
   ```

4. Start the server:
   ```bash
   # Development (requires nodemon strictly if configured, or just node)
   node index.js
   ```

---

## 🛰️ API Reference

### Auth Endpoints
| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive a JWT token |

### Task Endpoints (Authenticated)
*All task endpoints require `Authorization: Bearer <token>`*

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tasks?date=YYYY-MM-DD` | Get all tasks for a specific date (merges standard and recurring) |
| `GET` | `/api/tasks/summary?month=M&year=YYYY` | Get monthly completion summary |
| `POST` | `/api/tasks` | Create a new task (supports `isDaily: boolean`) |
| `PUT` | `/api/tasks/:id` | Update a task (handles per-day completion for recurring tasks) |
| `DELETE` | `/api/tasks/:id?mode=single\|all&date=YYYY-MM-DD` | Delete a task (supports hiding a single day vs deleting entire series) |

---

## 🛡️ Security Implementation Note

This API uses **UserId Scoping**. Every task document in MongoDB is linked to an `owner` ID. The API ensures that users can only access, modify, or delete tasks that they created. Even with a valid JWT, access to another user's data is programmatically impossible.

## 📄 License

This project is licensed under the MIT License.
.
