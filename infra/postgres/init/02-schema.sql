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

-- Ứng dụng quy trình do người dùng định nghĩa. `spec` = { fields, steps } (xem services/workflow-bridge/compile.js).
-- workflow-bridge biên dịch spec thành BPMN + view phẳng rồi đặt status = published | error.
CREATE TABLE app (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  spec       jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'error')),
  error      text,
  owner_id   text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Một hồ sơ gửi vào ứng dụng. current_step / waiting_role do workflow-bridge đồng bộ từ Flowable.
CREATE TABLE submission (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key      text NOT NULL REFERENCES app,
  data         jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'approved', 'rejected')),
  current_step text,
  waiting_role text,
  submitter_id text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);

-- Nhật ký hành động trên hồ sơ (chỉ thêm, không sửa/xóa): vừa là lệnh gửi tới quy trình, vừa là lịch sử kiểm toán.
CREATE TABLE submission_event (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submission ON DELETE CASCADE,
  step_key      text NOT NULL,
  action        text NOT NULL CHECK (action IN ('approve', 'reject', 'done')),
  note          text,
  actor_id      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Rào chắn dữ liệu đầu vào (poka-yoke): hồ sơ phải khớp các trường khai báo trong spec của ứng dụng.
CREATE FUNCTION check_submission_data() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  a app;
  f jsonb;
  v jsonb;
  k text;
BEGIN
  SELECT * INTO a FROM app WHERE key = NEW.app_key;
  IF a.status IS DISTINCT FROM 'published' THEN
    RAISE EXCEPTION 'Ứng dụng "%" chưa được xuất bản', NEW.app_key;
  END IF;
  IF jsonb_typeof(NEW.data) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu hồ sơ phải là một đối tượng JSON';
  END IF;
  FOR k IN SELECT jsonb_object_keys(NEW.data) LOOP
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(a.spec->'fields') e WHERE e->>'key' = k) THEN
      RAISE EXCEPTION 'Trường "%" không có trong ứng dụng', k;
    END IF;
  END LOOP;
  FOR f IN SELECT * FROM jsonb_array_elements(a.spec->'fields') LOOP
    v := NEW.data->(f->>'key');
    IF v IS NULL OR v = 'null'::jsonb OR v = '""'::jsonb THEN
      IF coalesce((f->>'required')::boolean, false) THEN
        RAISE EXCEPTION 'Thiếu trường bắt buộc "%"', f->>'label';
      END IF;
      CONTINUE;
    END IF;
    IF f->>'type' = 'number' THEN
      IF jsonb_typeof(v) <> 'number' THEN RAISE EXCEPTION 'Trường "%" phải là số', f->>'label'; END IF;
    ELSIF jsonb_typeof(v) <> 'string' THEN
      RAISE EXCEPTION 'Trường "%" phải là chuỗi', f->>'label';
    ELSIF f->>'type' = 'date' AND (v#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'Trường "%" phải có dạng YYYY-MM-DD', f->>'label';
    ELSIF f->>'type' = 'select' AND NOT (f->'options') @> jsonb_build_array(v) THEN
      RAISE EXCEPTION 'Trường "%" có giá trị ngoài danh sách lựa chọn', f->>'label';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER submission_check BEFORE INSERT ON submission
  FOR EACH ROW EXECUTE FUNCTION check_submission_data();

CREATE INDEX ON task (project_id);
CREATE INDEX ON task (assignee_id);
CREATE INDEX ON submission (app_key);
CREATE INDEX ON submission (submitter_id);
CREATE INDEX ON submission (waiting_role) WHERE status = 'running';
CREATE INDEX ON submission_event (submission_id);
