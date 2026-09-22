# AI Accelerator

## Quickstart

```bash
git clone <this-repo>
cd AIaccelerator
cp .env.example .env
docker compose up -d --build
```

Then check `docker compose ps` — all three services (`postgres`, `server`, `client`) should report healthy. Open the client at http://localhost:8080.

## Ports

| Service    | Host port | Container port | Notes                                                                 |
|------------|-----------|-----------------|------------------------------------------------------------------------|
| client     | 8080      | 80               | nginx serving the built frontend, proxies API calls to the server      |
| server     | 4000      | 4000             | Express API. Effectively fixed — see `.env.example` for why            |
| postgres   | **5434**  | 5432             | Host-side port only; moved off the Postgres default (5432) to avoid conflicting with a locally installed Postgres instance. Internal container-to-container traffic still uses `postgres:5432` (the service name + default port), so `DATABASE_URL` inside Docker is unaffected. |

The server's `PORT` is effectively fixed at `4000`: `docker-compose.yml`'s healthcheck and port mapping for the `server` service, and `client/nginx.conf`'s proxy target, all hardcode `4000`. Changing `PORT` in `.env` alone will not work — see the comment in `.env.example`.

## Make targets

A `Makefile` is provided for convenience. `make` may not be installed on every host (notably some minimal Windows setups), so raw command equivalents are listed alongside each target.

| Target              | What it does                     | Raw command equivalent                                  |
|---------------------|-----------------------------------|-----------------------------------------------------------|
| `make dev`          | Build and start all services      | `docker compose up -d --build`                             |
| `make stop`         | Stop all services (keep containers) | `docker compose stop`                                    |
| `make restart`      | Restart all services               | `docker compose restart`                                   |
| `make logs`         | Tail logs for all services         | `docker compose logs -f`                                   |
| `make test`         | Run server and client unit tests   | `cd server && npm test` then `cd client && npm test`        |
| `make lint`         | Lint server and client             | `cd server && npm run lint` then `cd client && npm run lint`|
| `make clean`        | Stop and remove containers         | `docker compose down`                                       |
| `make reset`        | Stop and remove containers + volumes | `docker compose down -v`                                  |
| `make test-containers` | Run the container smoke test script | `bash scripts/test-containers.sh`                         |

## Integration tests

Integration tests need a real Postgres instance. Start just the database, then run the integration suite from `server/` against it:

```bash
docker compose up -d postgres
cd server
DATABASE_URL=postgres://accelerator:accelerator@localhost:5434/accelerator PORT=4000 npm run test:integration
```

Note the host port (`5434`), not the default Postgres port, since that's what's published to the host — see the ports table above.

## Build status

See [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) for current build/implementation status.
