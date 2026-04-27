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
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (must be installed **and running** before the next step)

### Setup

1. **Infrastructure**:
   Make sure Docker Desktop is open and its engine is started, then run:

   ```bash
   docker compose up -d
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
