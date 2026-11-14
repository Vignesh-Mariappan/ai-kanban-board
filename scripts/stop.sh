#!/bin/sh
set -eu

container_name=project-management-mvp

if docker ps --format '{{.Names}}' | grep -Fxq "$container_name"; then
  docker stop "$container_name" >/dev/null
  printf 'Container %s stopped.\n' "$container_name"
else
  printf 'Container %s is not running.\n' "$container_name"
fi