.PHONY: dev stop restart logs test lint clean reset test-containers

dev:
	docker compose up -d --build

stop:
	docker compose stop

restart:
	docker compose restart

logs:
	docker compose logs -f

test:
	cd server && npm test
	cd client && npm test

lint:
	cd server && npm run lint
	cd client && npm run lint

clean:
	docker compose down

reset:
	docker compose down -v

test-containers:
	bash scripts/test-containers.sh
