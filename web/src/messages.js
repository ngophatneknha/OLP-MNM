// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Bảng dịch vi/en. Tách riêng khỏi i18n.js để kiểm thử được mà không cần Vue.

export const MESSAGES = {
  vi: {
    'space.H': 'Con người', 'space.P': 'Quy trình', 'space.D': 'Dữ liệu', 'space.I': 'Trí tuệ',
    'nav.home': 'Bàn làm việc', 'nav.submit': 'Gửi hồ sơ', 'nav.docs': 'Tài liệu', 'nav.stats': 'Số liệu',
    'nav.processes': 'Quy trình', 'nav.assistant': 'Trợ lý AI', 'nav.builder': 'Soạn quy trình',
    'nav.board': 'Bảng công việc', 'nav.calendar': 'Lịch', 'nav.profile': 'Cá nhân',
    'nav.main': 'Điều hướng chính', 'nav.skip': 'Đi tới nội dung', 'nav.logout': 'Đăng xuất', 'nav.language': 'Ngôn ngữ',
    'role.staff': 'Nhân viên', 'role.manager': 'Trưởng phòng', 'role.director': 'Giám đốc', 'role.accountant': 'Kế toán',
    'status.running': 'Đang xử lý', 'status.approved': 'Hoàn tất', 'status.rejected': 'Bị từ chối',
    'board.title': 'Bảng công việc', 'board.lead': 'Hồ sơ theo tình trạng, như bảng Kanban. Cột “Chờ bạn” là việc của riêng bạn.',
    'board.mine': 'Chờ bạn', 'board.others': 'Đang chờ người khác', 'board.empty': 'Trống', 'board.more': 'hồ sơ khác', 'board.loading': 'Đang tải…',
    'cal.title': 'Lịch', 'cal.lead': 'Hồ sơ theo ngày gửi và ngày hoàn tất. Bấm vào một hồ sơ để mở.', 'cal.today': 'Hôm nay',
    'cal.prev': 'Tháng trước', 'cal.next': 'Tháng sau', 'cal.sent': 'gửi', 'cal.finished': 'xong',
    'me.title': 'Trang cá nhân', 'me.lead': 'Thông tin của bạn và các thông báo mới.', 'me.role': 'Vai trò', 'me.sent': 'Hồ sơ đã gửi',
    'me.waiting': 'Chờ bạn xử lý', 'me.notices': 'Thông báo', 'me.none': 'Chưa có thông báo nào.',
    'me.live': 'Thông báo tự cập nhật mỗi vài giây.',
    'notice.waiting': 'cần bạn xử lý', 'notice.approved': 'đã được duyệt', 'notice.rejected': 'bị từ chối', 'notice.done': 'đã hoàn tất',
  },
  en: {
    'space.H': 'Human', 'space.P': 'Process', 'space.D': 'Data', 'space.I': 'Intelligence',
    'nav.home': 'Workbench', 'nav.submit': 'New request', 'nav.docs': 'Documents', 'nav.stats': 'Metrics',
    'nav.processes': 'Processes', 'nav.assistant': 'AI assistant', 'nav.builder': 'Design a process',
    'nav.board': 'Work board', 'nav.calendar': 'Calendar', 'nav.profile': 'Profile',
    'nav.main': 'Main navigation', 'nav.skip': 'Skip to content', 'nav.logout': 'Sign out', 'nav.language': 'Language',
    'role.staff': 'Staff', 'role.manager': 'Manager', 'role.director': 'Director', 'role.accountant': 'Accountant',
    'status.running': 'In progress', 'status.approved': 'Completed', 'status.rejected': 'Rejected',
    'board.title': 'Work board', 'board.lead': 'Requests by status, like a Kanban board. The “Waiting for you” column is your own work.',
    'board.mine': 'Waiting for you', 'board.others': 'Waiting for others', 'board.empty': 'Empty', 'board.more': 'more', 'board.loading': 'Loading…',
    'cal.title': 'Calendar', 'cal.lead': 'Requests by the day they were sent and finished. Click one to open it.', 'cal.today': 'Today',
    'cal.prev': 'Previous month', 'cal.next': 'Next month', 'cal.sent': 'sent', 'cal.finished': 'done',
    'me.title': 'Profile', 'me.lead': 'Your details and recent notifications.', 'me.role': 'Role', 'me.sent': 'Requests sent',
    'me.waiting': 'Waiting for you', 'me.notices': 'Notifications', 'me.none': 'No notifications yet.',
    'me.live': 'Notifications refresh every few seconds.',
    'notice.waiting': 'needs your action', 'notice.approved': 'was approved', 'notice.rejected': 'was rejected', 'notice.done': 'was completed',
  },
}
