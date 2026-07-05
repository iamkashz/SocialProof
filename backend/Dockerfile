# Copyright 2026 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

FROM python:3.12-slim

# Copy uv directly from the official image — smaller than `pip install uv`.
COPY --from=ghcr.io/astral-sh/uv:0.8.13 /uv /uvx /bin/

WORKDIR /code

# Manifests first so dep-install layer caches when only source changes.
COPY ./pyproject.toml ./uv.lock* ./

# Install deps (not the project itself, no dev packages).
RUN uv sync --frozen --no-install-project --no-dev

# Now the source. README is referenced by pyproject metadata.
COPY ./README.md ./
COPY ./app ./app

# Final sync installs the project itself.
RUN uv sync --frozen --no-dev

ARG COMMIT_SHA=""
ENV COMMIT_SHA=${COMMIT_SHA}

ARG AGENT_VERSION=0.0.0
ENV AGENT_VERSION=${AGENT_VERSION}

# Cloud Run wants the app to bind :8080 as a single process. The cache
# directory has to be /tmp because the container filesystem is
# read-only elsewhere.
ENV RECENT_SCANS_DIR=/tmp/recent-scans

EXPOSE 8080

CMD ["uv", "run", "uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]
