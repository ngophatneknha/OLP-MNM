<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Hướng dẫn đóng góp

## Quy trình
1. Mỗi việc là một **Issue** (nhãn: `bug`, `feature`, `pof`, `layer-1`, `layer-2`, `docs`).
2. Tạo nhánh từ `main`: `feat/<ten>`, `fix/<ten>`, `docs/<ten>`.
3. Commit theo [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`...).
4. Mở Pull Request; cần CI xanh và ≥ 1 người review mới merge vào `main`.

## Quy tắc giấy phép
- Mọi tệp mã/cấu hình mới phải có tiêu đề SPDX:
  ```
  SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
  SPDX-License-Identifier: Apache-2.0
  ```
- Kiểm tra cục bộ: `pip install reuse && reuse lint`.
- Không sửa mã nguồn của thư viện/gói bên thứ ba; cập nhật [THIRD_PARTY.md](THIRD_PARTY.md) khi thêm thành phần.

## Phát hành phiên bản

Mỗi lần đẩy thay đổi vào `main` đi kèm một phiên bản mới theo [SemVer](https://semver.org/lang/vi/): sửa lỗi tăng số cuối, tính năng mới tăng số giữa, thay đổi phá vỡ tăng số đầu. Mỗi phiên bản cần: (1) mục mới trong `CHANGELOG.md`, (2) cập nhật `version` trong `web/package.json` và `web/package-lock.json`, (3) thẻ `vX.Y.Z` và bản phát hành GitHub kèm `dxlab-project-hub-X.Y.Z.tar.gz` (`git archive --format=tar.gz --prefix=dxlab-project-hub-X.Y.Z/ vX.Y.Z`).

## Definition of Done
Code + tiêu đề SPDX + tài liệu ngắn + chạy được bằng `docker compose up` + được review.

## Đóng góp một quy trình vào kho mẫu

Quy trình hay của tổ chức bạn có thể giúp tổ chức khác không phải làm lại từ đầu:

1. Trong ứng dụng, mở "Tạo ứng dụng", soạn quy trình rồi bấm **Tải tệp JSON để chia sẻ**.
2. Đặt tệp vào thư mục `library/` (tên tệp trùng với `key`), điền `category` và `description`.
3. Chạy `node --test services/workflow-bridge/compile.test.js` để chắc tệp hợp lệ, rồi mở Pull Request.

Không đưa dữ liệu thật hay tên riêng của tổ chức vào tệp mẫu.
