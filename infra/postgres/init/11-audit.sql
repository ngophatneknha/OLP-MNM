-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Nhật ký thay đổi dữ liệu (audit_log): mỗi lần thêm, sửa, xóa một dòng ở các bảng còn sửa được ghi lại ai làm, lúc nào,
-- qua đường nào, cột nào đổi từ giá trị gì sang giá trị gì, và mã truy vết (trace_id) của yêu cầu gây ra thay đổi.
-- Bảng vốn đã chỉ thêm (submission_event, sensor_reading, cold_archive, event_signature) không cần ghi lại ở đây.
-- Chạy lại được; áp vào CSDL đang chạy: sh scripts/migrate.sh
--
-- Ba điều cần biết:
--  - Chỉ thêm, không sửa hay xóa (kể cả chủ sở hữu CSDL qua câu lệnh thường), và nối chuỗi mã băm như sổ cái kho lạnh:
--    xóa hay sửa lén một dòng (bằng quyền siêu quản trị) làm audit_broken() báo đúng dòng bị phá.
--  - Không chép dữ liệu cá nhân vào một nơi không xóa được: cột nhạy cảm (dữ liệu hồ sơ, tên người, nội dung tự do, khóa)
--    chỉ ghi {"changed": true}; giá trị thật nằm ở bảng gốc, nơi lệnh xóa theo Luật Bảo vệ dữ liệu cá nhân vẫn làm được.
--  - Người làm lấy từ phiên Hasura (claim của token đã được cổng API xác thực), hoặc từ dx.actor / tiêu đề x-hasura-dx-actor do
--    workflow-bridge đặt khi làm thay người dùng; không có thì là quyền quản trị (admin, migration, psql).
--  - Người dùng gọi thẳng GraphQL thì dòng không có trace_id: Hasura bản cộng đồng không đưa traceparent vào phiên; chuỗi truy vết
--    của yêu cầu đó vẫn có ở cổng APISIX (Jaeger), tìm theo thời điểm và người làm.

