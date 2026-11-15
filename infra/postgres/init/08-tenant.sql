-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Nhiều tổ chức, giai đoạn hai: mỗi tổ chức có một vai trò CSDL `bi_<mã tổ chức>` chỉ đọc được các view báo cáo bi.app_*
-- của ứng dụng thuộc tổ chức đó (công cụ BI của tổ chức nào dùng vai trò của tổ chức đó). Chạy lại được; áp vào CSDL đang chạy:
--   docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/08-tenant.sql
-- Vai trò tạo ở đây là NOLOGIN; muốn cho công cụ BI đăng nhập thì cấp mật khẩu: ALTER ROLE "bi_orgb" LOGIN PASSWORD '...'.
-- Mỗi view mới được cấp quyền khi ứng dụng xuất bản (services/workflow-bridge/compile.js, toViewSql).
CREATE OR REPLACE FUNCTION org_bi_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_' || NEW.id) THEN
    EXECUTE format('CREATE ROLE %I NOLOGIN', 'bi_' || NEW.id);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS org_bi_role ON org;
CREATE TRIGGER org_bi_role AFTER INSERT ON org FOR EACH ROW EXECUTE FUNCTION org_bi_role();

-- Tổ chức đã có và view đã có: tạo vai trò, cấp quyền theo tổ chức của từng ứng dụng.
DO $$
DECLARE o record; a record;
BEGIN
  FOR o IN SELECT id FROM org LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'bi_' || o.id) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', 'bi_' || o.id);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'bi') THEN
    FOR a IN SELECT key, org_id FROM app WHERE to_regclass('bi.app_' || key) IS NOT NULL LOOP
      EXECUTE format('GRANT USAGE ON SCHEMA bi TO %I', 'bi_' || a.org_id);
      EXECUTE format('GRANT SELECT ON bi.%I TO %I', 'app_' || a.key, 'bi_' || a.org_id);
    END LOOP;
  END IF;
END $$;
