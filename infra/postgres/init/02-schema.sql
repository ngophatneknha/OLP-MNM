-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0

-- Schema nghiệp vụ của ứng dụng minh họa. *_id người dùng = claim `sub` của Keycloak.
-- shortcut: chỉ chạy khi volume Postgres còn trống (đổi schema phải `docker compose down -v`);
-- chuyển sang Hasura migrations khi cần giữ dữ liệu qua các lần nâng cấp.

CREATE TABLE project (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  owner_id   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE task (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES project ON DELETE CASCADE,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  position    integer NOT NULL DEFAULT 0,
  assignee_id text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES project ON DELETE SET NULL,
  name         text NOT NULL,
  object_key   text NOT NULL UNIQUE,
  content_type text,
  size         bigint,
  owner_id     text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE request (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  description         text,
  amount              numeric(14, 2),
  status              text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requester_id        text NOT NULL,
  approver_id         text,
  decision_note       text,
  process_instance_id text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  decided_at          timestamptz
);

CREATE INDEX ON task (project_id);
CREATE INDEX ON task (assignee_id);
CREATE INDEX ON request (requester_id);
