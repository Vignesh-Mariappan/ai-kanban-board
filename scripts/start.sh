#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
project_root=$(dirname "$script_dir")
container_name=project-management-mvp
image_name=project-management-mvp
port=${PORT:-8000}
database_dir="$project_root/data"

mkdir -p "$database_dir"

wait_for_ready() {
  attempt=0
  while [ "$attempt" -lt 30 ]; do
    if curl --fail --silent --max-time 1 "http://127.0.0.1:$port/api/health" >/dev/null 2>&1; then
      return 0
    fi
    attempt=$((attempt + 1))
    sleep 1
  done

  docker logs "$container_name" >&2
  docker stop "$container_name" >/dev/null || true
  printf 'Container did not become ready on port %s.\n' "$port" >&2
  return 1
}

if docker ps --format '{{.Names}}' | grep -Fxq "$container_name"; then
  wait_for_ready
  printf 'Container %s is already running.\n' "$container_name"
  exit 0
fi

docker rm "$container_name" >/dev/null 2>&1 || true

set --
if [ -f "$project_root/.env" ]; then
  set -- --env-file "$project_root/.env"
fi
docker run -d --name "$container_name" "$@" -p "$port:8000" --mount "type=bind,source=$database_dir,target=/data" "$image_name"

wait_for_ready
printf 'App available at http://localhost:%s\n' "$port"