-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Đa tổ chức (multi-tenancy): nhiều tổ chức dùng chung một hệ thống, mỗi tổ chức chỉ thấy dữ liệu của mình.
-- Cách ly nằm ở CSDL và Hasura, không phụ thuộc giao diện: org_id đi theo token (claim `org_id` của Keycloak,
-- thiếu thì là 'default'), Hasura thêm điều kiện org_id vào mọi quyền đọc và ghi.
-- Tệp này chạy lại được (IF NOT EXISTS): áp vào CSDL đang chạy bằng
--   docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/05-org.sql
-- shortcut: mã ứng dụng (app.key) vẫn là duy nhất toàn hệ thống; tổ chức khác dùng trùng mã sẽ bị báo trùng. Cần tách hẳn thì đổi khóa thành (org_id, key).
CREATE TABLE IF NOT EXISTS org (
  id         text PRIMARY KEY CHECK (id ~ '^[a-z][a-z0-9_-]{1,30}$'),
  name       text NOT NULL CHECK (length(btrim(name)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO org (id, name) VALUES ('default', 'Tổ chức mặc định'), ('orgb', 'Tổ chức B (thử cách ly)') ON CONFLICT DO NOTHING;

ALTER TABLE app          ADD COLUMN IF NOT EXISTS org_id text NOT NULL DEFAULT 'default' REFERENCES org;
ALTER TABLE submission   ADD COLUMN IF NOT EXISTS org_id text NOT NULL DEFAULT 'default' REFERENCES org;
ALTER TABLE sensor       ADD COLUMN IF NOT EXISTS org_id text NOT NULL DEFAULT 'default' REFERENCES org;
ALTER TABLE cold_archive ADD COLUMN IF NOT EXISTS org_id text NOT NULL DEFAULT 'default' REFERENCES org;
CREATE INDEX IF NOT EXISTS submission_org_idx ON submission (org_id);
CREATE INDEX IF NOT EXISTS app_org_idx ON app (org_id);

-- Hồ sơ luôn thuộc tổ chức của ứng dụng nhận nó: người gửi không tự chọn được org_id.
CREATE OR REPLACE FUNCTION submission_set_org() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  SELECT org_id INTO NEW.org_id FROM app WHERE key = NEW.app_key;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS submission_org ON submission;
CREATE TRIGGER submission_org BEFORE INSERT ON submission FOR EACH ROW EXECUTE FUNCTION submission_set_org();