CREATE TABLE IF NOT EXISTS audit_log (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at         timestamptz NOT NULL DEFAULT clock_timestamp(),
  table_name text NOT NULL,
  row_key    text NOT NULL,
  op         text NOT NULL CHECK (op IN ('INSERT', 'UPDATE', 'DELETE')),
  org_id     text,
  actor_id   text NOT NULL,
  actor_role text,
  via        text NOT NULL CHECK (via IN ('hasura', 'bridge', 'admin')),
  changes    jsonb NOT NULL,
  trace_id   text CHECK (trace_id ~ '^[0-9a-f]{32}$'),
  prev_hash  text NOT NULL,
  entry_hash text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_log_row ON audit_log (table_name, row_key, id);
CREATE INDEX IF NOT EXISTS audit_log_org ON audit_log (org_id, id);
CREATE INDEX IF NOT EXISTS audit_log_trace ON audit_log (trace_id) WHERE trace_id IS NOT NULL;

DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();

-- Mã băm của một dòng: dòng trước + các trường của dòng này, thời gian viết theo UTC để không phụ thuộc múi giờ của phiên.
CREATE OR REPLACE FUNCTION audit_hash(prev text, a audit_log) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT encode(sha256(convert_to(concat_ws('|', prev, a.id, to_char(a.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
    a.table_name, a.row_key, a.op, coalesce(a.org_id, ''), a.actor_id, coalesce(a.actor_role, ''), a.via, a.changes::text,
    coalesce(a.trace_id, '')), 'UTF8')), 'hex')
$$;

-- Trigger chung. Tham số: (1) cột khóa, cách nhau bởi dấu phẩy; (2) cột nhạy cảm chỉ ghi "đã đổi";
-- (3) cột bỏ qua (đổi liên tục do hệ thống, như số đo cuối của cảm biến): lần sửa chỉ đổi các cột này thì không ghi.
CREATE OR REPLACE FUNCTION audit_row() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  keys      text[] := string_to_array(TG_ARGV[0], ',');
  sensitive text[] := coalesce(string_to_array(nullif(TG_ARGV[1], ''), ','), '{}');
  ignored   text[] := coalesce(string_to_array(nullif(TG_ARGV[2], ''), ','), '{}');
  o jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  r jsonb := coalesce(n, o);
  ch jsonb := '{}';
  k text;
  usr jsonb := nullif(current_setting('hasura.user', true), '')::jsonb;
  actor text := nullif(current_setting('dx.actor', true), '');
  trace text := nullif(current_setting('dx.trace_id', true), '');
  org text;
  a audit_log;
  prev text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(r) LOOP
    CONTINUE WHEN k = ANY(ignored) OR coalesce(o -> k, 'null') = coalesce(n -> k, 'null');
    ch := ch || jsonb_build_object(k, CASE WHEN k = ANY(sensitive) THEN '{"changed": true}'::jsonb
                                          ELSE jsonb_strip_nulls(jsonb_build_object('old', o -> k, 'new', n -> k)) END);
  END LOOP;
  IF ch = '{}' THEN RETURN NULL; END IF;

  org := r ->> 'org_id';
  IF TG_TABLE_NAME = 'org' THEN org := r ->> 'id'; END IF;
  IF org IS NULL AND r ? 'app_key' THEN SELECT p.org_id INTO org FROM app p WHERE p.key = r ->> 'app_key'; END IF;
  IF org IS NULL AND r ? 'submission_id' THEN SELECT s.org_id INTO org FROM submission s WHERE s.id = (r ->> 'submission_id')::uuid; END IF;

  a.table_name := TG_TABLE_NAME;
  a.row_key := (SELECT string_agg(r ->> c, ':' ORDER BY i) FROM unnest(keys) WITH ORDINALITY AS t(c, i));
  a.op := TG_OP;
  a.org_id := org;
  a.changes := ch;
  trace := coalesce(trace, usr ->> 'x-hasura-dx-trace-id');
  a.trace_id := CASE WHEN trace ~ '^[0-9a-f]{32}$' THEN trace END;
  IF usr ? 'x-hasura-user-id' THEN
    a.via := 'hasura'; a.actor_id := usr ->> 'x-hasura-user-id'; a.actor_role := usr ->> 'x-hasura-role';
  ELSIF usr ? 'x-hasura-dx-actor' THEN
    -- workflow-bridge gọi GraphQL bằng khóa quản trị, kèm tiêu đề x-hasura-dx-* (services/workflow-bridge/db.js, adminHeaders).
    a.via := 'bridge'; a.actor_id := usr ->> 'x-hasura-dx-actor'; a.actor_role := usr ->> 'x-hasura-dx-role';
  ELSIF actor IS NOT NULL THEN
    a.via := 'bridge'; a.actor_id := actor; a.actor_role := nullif(current_setting('dx.actor_role', true), '');
  ELSE
    a.via := 'admin'; a.actor_id := session_user; a.actor_role := coalesce(usr ->> 'x-hasura-role', 'admin');
  END IF;

  -- Một khóa cho cả bảng để chuỗi băm đi đúng thứ tự (giữ tới hết giao dịch; các lần ghi khác chờ rất ngắn).
  PERFORM pg_advisory_xact_lock(hashtext('dxlab-audit'));
  SELECT l.entry_hash INTO prev FROM audit_log l ORDER BY l.id DESC LIMIT 1;
  a.id := nextval(pg_get_serial_sequence('audit_log', 'id'));
  a.at := clock_timestamp();
  a.prev_hash := coalesce(prev, repeat('0', 64));
  a.entry_hash := audit_hash(a.prev_hash, a);
  INSERT INTO audit_log (id, at, table_name, row_key, op, org_id, actor_id, actor_role, via, changes, trace_id, prev_hash, entry_hash) OVERRIDING SYSTEM VALUE
  VALUES (a.id, a.at, a.table_name, a.row_key, a.op, a.org_id, a.actor_id, a.actor_role, a.via, a.changes, a.trace_id, a.prev_hash, a.entry_hash);
  RETURN NULL;
END $$;

-- Kiểm chuỗi: trả về các dòng bị phá (nội dung bị sửa, dòng phía trước bị xóa hay bị chèn); chuỗi nguyên vẹn thì không có dòng nào.
CREATE OR REPLACE FUNCTION audit_broken() RETURNS TABLE (id bigint, problem text) LANGUAGE sql STABLE AS $$
  SELECT v.id, v.problem FROM (
    SELECT l.id, l.prev_hash, l.entry_hash, lag(l.entry_hash) OVER (ORDER BY l.id) AS before, audit_hash(l.prev_hash, l) AS recomputed
    FROM audit_log l
  ) x JOIN LATERAL (SELECT x.id,
      CASE WHEN x.prev_hash IS DISTINCT FROM coalesce(x.before, repeat('0', 64)) THEN 'mất hoặc chèn dòng phía trước'
           WHEN x.entry_hash IS DISTINCT FROM x.recomputed THEN 'nội dung dòng bị sửa' END AS problem) v ON v.problem IS NOT NULL
  ORDER BY v.id
$$;

-- Gắn trigger vào các bảng còn sửa được: bảng, cột khóa, cột nhạy cảm, cột bỏ qua.
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
    ('app',               'key',               'spec,owner_name',                                     ''),
    ('app_change',        'id',                'spec,checks,note,review_note,author_name,reviewer_name', ''),
    ('app_issue',         'id',                'title,body,author_name',                              ''),
    ('submission',        'id',                'data,submitter_name',                                 ''),
    ('attachment',        'id',                'name,uploader_name',                                  ''),
    ('step_autonomy',     'app_key,step_key',  '',                                                    ''),
    ('ai_opinion',        'id',                'reason',                                              ''),
    ('sensor',            'key',               'owner_name,token_hash',                               'last_value,last_at'),
    ('org',               'id',                '',                                                    ''),
    ('pki_key',           'subject',           'cert_pem,key_enc',                                    ''),
    ('ngsi_subscription', 'id',                'q',                                                   'times_sent,last_notification,last_success,last_failure,last_error')
  ) AS v(tbl, keys, sensitive, ignored) LOOP
    IF to_regclass('public.' || t.tbl) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit ON %I', t.tbl);
      EXECUTE format('CREATE TRIGGER audit AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION audit_row(%L, %L, %L)',
        t.tbl, t.keys, t.sensitive, t.ignored);
    END IF;
  END LOOP;
END $$;

-- Dòng đời dữ liệu trong bảng Iceberg của kho lạnh (infra/duckdb/lake.py ghi): tệp JSONL nào được nạp vào ảnh chụp (snapshot) nào,
-- lúc nào; hồ sơ nào bị xóa theo yêu cầu (chỉ lưu mã băm SHA-256 của mã hồ sơ, giống thuộc tính dxlab.forgotten của bảng).
-- API /lineage/submission/{id} của workflow-bridge ghép bảng này với cold_item để biết một hồ sơ đang nằm ở ảnh chụp nào.
CREATE TABLE IF NOT EXISTS lake_event (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at             timestamptz NOT NULL DEFAULT now(),
  operation      text NOT NULL CHECK (operation IN ('load', 'forget', 'compact', 'expire')),
  object_key     text,
  snapshot_id    text,
  rows           integer,
  subject_sha256 text CHECK (subject_sha256 ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS lake_event_object ON lake_event (object_key) WHERE object_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS lake_event_subject ON lake_event (subject_sha256) WHERE subject_sha256 IS NOT NULL;
DROP TRIGGER IF EXISTS lake_event_immutable ON lake_event;
CREATE TRIGGER lake_event_immutable BEFORE UPDATE OR DELETE ON lake_event FOR EACH ROW EXECUTE FUNCTION forbid_change();
DROP TRIGGER IF EXISTS lake_event_no_truncate ON lake_event;
CREATE TRIGGER lake_event_no_truncate BEFORE TRUNCATE ON lake_event FOR EACH STATEMENT EXECUTE FUNCTION forbid_change();
