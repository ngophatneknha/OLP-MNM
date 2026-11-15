-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Kho dữ liệu lạnh: hồ sơ đã kết thúc được xuất ra tệp JSONL trong kho S3 (bucket dxlab-cold).
-- cold_archive là sổ cái băm nối chuỗi: mỗi dòng ghi mã băm của tệp và mã băm của dòng trước, sửa một byte ở đâu cũng lộ ra.
-- Cả hai bảng chỉ thêm, không sửa hay xóa (kể cả chủ sở hữu CSDL), như nhật ký kiểm toán.
CREATE TABLE cold_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigserial UNIQUE,
  object_key text NOT NULL,
  rows int NOT NULL CHECK (rows > 0),
  object_sha256 text NOT NULL CHECK (object_sha256 ~ '^[0-9a-f]{64}$'),
  prev_hash text NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  entry_hash text NOT NULL CHECK (entry_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE cold_item (
  submission_id uuid PRIMARY KEY REFERENCES submission(id),
  archive_id uuid NOT NULL REFERENCES cold_archive(id)
);
CREATE TRIGGER cold_archive_immutable BEFORE UPDATE OR DELETE ON cold_archive FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER cold_archive_no_truncate BEFORE TRUNCATE ON cold_archive FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
CREATE TRIGGER cold_item_immutable BEFORE UPDATE OR DELETE ON cold_item FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER cold_item_no_truncate BEFORE TRUNCATE ON cold_item FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
