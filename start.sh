#!/bin/bash
# Start both the FastAPI backend and Next.js frontend

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🚀 Starting cURL Kit..."
echo ""

# Start FastAPI backend
echo "→ Starting API server on http://localhost:8000"
cd "$PROJECT_DIR"
source .venv/bin/activate
uvicorn api.server:app --port 8000 --reload &
API_PID=$!

# Start Next.js frontend
echo "→ Starting UI on http://localhost:3000"
cd "$PROJECT_DIR/web"
npm run dev &
WEB_PID=$!

echo ""
echo "✅ cURL Kit is running!"
echo "   UI:  http://localhost:3000"
echo "   API: http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop both servers."

# Trap Ctrl+C to kill both processes
trap "kill $API_PID $WEB_PID 2>/dev/null; exit 0" INT TERM

wait
