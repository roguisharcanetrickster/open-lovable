# Open Lovable - Coolify & Docker Sandbox

This project is configured to use **Coolify** & a built-in **Docker Sandbox** service for code execution.

## Setup

1. Copy `.env.example` to `.env` and fill in your Coolify API details.
2. Get your Firecrawl API key from [https://firecrawl.dev](https://firecrawl.dev) and add it to `.env`.
3. Add any of the AI keys (Anthropic, OpenAI, Gemini, etc.) to `.env`.
4. Start both Open Lovable and the Docker Sandbox container together by running:
   ```bash
   docker compose up --build -d
   ```
5. Open Lovable is accessible at [http://localhost:3000](http://localhost:3000). The Vite production-preview app sandbox runs in the background and is proxied through port `5173` on localhost.

## How it Works

Instead of communicating with high-latency, paid external cloud sandbox providers like Vercel or E2B, this configuration starts a dedicated **Docker Sandbox Container** alongside your main Open Lovable instance on the same virtual network:

- **Sandbox Provider**: `coolify` (loads up local/remote Docker sandbox space).
- **Control Interface**: A lightweight REST API Agent running inside the sandbox container listens on port `3001` and executes the commands, writes the files, and reads build status requested by the AI.
- **Port Forwarding**: The playground application (Vite React + Tailwind CSS) runs on port `5173` in the sandbox container and is exposed locally, allowing immediate hot-module-reloaded visual feedback.
- It includes native validation checks against the Coolify REST API to ensure your hosted server controls and accounts are healthy.

## Environment Variables

- `SANDBOX_PROVIDER=coolify`
- `COOLIFY_API`: Your Coolify personal API key / Bearer Token.
- `COOLIFY_ADDRESS`: Address of your Coolify instance (for API communication and health check).
- `COOLIFY_SANDBOX_AGENT_URL`: Address of the lightweight control agent running inside the sandbox container (defaults to `http://sandbox:3001`).
- `COOLIFY_SANDBOX_VITE_URL`: External/Public URL where the playground app is previewed (defaults to `http://localhost:5173`).

## Troubleshooting

- **Container Logs**: Check container logs using `docker compose logs` to verify connection and dev build diagnostics.
- **Vite Startup**: If the dev preview shows a blank page initially, give npm up to 10 seconds to install base/peer packages inside the sandbox container during active building.
