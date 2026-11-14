-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0

-- Schema nghiệp vụ của ứng dụng minh họa. *_id người dùng = claim `sub` của Keycloak.
-- shortcut: chỉ chạy khi volume Postgres còn trống (đổi schema phải `docker compose down -v`);
-- chuyển sang Hasura migrations khi cần giữ dữ liệu qua các lần nâng cấp.

-- Ứng dụng quy trình do người dùng định nghĩa. `spec` = { fields, steps } (xem services/workflow-bridge/compile.js).
-- workflow-bridge biên dịch spec thành BPMN + view phẳng rồi đặt status = published | error.
CREATE TABLE app (
  key        text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  description text CHECK (length(description) <= 300),
  category   text CHECK (length(category) <= 40),
  spec       jsonb NOT NULL,
  status     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'error')),
  error      text,
  owner_id   text NOT NULL,
  owner_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Quy trình được quản lý như mã nguồn: mỗi lần phát hành là một phiên bản bất biến, có ghi chú thay đổi.
CREATE TABLE app_version (
  app_key       text NOT NULL REFERENCES app ON DELETE CASCADE,
  version       integer NOT NULL,
  name          text NOT NULL,
  spec          jsonb NOT NULL,
  note          text NOT NULL,
  author_id     text NOT NULL,
  author_name   text,
  reviewer_name text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_key, version)
);

-- Đề xuất thay đổi quy trình (tương tự pull request). `checks` do workflow-bridge điền: kết quả kiểm tra
-- hợp lệ và chạy thử trên hồ sơ cũ. Chỉ được chấp nhận khi đã kiểm tra xong và không có lỗi.
CREATE TABLE app_change (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_key       text NOT NULL REFERENCES app ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  spec          jsonb NOT NULL,
  note          text NOT NULL CHECK (length(note) BETWEEN 5 AND 1000),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'merged', 'rejected')),
  checks        jsonb,
  author_id     text NOT NULL,
  author_name   text,
  reviewer_id   text,
  reviewer_name text,
  review_note   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz
);

-- Góp ý / báo lỗi về một quy trình (tương tự issue): ai cũng gửi được, ai cũng đọc được.
CREATE TABLE app_issue (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  app_key     text NOT NULL REFERENCES app ON DELETE CASCADE,
  title       text NOT NULL CHECK (length(title) BETWEEN 5 AND 200),
  body        text,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  author_id   text NOT NULL,
  author_name text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION app_first_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO app_version (app_key, version, name, spec, note, author_id, author_name)
  VALUES (NEW.key, 1, NEW.name, NEW.spec, 'Phiên bản đầu tiên', NEW.owner_id, NEW.owner_name);
  RETURN NULL;
END $$;
CREATE TRIGGER app_first_version AFTER INSERT ON app FOR EACH ROW EXECUTE FUNCTION app_first_version();

-- Chấp nhận một đề xuất = phát hành phiên bản mới. Làm trong một giao dịch để app và lịch sử không lệch nhau.
CREATE FUNCTION app_change_decide() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF OLD.status <> 'open' THEN RAISE EXCEPTION 'Đề xuất đã được xử lý'; END IF;
  NEW.decided_at := now();
  IF NEW.status = 'merged' THEN
    IF OLD.checks IS NULL OR jsonb_array_length(OLD.checks->'errors') > 0 THEN
      RAISE EXCEPTION 'Đề xuất chưa qua kiểm tra tự động';
    END IF;
    UPDATE app SET name = NEW.name, spec = NEW.spec, status = 'pending', error = NULL WHERE key = NEW.app_key;
    INSERT INTO app_version (app_key, version, name, spec, note, author_id, author_name, reviewer_name)
    SELECT NEW.app_key, max(version) + 1, NEW.name, NEW.spec, NEW.note, NEW.author_id, NEW.author_name, NEW.reviewer_name
    FROM app_version WHERE app_key = NEW.app_key;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER app_change_decide BEFORE UPDATE ON app_change FOR EACH ROW EXECUTE FUNCTION app_change_decide();

-- Một hồ sơ gửi vào ứng dụng. current_step / waiting_role do workflow-bridge đồng bộ từ Flowable.
CREATE TABLE submission (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no           bigint GENERATED ALWAYS AS IDENTITY UNIQUE, -- số hồ sơ để con người gọi tên ("hồ sơ số 27")
  app_key      text NOT NULL REFERENCES app,
  app_version  integer NOT NULL DEFAULT 0, -- phiên bản quy trình lúc gửi; trigger submission_check điền
  data         jsonb NOT NULL,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'approved', 'rejected')),
  current_step text,
  waiting_role text,
  submitter_id text NOT NULL,
  submitter_name text,
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
  actor_name    text,
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
  SELECT max(version) INTO NEW.app_version FROM app_version WHERE app_key = NEW.app_key;
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

