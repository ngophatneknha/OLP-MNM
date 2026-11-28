-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Thuê bao NGSI-LD (ETSI GS CIM 009, mục Subscription): hệ thống bên ngoài đăng ký "khi số đo của Device thỏa điều kiện q
-- thì POST thông báo tới endpoint của tôi". Mỗi thuê bao thuộc một tổ chức; workflow-bridge gửi thông báo và ghi lại trạng thái.
-- Chạy lại được; áp vào CSDL đang chạy:
--   docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/09-ngsi.sql
CREATE TABLE IF NOT EXISTS ngsi_subscription (
  id text PRIMARY KEY CHECK (id ~ '^urn:ngsi-ld:Subscription:[A-Za-z0-9._:-]{1,100}$'),
  org_id text NOT NULL REFERENCES org,
  entity_type text NOT NULL DEFAULT 'Device' CHECK (entity_type = 'Device'),
  entity_id text,
  watched text[] NOT NULL DEFAULT '{value}',
  q text CHECK (length(q) <= 200),
  endpoint text NOT NULL CHECK (endpoint ~ '^https?://'),
  throttling integer CHECK (throttling >= 0),
  owner_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  times_sent integer NOT NULL DEFAULT 0,
  last_notification timestamptz,
  last_success timestamptz,
  last_failure timestamptz,
  last_error text
);
CREATE INDEX IF NOT EXISTS ngsi_subscription_org ON ngsi_subscription (org_id);
