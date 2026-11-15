-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Dữ liệu vận hành (OT): cảm biến và số đo của chúng, nối với quy trình nghiệp vụ (IT).
-- Mỗi cảm biến có token riêng (chỉ lưu mã băm). Vượt ngưỡng thì workflow-bridge tự mở một hồ sơ sửa chữa trong ứng dụng repair_app.
-- sensor_reading chỉ thêm, không sửa hay xóa: số đo là bằng chứng.
CREATE TABLE sensor (
  key text PRIMARY KEY CHECK (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  unit text NOT NULL DEFAULT '',
  threshold numeric NOT NULL,
  direction text NOT NULL CHECK (direction IN ('above', 'below')),
  repair_app text NOT NULL REFERENCES app(key),
  owner_id text NOT NULL,
  owner_name text,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  last_value numeric,
  last_at timestamptz,
  open_submission_id uuid REFERENCES submission(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sensor_reading (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sensor_key text NOT NULL REFERENCES sensor(key),
  value numeric NOT NULL,
  at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON sensor_reading (sensor_key, at DESC);
CREATE TRIGGER sensor_reading_immutable BEFORE UPDATE OR DELETE ON sensor_reading FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER sensor_reading_no_truncate BEFORE TRUNCATE ON sensor_reading FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
