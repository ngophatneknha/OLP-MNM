# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Caddy dựng kèm Coraza (WAF mã nguồn mở, Apache-2.0) và bộ luật OWASP CRS. Chỉ dùng cho profile "waf".
FROM caddy:2.11-builder AS build
RUN xcaddy build --with github.com/corazawaf/coraza-caddy/v2@v2.6.2

FROM caddy:2.11-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
