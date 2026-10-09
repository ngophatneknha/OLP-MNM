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

## Definition of Done
Code + tiêu đề SPDX + tài liệu ngắn + chạy được bằng `docker compose up` + được review.
