.PHONY: install backend frontend dev

install:
	cd backend && /opt/homebrew/opt/python@3.13/bin/python3.13 -m venv venv && ./venv/bin/pip install -r requirements.txt
	cd frontend && npm install

backend:
	cd backend && ./venv/bin/python3 -m uvicorn main:app --reload --port 8000

frontend:
	cd frontend && ./node_modules/.bin/vite

dev:
	@echo "Starting Lumen AI Platform..."
	@echo "  Backend:  http://localhost:8000"
	@echo "  Frontend: http://localhost:3000"
	@echo ""
	@echo "Run in separate terminals:"
	@echo "  make backend"
	@echo "  make frontend"
