#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  echo "Tearing down..."
  docker compose down -v
}
trap cleanup EXIT

echo "Building and starting stack..."
docker compose up -d --build

echo "Waiting for services to report healthy..."
for i in $(seq 1 30); do
  unhealthy=$(docker compose ps --format json | grep -c '"Health":"unhealthy"' || true)
  starting=$(docker compose ps --format json | grep -c '"Health":"starting"' || true)
  if [ "$unhealthy" = "0" ] && [ "$starting" = "0" ]; then
    echo "All services healthy."
    break
  fi
  if [ "$i" = "30" ]; then
    echo "Timed out waiting for services to become healthy."
    docker compose ps
    exit 1
  fi
  sleep 2
done

echo "Verifying endpoints..."
curl -sf http://localhost:4000/health | grep -q '"status":"ok"'
curl -sf http://localhost:4000/ready | grep -q '"status":"ok"'
curl -sf http://localhost:4000/version | grep -q '"version"'
curl -sf http://localhost:8080/ >/dev/null

echo "Container test passed."