CREATE INDEX ON submission (app_key);
CREATE INDEX ON submission (submitter_id);
CREATE INDEX ON submission (waiting_role) WHERE status = 'running';
CREATE INDEX ON submission_event (submission_id);

-- Tệp đính kèm hồ sơ. Nội dung nằm trong kho S3; bảng này giữ tên, kích thước và khóa đối tượng.
CREATE TABLE attachment (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES submission ON DELETE CASCADE,
  name          text NOT NULL CHECK (length(name) BETWEEN 1 AND 150),
  size          bigint NOT NULL CHECK (size BETWEEN 1 AND 10485760),
  content_type  text,
  object_key    text NOT NULL UNIQUE,
  uploader_id   text NOT NULL,
  uploader_name text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON attachment (submission_id);

-- AI "thử việc": mỗi bước duyệt có một nấc tự chủ.
--   1 Người làm (AI không tham gia)   2 AI chạy bóng (ghi ý kiến, người duyệt chưa thấy)
--   3 AI gợi ý, người bấm             4 AI tự duyệt (từ chối vẫn luôn do người quyết)
CREATE TABLE step_autonomy (
  app_key    text NOT NULL REFERENCES app ON DELETE CASCADE,
  step_key   text NOT NULL,
  level      integer NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 4),
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (app_key, step_key)
);

-- Ý kiến của AI về một hồ sơ ở một bước, và quyết định thật của người để đo độ khớp.
CREATE TABLE ai_opinion (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES submission ON DELETE CASCADE,
  step_key      text NOT NULL,
  level         integer NOT NULL,
  decision      text NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason        text NOT NULL,
  human_action  text CHECK (human_action IN ('approve', 'reject')),
  matched       boolean, -- chỉ có khi người quyết định; AI tự duyệt thì để trống (không tính làm bằng chứng)
  sample        boolean NOT NULL DEFAULT false, -- dữ liệu mẫu không bao giờ được tính làm bằng chứng
  created_at    timestamptz NOT NULL DEFAULT now(),
  decided_at    timestamptz,
  UNIQUE (submission_id, step_key)
);
CREATE INDEX ON ai_opinion (step_key);

-- Người quyết định xong thì ghi lại để so với ý kiến của AI.
CREATE FUNCTION ai_opinion_settle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE human text := CASE WHEN NEW.action = 'reject' THEN 'reject' ELSE 'approve' END;
BEGIN
  IF NEW.actor_id <> 'ai' THEN
    UPDATE ai_opinion SET human_action = human, matched = (decision = human), decided_at = now()
    WHERE submission_id = NEW.submission_id AND step_key = NEW.step_key AND human_action IS NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER ai_opinion_settle AFTER INSERT ON submission_event FOR EACH ROW EXECUTE FUNCTION ai_opinion_settle();

-- Nâng nấc phải có bằng chứng: chỉ giám đốc, từng nấc một, và (từ nấc 2 trở lên) ít nhất 10 quyết định thật
-- của người ở nấc hiện tại với tỷ lệ khớp từ 90%. Hạ nấc thì ai có quyền cập nhật cũng làm được.
CREATE FUNCTION autonomy_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  who text := coalesce(nullif(current_setting('hasura.user', true), '')::jsonb ->> 'x-hasura-role', 'admin');
  total integer;
  hits integer;
BEGIN
  IF NEW.level = OLD.level THEN RETURN NEW; END IF;
  NEW.updated_at := now();
  IF NEW.level < OLD.level THEN RETURN NEW; END IF;
  IF who NOT IN ('director', 'admin') THEN RAISE EXCEPTION 'Chỉ giám đốc được nâng mức tự chủ của AI'; END IF;
  IF NEW.level <> OLD.level + 1 THEN RAISE EXCEPTION 'Chỉ được nâng từng nấc một'; END IF;
  IF OLD.level >= 2 THEN
    SELECT count(*), count(*) FILTER (WHERE o.matched) INTO total, hits
    FROM ai_opinion o JOIN submission s ON s.id = o.submission_id
    WHERE s.app_key = OLD.app_key AND o.step_key = OLD.step_key AND o.level = OLD.level
      AND o.matched IS NOT NULL AND NOT o.sample;
    IF total < 10 OR hits * 10 < total * 9 THEN
      RAISE EXCEPTION 'Chưa đủ bằng chứng để nâng nấc: cần ít nhất 10 quyết định và 90%% khớp (hiện có %/%)', hits, total;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER autonomy_guard BEFORE UPDATE ON step_autonomy FOR EACH ROW EXECUTE FUNCTION autonomy_guard();
CREATE INDEX ON app_change (app_key);
CREATE INDEX ON app_issue (app_key);
