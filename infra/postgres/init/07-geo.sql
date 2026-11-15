-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Vị trí cảm biến (WGS84) cho bản đồ và đầu ra NGSI-LD. Chạy lại được; áp vào CSDL đang chạy bằng
--   docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/07-geo.sql
ALTER TABLE sensor ADD COLUMN IF NOT EXISTS lat numeric CHECK (lat BETWEEN -90 AND 90);
ALTER TABLE sensor ADD COLUMN IF NOT EXISTS lon numeric CHECK (lon BETWEEN -180 AND 180);
ALTER TABLE sensor DROP CONSTRAINT IF EXISTS sensor_latlon_both;
ALTER TABLE sensor ADD CONSTRAINT sensor_latlon_both CHECK ((lat IS NULL) = (lon IS NULL));
