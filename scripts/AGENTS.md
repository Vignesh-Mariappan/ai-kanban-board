# Script Guidance

`start.sh` and `stop.sh` are shared by macOS and Linux. `start.ps1` and `stop.ps1` are for Windows PowerShell. They manage the `project-management-mvp` Docker container, mount the repository's `data/` directory for SQLite persistence, and use host port 8000 by default; `PORT` can override it.

Keep the scripts focused on starting and stopping the local container. The image is built separately using the command in the root README. Do not print or commit values from the root `.env` file.