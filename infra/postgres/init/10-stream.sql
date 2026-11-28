-- SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
-- SPDX-License-Identifier: Apache-2.0
--
-- Hộp thư đi (outbox) cho trục sự kiện NATS (services/workflow-bridge/stream.js). Chạy lại được; áp vào CSDL đang chạy:
--   docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/10-stream.sql
-- Bản thân dòng submission_event là lệnh duyệt (cùng một lệnh INSERT, cùng giao dịch), nên không có "duyệt rồi mà quên ghi sự kiện".

-- Mỗi sự kiện đã được JetStream xác nhận (ack) có một dòng ở đây. Đánh dấu từng dòng thay vì một mốc "id cuối": số id
-- của giao dịch commit trễ nhỏ hơn id đã phát, chỉ dùng mốc thì sự kiện đó bị bỏ sót mãi.
CREATE TABLE IF NOT EXISTS stream_published (
  event_id     bigint PRIMARY KEY REFERENCES submission_event(id),
  published_at timestamptz NOT NULL DEFAULT now()
);

-- last_id: mốc dưới (mọi sự kiện có id <= mốc đã phát, dòng stream_published tương ứng được dọn) để truy vấn không quét lại cả bảng.
-- holder, lease_until: hợp đồng thuê (lease) để chỉ một tiến trình bridge phát tại một thời điểm khi chạy nhiều bản.
CREATE TABLE IF NOT EXISTS stream_cursor (
  name text PRIMARY KEY,
  last_id bigint NOT NULL CHECK (last_id >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE stream_cursor ADD COLUMN IF NOT EXISTS holder text;
ALTER TABLE stream_cursor ADD COLUMN IF NOT EXISTS lease_until timestamptz;
INSERT INTO stream_cursor (name, last_id) VALUES ('submission_event', 0) ON CONFLICT (name) DO NOTHING;
