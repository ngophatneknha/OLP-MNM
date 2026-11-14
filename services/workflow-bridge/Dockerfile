# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Image đóng gói sẵn của workflow-bridge để phát hành lên GitHub Packages. Không có thư viện bên thứ ba nào cần cài
# (chỉ dùng thư viện chuẩn của Node.js). docker-compose.yml vẫn chạy trực tiếp từ mã nguồn trong thư mục này.

FROM node:22.19.0-alpine
WORKDIR /app
COPY *.js ./
USER node
CMD ["node", "bridge.js"]
