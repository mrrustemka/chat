# Chat Project

A real-time chat application built with NodeJS, Express, React, TypeScript, and MongoDB.

## Tech Stack

- **Frontend**: React + TypeScript (Vite)
- **Backend**: NodeJS + Express + TypeScript
- **Database**: MongoDB
- **Real-time**: Socket.io
- **Infrastructure**: Docker Compose

## Getting Started

### Prerequisites

- Node.js (v18+)
- Docker & Docker Compose

### Setup

1. **Infrastructure**:
   Start the MongoDB database using Docker:

   ```bash
   docker-compose up -d
   ```

2. **Backend**:

   ```bash
   cd backend
   npm install
   npm run dev
   ```

   The server will run at `http://localhost:5000`.

3. **Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   The application will be available at `http://localhost:5173`.

## Project Structure

- `/backend`: Node.js Express server with TypeScript.
- `/frontend`: React client with TypeScript and Vite.
- `docker-compose.yml`: MongoDB and persistent storage configuration.
