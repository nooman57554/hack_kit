# Hack Kit

Reusable full-stack starter kit for hackathon development.

## Stack

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- PostgreSQL
- Redis
- Docker Compose

## Prerequisites

- Node.js
- npm
- Docker
- Docker Compose

## Installation

Install dependencies:

    npm install

Create environment configuration:

    cp .env.example .env

Start infrastructure:

    docker compose up -d

Start frontend and backend:

    npm run dev

## Development URLs

Frontend: http://localhost:5173

Backend: http://localhost:5000

Backend health: http://localhost:5000/api/health

PostgreSQL: localhost:5433

Redis: localhost:6379