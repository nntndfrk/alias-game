# Gemini Project Context: Online Alias Game

This document provides a comprehensive overview of the Online Alias Game project for the Gemini AI assistant.

## Project Overview

This is a monorepo for a real-time, team-based, multiplayer word-guessing game similar to Alias or Taboo. The application is designed with a modern web stack, featuring a rich frontend and a high-performance backend.

*   **Frontend:** An Angular 18+ application using signals for state management, Tailwind CSS for styling, and WebRTC for peer-to-peer video/audio communication.
*   **Backend:** A modular monolith built with Rust, using the Axum web framework on the Tokio async runtime. It's designed to be scalable and efficient.
*   **Database:** MongoDB is used for data persistence (users, games, words), and Redis is used for managing real-time game state and caching.
*   **Authentication:** User authentication is handled via Twitch OAuth 2.0, with JWTs for session management.
*   **Infrastructure:** The entire development environment is containerized using Docker and managed with Docker Compose, ensuring consistency and ease of setup.
*   **Monorepo:** The project is managed as a monorepo using Nx.

## Building and Running

### Full Stack (Docker)

The recommended way to run the application for development is using Docker Compose.

1.  **Set up environment variables:**
    ```bash
    cp .env.example .env
    # Edit .env with your configuration (Twitch credentials, JWT secret, etc.)
    ```

2.  **Start services:**
    ```bash
    docker-compose up -d
    ```

3.  **Run database migrations:**
    ```bash
    cd backend && cargo run --bin migrate
    ```

4.  **Seed the word database:**
    ```bash
    cd backend && cargo run --bin seed-words
    ```

The application will be available at `http://localhost:4200`.

### Frontend (Standalone)

To run the Angular frontend separately:

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Start the development server:**
    ```bash
    npm start
    ```

### Backend (Standalone)

To run the Rust backend separately:

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```
2.  **Run the application:**
    ```bash
    cargo run --package api-gateway
    ```

## Testing

*   **Frontend Unit Tests:**
    ```bash
    cd frontend && npm test
    ```
*   **Frontend E2E Tests:**
    ```bash
    cd frontend && npx playwright test
    ```
*   **Backend Tests:**
    ```bash
    cd backend && cargo test
    ```

## Development Conventions

*   **Pre-commit Hooks:** The project uses Husky and lint-staged to enforce code quality before commits.
    *   **Frontend:** Automatically runs `eslint --fix` and `tsc --noEmit` on staged TypeScript, JS, HTML, and CSS/SCSS files.
    *   **Backend:** Automatically runs `cargo fmt` and `cargo clippy --fix` on staged Rust files.
*   **Code Style:**
    *   Frontend: Follows standard Angular and TypeScript best practices, enforced by ESLint.
    *   Backend: Follows standard Rust conventions, enforced by `cargo fmt` and `clippy`.
