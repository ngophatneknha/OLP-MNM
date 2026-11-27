-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Mốc của hộp thư đi (outbox) cho trục sự kiện NATS (services/workflow-bridge/stream.js): sự kiện submission_event cuối cùng đã được
-- JetStream xác nhận. Chạy lại được; áp vào CSDL đang chạy:
--   docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/10-stream.sql
CREATE TABLE IF NOT EXISTS stream_cursor (
  name text PRIMARY KEY,
  last_id bigint NOT NULL CHECK (last_id >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
