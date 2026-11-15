-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Chữ ký số cho phê duyệt (PKI phần mềm, xem services/workflow-bridge/pki.js).
--   pki_key: khóa và chứng thư của CA từng tổ chức và của từng người ký; khóa riêng được mã hóa (AES-256-GCM). Chỉ workflow-bridge đọc (không mở qua Hasura).
--   event_signature: chữ ký trên từng hành động duyệt/từ chối. Chỉ thêm, không sửa hay xóa, giống nhật ký mà nó bảo chứng.
-- Chạy lại được (IF NOT EXISTS): áp vào CSDL đang chạy bằng
--   docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/06-pki.sql
CREATE TABLE IF NOT EXISTS pki_key (
  subject    text PRIMARY KEY, -- 'ca:<tổ chức>' hoặc 'user:<tổ chức>:<mã người dùng>'
  org_id     text NOT NULL REFERENCES org,
  kind       text NOT NULL CHECK (kind IN ('ca', 'user')),
  cert_pem   text NOT NULL,
  key_enc    text NOT NULL CHECK (key_enc LIKE 'v1:%'), -- chỉ nhận khóa đã mã hóa, không bao giờ khóa trần
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS event_signature (
  event_id         bigint PRIMARY KEY REFERENCES submission_event(id),
  org_id           text NOT NULL REFERENCES org,
  payload          text NOT NULL,
  signature        text NOT NULL,
  cert_pem         text NOT NULL,
  cert_fingerprint text NOT NULL,
  signed_at        timestamptz NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS pki_key_immutable ON pki_key;
CREATE TRIGGER pki_key_immutable BEFORE UPDATE OR DELETE ON pki_key FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS event_signature_immutable ON event_signature;
CREATE TRIGGER event_signature_immutable BEFORE UPDATE OR DELETE ON event_signature FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS event_signature_no_truncate ON event_signature;
CREATE TRIGGER event_signature_no_truncate BEFORE TRUNCATE ON event_signature FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
