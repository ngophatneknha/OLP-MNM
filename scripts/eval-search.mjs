// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Bộ đo tìm kiếm AI-02 trước khi triển khai: chất lượng, tốc độ, tải đồng thời, khởi động lại, lùi về từ khóa và rò rỉ quyền.
// Chỉ cần một Meilisearch (không cần cả hệ thống); Hasura và kho tệp được giả lập trong chế độ bao-mat.
//   docker run -d --name meili-eval -p 7700:7700 -e MEILI_MASTER_KEY=eval -e MEILI_NO_ANALYTICS=true \
//     -v meili-eval:/meili_data -v meili-models:/root/.cache/huggingface getmeili/meilisearch:v1.57.0
//   node scripts/eval-search.mjs <chế độ>      (MEILI_URL, MEILI_MASTER_KEY, EVAL_NOISE đổi qua biến môi trường)
// Chế độ:
//   tu-khoa | moi-minilm  đo một cấu hình: 6 nhóm câu hỏi trên kho 12 tài liệu đích + EVAL_NOISE tài liệu nhiễu
//   khoi-dong <cấu hình>   sau khi docker restart: thời gian tới khi tìm ngữ nghĩa trả lời được (nạp lại mô hình)
//   bao-mat                chạy đúng mã workflow-bridge (syncIndex, permittedHits) trên Meilisearch thật: 3 vai, kiểm không rò rỉ,
//                          kể cả khi mô hình nhúng hỏng (lùi về từ khóa)
//   qua-bridge             đo đúng đường đi của workflow-bridge (syncIndex, permittedHits) với cấu hình lấy từ biến môi trường:
//                          SEARCH_EMBEDDER=... (Meilisearch tự nhúng) hoặc VECTOR_URL + EMBED_URL (+ VECTOR_API_KEY, EMBED_*) cho Qdrant.
//                          Cùng 39 câu hỏi, nên so được Meilisearch với Qdrant trên cùng một mã. bao-mat cũng đổi sang Qdrant khi có VECTOR_URL.
//   nguong                 chỉ cần EMBED_URL (+ EMBED_API_KEY): điểm cosine của tài liệu đúng so với câu không có câu trả lời, có đặt được ngưỡng lọc không.
// Điểm: hit@1, hit@3 = tỉ lệ câu hỏi có tài liệu đúng ở hạng 1 / trong 3 hạng đầu; MRR = trung bình 1/hạng.

// files.js và s3.js đọc địa chỉ Hasura/kho tệp lúc nạp mô-đun: đặt địa chỉ giả trước khi nạp (chỉ dùng trong chế độ bao-mat).
Object.assign(process.env, { HASURA_URL: 'http://hasura', HASURA_ADMIN_SECRET: 'x', S3_URL: 'http://s3' })
const { chunks, searchRequest } = await import('../services/workflow-bridge/search.js')

const URL_ = process.env.MEILI_URL ?? 'http://localhost:7700'
const KEY = process.env.MEILI_MASTER_KEY ?? 'eval'
const NOISE = Number(process.env.EVAL_NOISE ?? 300)
const [MODE, ARG] = process.argv.slice(2)

const meili = async (method, path, body) => {
  const res = await fetch(`${URL_}${path}`, { method, headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
async function wait(uid) {
  for (;;) {
    const t = await meili('GET', `/tasks/${uid}`)
    if (t.status === 'succeeded') return (new Date(t.finishedAt) - new Date(t.startedAt)) / 1000
    if (t.status === 'failed' || t.status === 'canceled') throw new Error(`tác vụ ${uid} lỗi: ${t.error?.message}`)
    await new Promise((ok) => setTimeout(ok, 500))
  }
}
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))] }

// Văn bản độn để tạo tệp dài: thông tin cần tìm nằm sâu bên trong, như hợp đồng hay biên bản thật.
const filler = (topic, n) => Array.from({ length: n }, (_, i) => `Điều ${i + 1}. Các bên thực hiện đúng quy định chung về ${topic}, lưu hồ sơ đầy đủ và báo cáo định kỳ theo mẫu của phòng hành chính.`).join(' ')

const DOCS = [
  { id: 'd1', title: 'Đề nghị mua thiết bị số 12', name: 'de-nghi.txt', text: 'Mua 3 máy tính xách tay Dell Latitude cho phòng kế toán, mỗi máy 18 triệu đồng, giao trước ngày 30/11.' },
  { id: 'd2', title: 'Đề nghị nghỉ phép số 4', name: null, text: 'Xin nghỉ phép năm 5 ngày từ 02/12 đến 06/12 để về quê chăm mẹ ốm. Người thay thế: Lê Chi.' },
  { id: 'd3', title: 'Đề nghị tạm ứng số 7', name: 'tam-ung.txt', text: 'Tạm ứng 12 triệu đồng tiền vé máy bay và khách sạn cho chuyến công tác Đà Nẵng dự hội thảo chuyển đổi số.' },
  { id: 'd4', title: 'Hợp đồng bảo trì số 2', name: 'hop-dong-bao-tri.txt', text: `${filler('bảo trì', 25)} Điều khoản đặc biệt: bên B cam kết thay mới máy điều hòa trong vòng 48 giờ nếu sửa không được. ${filler('nghiệm thu', 15)}` },
  { id: 'd5', title: 'Biên bản họp số 9', name: 'bien-ban.txt', text: `${filler('họp giao ban', 20)} Kết luận: tạm dừng tuyển dụng nhân sự mới đến hết quý I năm sau để cắt giảm chi phí. ${filler('thông tin nội bộ', 10)}` },
  { id: 'd6', title: 'Đề nghị sửa chữa số 3', name: null, text: 'Máy in tầng 2 bị kẹt giấy liên tục, mực in ra nhòe, cần gọi kỹ thuật viên kiểm tra.' },
  { id: 'd7', title: 'Đề nghị thanh toán số 21', name: 'hoa-don.txt', text: 'Thanh toán hóa đơn tiền điện tháng 10 của văn phòng chi nhánh Cần Thơ, số tiền 7.450.000 đồng.' },
  { id: 'd8', title: 'Quy chế làm việc từ xa', name: 'quy-che.txt', text: `${filler('làm việc từ xa', 30)} Nhân viên được làm việc tại nhà tối đa hai ngày mỗi tuần nếu trưởng phòng đồng ý bằng văn bản. ${filler('an toàn thông tin', 10)}` },
  { id: 'd9', title: 'Đề nghị mua thiết bị số 15', name: null, text: 'Mua bàn ghế văn phòng cho 6 nhân viên mới của phòng kinh doanh.' },
  { id: 'd10', title: 'Đề nghị tạm ứng số 8', name: null, text: 'Tạm ứng 3 triệu đồng mua văn phòng phẩm: giấy A4, bút, kẹp tài liệu.' },
  { id: 'd11', title: 'Biên bản sự cố số 1', name: 'su-co.txt', text: `${filler('an toàn lao động', 20)} Sự cố: rò rỉ nước từ trần nhà phòng máy chủ làm ướt một tủ mạng, đã ngắt điện kịp thời. ${filler('khắc phục', 10)}` },
  { id: 'd12', title: 'Đề nghị nghỉ phép số 9', name: null, text: 'Xin nghỉ thai sản 6 tháng bắt đầu từ tháng 1, đã bàn giao công việc cho trưởng nhóm.' },
]

// Câu hỏi diễn đạt khác chữ trong tài liệu (người dùng thật hiếm khi nhớ đúng từ), kèm tài liệu đúng.
const QUERIES = [
  ['laptop cho bộ phận tài chính', 'd1'],
  ['mua máy tính xách tay', 'd1'],
  ['về nhà chăm người thân bị bệnh', 'd2'],
  ['xin ứng tiền đi công tác miền Trung', 'd3'],
  ['chi phí đi hội thảo', 'd3'],
  ['máy lạnh hỏng thì bao lâu được thay', 'd4'],
  ['ngừng tuyển người để tiết kiệm', 'd5'],
  ['có tuyển thêm nhân viên không', 'd5'],
  ['máy in bị lỗi', 'd6'],
  ['hóa đơn điện chi nhánh miền Tây', 'd7'],
  ['được làm ở nhà mấy ngày một tuần', 'd8'],
  ['nội thất cho nhân sự mới', 'd9'],
  ['mua giấy bút', 'd10'],
  ['nước dột vào phòng server', 'd11'],
  ['nghỉ sinh con', 'd12'],
]

// Tài liệu nhiễu sinh tất định (cùng hạt giống thì cùng kho): nhiều hồ sơ cùng loại với tài liệu đích để kết quả phải phân biệt thật.
function noiseDocs(n) {
  let seed = 42
  const rnd = (a) => a[(seed = (seed * 1103515245 + 12345) % 2147483648) % a.length]
  const ppl = ['Nguyễn An', 'Trần Bình', 'Phạm Dung', 'Hoàng Giang', 'Vũ Hà', 'Đặng Khoa', 'Bùi Linh', 'Đỗ Minh']
  const dept = ['phòng nhân sự', 'phòng kinh doanh', 'phòng kỹ thuật', 'phòng marketing', 'ban giám đốc', 'kho vận']
  const city = ['Hà Nội', 'Hải Phòng', 'Huế', 'Nha Trang', 'Vũng Tàu', 'Biên Hòa']
  const T = [
    () => ['Đề nghị mua thiết bị', `Mua ${rnd(['máy chiếu', 'màn hình 27 inch', 'máy in màu', 'ổ cứng gắn ngoài', 'bộ phát wifi', 'điện thoại bàn'])} cho ${rnd(dept)}, ngân sách ${rnd(['5', '9', '14', '22'])} triệu đồng.`],
    () => ['Đề nghị nghỉ phép', `Xin nghỉ ${rnd(['1', '2', '3'])} ngày vì ${rnd(['việc gia đình', 'đi khám răng', 'làm thủ tục nhà đất', 'đám cưới em gái'])}. Người thay thế: ${rnd(ppl)}.`],
    () => ['Đề nghị tạm ứng', `Tạm ứng ${rnd(['2', '4', '6', '8'])} triệu đồng chi phí ${rnd(['tiếp khách', 'in ấn tài liệu', 'mua quà tặng đối tác', 'xăng xe'])} tại ${rnd(city)}.`],
    () => ['Đề nghị thanh toán', `Thanh toán hóa đơn ${rnd(['tiền nước', 'internet', 'thuê văn phòng', 'vệ sinh tòa nhà'])} tháng ${rnd(['7', '8', '9', '11'])} của chi nhánh ${rnd(city)}.`],
    () => ['Đề nghị sửa chữa', `${rnd(['Cửa kính sảnh', 'Thang máy số 2', 'Đèn hành lang', 'Vòi nước nhà vệ sinh'])} bị hỏng, cần sửa trước ${rnd(['thứ hai', 'cuối tuần', 'ngày 15'])}.`],
    () => ['Biên bản họp', `Họp ${rnd(dept)} thống nhất ${rnd(['kế hoạch quý tới', 'chỉ tiêu doanh số', 'lịch trực lễ', 'quy trình duyệt chi'])}. Chủ trì: ${rnd(ppl)}.`],
  ]
  return Array.from({ length: n }, (_, i) => { const [kind, text] = rnd(T)(); return { id: `n${i}`, title: `${kind} số ${100 + i}`, name: null, text } })
}

// Sáu nhóm câu hỏi: người dùng thật gõ đủ kiểu, không chỉ diễn đạt lại.
const SETS = {
  'dien-dat-khac': QUERIES,
  'tra-dung-ma-so': [['Dell Latitude', 'd1'], ['7.450.000', 'd7'], ['Lê Chi', 'd2'], ['48 giờ', 'd4'], ['Đề nghị tạm ứng số 7', 'd3'], ['Cần Thơ', 'd7'], ['hội thảo chuyển đổi số', 'd3'], ['tủ mạng', 'd11']],
  'khong-dau': [['may tinh xach tay phong ke toan', 'd1'], ['nghi phep cham me om', 'd2'], ['tam ung ve may bay Da Nang', 'd3'], ['may in ket giay', 'd6'], ['hoa don tien dien Can Tho', 'd7'], ['lam viec tai nha', 'd8']],
  'go-sai': [['máy tín xách tay', 'd1'], ['hoá đơn tiền diện', 'd7'], ['nghĩ phép năm', 'd2'], ['máy điều hoà hư', 'd4'], ['tạm ứg tiền vé máy bay', 'd3'], ['rò rĩ nước phòng máy chủ', 'd11']],
  'nam-sau-tep-dai': [['bên B thay điều hòa trong 48 giờ', 'd4'], ['quý I tạm dừng tuyển dụng', 'd5'], ['làm tại nhà hai ngày mỗi tuần', 'd8'], ['ngắt điện tủ mạng bị ướt', 'd11']],
}
const OFF_TOPIC = ['công thức nấu phở bò', 'lịch thi đấu bóng đá', 'giá vàng hôm nay', 'cách học tiếng Nhật', 'thời tiết Hà Nội ngày mai']

const NEW = { source: 'huggingFace', pooling: 'forceMean', documentTemplate: '{{doc.title}} {{doc.name}}\n{{doc.text}}', documentTemplateMaxBytes: 1000 } // như bản sửa
const CONFIGS = {
  'tu-khoa': { note: 'main mặc định: chỉ từ khóa, cả tệp một tài liệu', chunked: false },
  'moi-minilm': { note: 'bản sửa + MiniLM', chunked: true, embedder: { ...NEW, model: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2', revision: 'e8f8c211226b894fcb81acc59f3b34ba3efd5f42' } },
}
const indexOf = (name) => `eval_${name.replace(/-/g, '_')}`

function docsFor(c) {
  const all = [...DOCS, ...noiseDocs(NOISE)]
  return c.chunked ? all.flatMap((d) => chunks(d.text).map((text, i) => ({ ...d, id: `${d.id}-${i}`, parent: d.id, text }))) : all.map((d) => ({ ...d, parent: d.id }))
}

async function search(name, c, q, limit = 5) {
  const [path, body] = searchRequest(q, c.embedder ? 'x' : '', 0.5, 0) // đúng yêu cầu mà workflow-bridge gửi đi
  for (const sub of body.queries ?? []) Object.assign(sub, { indexUid: indexOf(name), showRankingScore: true }) // tìm gộp: tham số đặt trong từng truy vấn
  const t0 = performance.now()
  const res = await meili('POST', path.replace('/indexes/docs/', `/indexes/${indexOf(name)}/`), body.federation ? { ...body, federation: { limit, offset: 0 } } : { ...body, showRankingScore: true, limit })
  return { ms: performance.now() - t0, hits: res.hits, score: res.hits[0] ? (res.hits[0]._federation?.weightedRankingScore ?? res.hits[0]._rankingScore) : 0 }
}

async function evaluate(name) {
  const c = CONFIGS[name]
  if (!c) throw new Error(`không có cấu hình ${name}`)
  const index = indexOf(name)
  const docs = docsFor(c)
  await meili('DELETE', `/indexes/${index}`).catch(() => {})
  await wait((await meili('POST', '/indexes', { uid: index, primaryKey: 'id' })).taskUid)
  const settings = { searchableAttributes: ['title', 'text', 'name'], ...(c.chunked && { distinctAttribute: 'parent' }), ...(c.embedder && { embedders: { default: c.embedder } }) }
  console.log(`${name} (${c.note}): ${docs.length} tài liệu (${12} đích + ${NOISE} nhiễu${c.chunked ? ', đã chia đoạn' : ''})`)
  const t0 = Date.now()
  await wait((await meili('PATCH', `/indexes/${index}/settings`, settings)).taskUid)
  const settingsSec = (Date.now() - t0) / 1000
  const indexSec = await wait((await meili('POST', `/indexes/${index}/documents`, docs)).taskUid)
  console.log(`  cài đặt (gồm tải/nạp mô hình) ${settingsSec.toFixed(1)} s; nạp ${indexSec.toFixed(1)} s = ${(indexSec / docs.length * 1000).toFixed(0)} ms/tài liệu`)

  const rows = []
  const scoresTop1 = []
  for (const [set, qs] of Object.entries(SETS)) {
    let h1 = 0, h3 = 0, mrr = 0
    const misses = []
    for (const [q, want] of qs) {
      const { hits, score } = await search(name, c, q)
      const rank = [...new Set(hits.map((h) => h.parent))].indexOf(want) + 1
      if (rank === 1) { h1++; scoresTop1.push(score) }
      if (rank && rank <= 3) h3++
      if (rank) mrr += 1 / rank
      else misses.push(q)
    }
    rows.push({ 'nhóm câu hỏi': set, 'số câu': qs.length, 'hit@1': `${h1}/${qs.length}`, 'hit@3': `${h3}/${qs.length}`, MRR: (mrr / qs.length).toFixed(2), 'không ra': misses.join(' | ') })
  }
  const total = rows.reduce((a, r) => { const [h1, n] = r['hit@1'].split('/').map(Number); const [h3] = r['hit@3'].split('/').map(Number); return { h1: a.h1 + h1, h3: a.h3 + h3, n: a.n + n } }, { h1: 0, h3: 0, n: 0 })
  rows.push({ 'nhóm câu hỏi': 'TỔNG', 'số câu': total.n, 'hit@1': `${total.h1}/${total.n}`, 'hit@3': `${total.h3}/${total.n}`, MRR: '', 'không ra': '' })
  console.table(rows)

  // Câu lạc đề: tìm ngữ nghĩa luôn trả về "láng giềng gần nhất"; so điểm để biết có đặt được ngưỡng loại kết quả rác không.
  const off = []
  for (const q of OFF_TOPIC) off.push(await search(name, c, q))
  console.log(`  câu lạc đề: ${off.filter((o) => o.hits.length).length}/${OFF_TOPIC.length} câu vẫn có kết quả; điểm cao nhất ${Math.max(...off.map((o) => o.score)).toFixed(3)}; điểm thấp nhất của câu trả đúng hạng 1: ${Math.min(...scoresTop1).toFixed(3)}`)

  // Tốc độ: tuần tự, rồi 8 người dùng đồng thời (mỗi câu hỏi 3 lượt).
  const all = Object.values(SETS).flat().map(([q]) => q)
  const seq = []
  for (const q of all) seq.push((await search(name, c, q)).ms)
  const jobs = [...all, ...all, ...all]
  const conc = []
  const t1 = performance.now()
  await Promise.all(Array.from({ length: 8 }, async () => { while (jobs.length) conc.push((await search(name, c, jobs.pop())).ms) }))
  const qps = conc.length / ((performance.now() - t1) / 1000)
  console.table([{ 'chế độ': 'tuần tự', p50: pct(seq, 0.5).toFixed(0), p95: pct(seq, 0.95).toFixed(0), 'câu/giây': '' }, { 'chế độ': '8 đồng thời', p50: pct(conc, 0.5).toFixed(0), p95: pct(conc, 0.95).toFixed(0), 'câu/giây': qps.toFixed(1) }])
}

async function coldStart(name) { // gọi ngay sau docker restart: đo tới khi tìm ngữ nghĩa trả lời được
  const t0 = Date.now()
  for (;;) {
    try { const r = await search(name, CONFIGS[name], 'máy tính cho kế toán'); console.log(`khoi-dong ${name}: trả lời được sau ${((Date.now() - t0) / 1000).toFixed(1)} s, câu đầu ${r.ms.toFixed(0)} ms`); return } catch { await new Promise((ok) => setTimeout(ok, 500)) }
    if (Date.now() - t0 > 600_000) throw new Error('quá 10 phút vẫn chưa tìm được')
  }
}

// Chạy đúng mã của workflow-bridge (nạp, tìm, kiểm quyền) trên Meilisearch thật; Hasura và kho tệp giả lập.
async function security() {
  const secret = 'mật-mã-lương-quý-4' // chỉ nằm trong tệp của hồ sơ s2 (thuộc người B)
  const SUBS = [
    { id: 's1', owner: 'A', title: 'Đề nghị mua thiết bị', file: 'Mua máy tính xách tay cho phòng kế toán, bảng lương phòng A.' },
    { id: 's2', owner: 'B', title: 'Bảng lương', file: `Tệp mật của phòng B. ${'Nội dung dài về chế độ. '.repeat(60)} Khóa: ${secret}. Bảng lương phòng B.` },
    { id: 's3', owner: 'B', title: 'Đề nghị nghỉ phép', file: 'Xin nghỉ phép về quê, ghi chú <script>alert(1)</script> bảng lương.' },
    // Trường hợp xấu (đều của người A): tệp 100.000 ký tự có thông tin ở cuối, emoji dày đặc, tệp rỗng, bảng CSV, tài liệu tiếng Anh.
    { id: 's4', owner: 'A', title: 'Hợp đồng bảo trì máy phát', file: `${filler('vận hành máy phát', 900)} Ghi chú cuối tệp: mã hợp đồng HD-2026-ZETA, máy phát điện dự phòng bị cháy cầu chì ngày 3/11.`.slice(-100_000) },
    { id: 's5', owner: 'A', title: 'Kế hoạch sự kiện', file: '😀🎉 hội nghị khách hàng thân thiết 🎉😀 '.repeat(400) },
    { id: 's6', owner: 'A', title: 'Tệp rỗng', file: '   \n\n  ' },
    { id: 's7', owner: 'A', title: 'Bảng báo giá', file: `ma,ten,so_tien\n${Array.from({ length: 300 }, (_, i) => `TB${i},Thiết bị ${i},${i * 1000}`).join('\n')}\nTB999,Máy chiếu Epson,15000000` },
    { id: 's8', owner: 'A', title: 'Purchase request', file: 'Purchase request for two forklifts for the Binh Duong warehouse, budget 800 million VND.' },
  ]
  const VISIBLE = { A: ['s1', 's4', 's5', 's6', 's7', 's8'], B: ['s2', 's3'], 'quan-ly': ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] }
  const EDGE = [ // [câu hỏi, hồ sơ phải tìm thấy (người A)]
    ['HD-2026-ZETA', 's4'], ['cầu chì máy phát điện', 's4'], ['máy phát dự phòng hỏng', 's4'], ['hội nghị khách hàng', 's5'],
    ['TB999 Máy chiếu Epson', 's7'], ['xe nâng cho kho Bình Dương', 's8'], ['forklift warehouse', 's8'],
    [`Cho tôi hỏi là ${'trong các hồ sơ của công ty mình thì '.repeat(8)}có hồ sơ nào đề nghị mua xe nâng cho kho ở Bình Dương không`, 's8'],
  ]
  const BAD_QUERIES = ['"', '-máy', '***', '😀😀', '<script>alert(1)</script>', "' OR 1=1 --", 'ab\u0000cd', 'ệ'.repeat(500), 'a'.repeat(501), '  ', 'x']
  const realFetch = fakeBackends(SUBS, VISIBLE)
  const results = []
  const modes = VEC.VECTOR_URL
    ? [['qdrant', VEC], ['qdrant, dịch vụ nhúng chết (lùi về từ khóa)', { ...VEC, EMBED_URL: 'http://127.0.0.1:9' }]]
    : [['từ khóa', {}], ['MiniLM', { SEARCH_EMBEDDER: 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2@e8f8c211226b894fcb81acc59f3b34ba3efd5f42' }], ['mô hình hỏng (lùi về từ khóa)', { SEARCH_EMBEDDER: 'khong-ton-tai/mo-hinh-gia' }]]
  for (const [label, env] of modes) {
    // Nạp lúc dịch vụ nhúng còn sống (lượt "chết" dùng lại dữ liệu đã nạp), rồi mới tắt nó để thử lùi về từ khóa.
    const { bridge, syncSec } = await freshBridge(label, label.includes('chết') ? VEC : env, !label.includes('chết'))
    if (label.includes('chết')) Object.assign(process.env, env)
    const leaks = []
    let ownFound = 0
    for (const who of Object.keys(VISIBLE)) {
      for (const q of [secret, 'bảng lương', 'tiền lương nhân viên', 'tài liệu mật', 'HD-2026-ZETA', 'xe nâng']) {
        const req = { headers: { authorization: `Bearer ${who}`, 'x-hasura-role': 'staff' } }
        let hits
        try { hits = await bridge.permittedHits(req, q, 20) } catch (err) { leaks.push(`${who} "${q}": LỖI ${err.message}`); continue }
        for (const h of hits) if (!VISIBLE[who].includes(h.submission_id)) leaks.push(`${who} thấy ${h.submission_id} với "${q}"`)
        // API trả chữ thuần (giao diện dựng nút văn bản, không v-html); đánh dấu từ khớp chỉ bằng « », không bao giờ chèn thẻ HTML.
        if (hits.some((h) => /<\/?em>/.test(h.snippet))) leaks.push(`${who}: đoạn trích bị chèn thẻ <em>`)
        if (q === secret && hits.some((h) => h.submission_id === 's2') && VISIBLE[who].includes('s2')) ownFound++
      }
    }
    // Trường hợp xấu: tìm đúng hồ sơ dù thông tin nằm cuối tệp lớn, giữa emoji, trong bảng, khác ngôn ngữ, hay câu hỏi rất dài.
    const edgeMiss = []
    for (const [q, want] of EDGE) {
      const hits = await bridge.permittedHits({ headers: { authorization: 'Bearer A', 'x-hasura-role': 'staff' } }, q.slice(0, 500), 5)
      const rank = hits.findIndex((h) => h.submission_id === want) + 1
      if (!rank || rank > 3) edgeMiss.push(`${q.slice(0, 40)}${q.length > 40 ? '…' : ''} (hạng ${rank || 'không có'})`)
    }
    // Đầu vào xấu qua đúng cổng /search: chỉ được trả 200 hoặc 400, không bao giờ 500/503.
    const badStatus = []
    for (const q of BAD_QUERIES) {
      const req = Object.assign((async function* () { yield JSON.stringify({ q }) })(), { method: 'POST', url: '/search', headers: { authorization: 'Bearer A', 'x-hasura-role': 'staff' } })
      let status
      const res = { writeHead: (st) => { status = st; return res }, end: () => {} }
      await bridge.handleSearch(req, res)
      if (![200, 400].includes(status)) badStatus.push(`${JSON.stringify(q.slice(0, 20))} → ${status}`)
    }
    const stats = await meili('GET', '/indexes/docs/stats')
    results.push({ 'chế độ': label, 'nạp (s)': syncSec.toFixed(1), 'số đoạn': stats.numberOfDocuments, 'rò rỉ / lỗi': leaks.length ? leaks.join('; ') : 'không', 'chủ tìm thấy tệp mật': `${ownFound}/2`, 'trường hợp xấu': `${EDGE.length - edgeMiss.length}/${EDGE.length}${edgeMiss.length ? ` — trượt: ${edgeMiss.join(' | ')}` : ''}`, 'đầu vào xấu': badStatus.length ? badStatus.join('; ') : 'không lỗi 5xx' })
  }
  globalThis.fetch = realFetch
  console.table(results)
}

// Cấu hình Qdrant lấy từ biến môi trường của lần chạy (không đặt thì đo Meilisearch như trước).
const VEC = Object.fromEntries(['VECTOR_URL', 'VECTOR_API_KEY', 'EMBED_URL', 'EMBED_API_KEY', 'EMBED_QUERY_PREFIX', 'EMBED_DOC_PREFIX'].filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]))

/** Giả lập Hasura và kho tệp: mỗi hồ sơ một tệp văn bản; visible[người] = các hồ sơ người đó được xem. Trả về fetch thật. */
function fakeBackends(subs, visible) {
  const realFetch = globalThis.fetch
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url)
    const json = (b) => new Response(JSON.stringify(b))
    if (u.startsWith('http://hasura')) {
      const body = JSON.parse(opts.body)
      if (opts.headers['x-hasura-admin-secret']) return json({ data: { submission: subs.map((s) => ({ id: s.id, no: s.no ?? 1, data: {}, submitter_name: s.owner, app: { name: s.title }, version: { spec: { fields: [] } }, events: [], attachments: [{ id: `f-${s.id}`, name: s.name ?? `${s.id}.txt`, size: s.file.length, content_type: 'text/plain', object_key: s.id }] })) } })
      const who = opts.headers.authorization.replace('Bearer ', '')
      return json({ data: { submission: body.variables.ids.filter((id) => visible[who].includes(id)).map((id) => ({ id })) } })
    }
    if (u.startsWith('http://s3')) return new Response(subs.find((s) => u.endsWith(`/${s.id}`)).file)
    return realFetch(url, opts)
  }
  return realFetch
}

/** Xóa chỉ mục (và kho véc-tơ), nạp search.js mới với cấu hình env, đồng bộ toàn bộ; trả về mô-đun và thời gian nạp. */
async function freshBridge(label, env, wipe = true) {
  for (const k of ['SEARCH_EMBEDDER', 'VECTOR_URL', 'VECTOR_API_KEY', 'EMBED_URL', 'EMBED_API_KEY', 'EMBED_QUERY_PREFIX', 'EMBED_DOC_PREFIX']) delete process.env[k]
  Object.assign(process.env, { MEILI_URL: URL_, MEILI_MASTER_KEY: KEY, HASURA_URL: 'http://hasura', HASURA_ADMIN_SECRET: 'x', S3_URL: 'http://s3' }, env)
  if (wipe) {
    await meili('DELETE', '/indexes/docs').catch(() => {})
    if (env.VECTOR_URL) await fetch(`${env.VECTOR_URL}/collections/docs`, { method: 'DELETE', headers: env.VECTOR_API_KEY ? { 'api-key': env.VECTOR_API_KEY } : {} })
  }
  const bridge = await import(`../services/workflow-bridge/search.js?${encodeURIComponent(label)}-${Date.now()}`)
  const t0 = Date.now()
  if (wipe) {
    await bridge.syncIndex()
    for (let i = 0; i < 600; i++) { const s = await meili('GET', '/indexes/docs/stats'); if (!s.isIndexing) break; await new Promise((ok) => setTimeout(ok, 1000)) }
  }
  return { bridge, syncSec: (Date.now() - t0) / 1000 }
}

/** 39 câu hỏi và tốc độ qua đúng mã workflow-bridge (kể cả kiểm quyền), với cấu hình từ biến môi trường. */
async function viaBridge() {
  const all = [...DOCS, ...noiseDocs(NOISE)]
  const subs = all.map((d) => { const [kind, no] = d.title.split(' số '); return { id: d.id, owner: 'A', title: kind, no, name: d.name ?? `${d.id}.txt`, file: d.text } })
  const realFetch = fakeBackends(subs, { A: subs.map((s) => s.id) })
  const label = VEC.VECTOR_URL ? `qdrant (tiền tố hỏi "${VEC.EMBED_QUERY_PREFIX ?? ''}")` : `meili ${process.env.SEARCH_EMBEDDER || 'từ khóa'}`
  const env = VEC.VECTOR_URL ? VEC : { SEARCH_EMBEDDER: process.env.SEARCH_EMBEDDER ?? '' }
  const { bridge, syncSec } = await freshBridge(label, env)
  console.log(`qua-bridge ${label}: ${subs.length} hồ sơ (12 đích + ${NOISE} nhiễu); đồng bộ ${syncSec.toFixed(1)} s = ${(syncSec / subs.length * 1000).toFixed(0)} ms/hồ sơ`)
  const req = { headers: { authorization: 'Bearer A', 'x-hasura-role': 'staff' } }
  const ask = async (q) => { const t0 = performance.now(); const hits = await bridge.permittedHits(req, q, 5); return { ms: performance.now() - t0, hits } }
  const rows = []
  for (const [set, qs] of Object.entries(SETS)) {
    let h1 = 0, h3 = 0, mrr = 0
    const misses = []
    for (const [q, want] of qs) {
      const { hits } = await ask(q)
      const ranked = [...new Set(hits.map((h) => h.submission_id))]
      const rank = ranked.indexOf(want) + 1
      if (rank === 1) h1++
      if (rank && rank <= 3) h3++
      if (rank) mrr += 1 / rank
      if (rank !== 1) misses.push(`${q} (hạng ${rank || '>5'}, đầu: ${ranked[0] ?? 'không có'})`)
    }
    rows.push({ 'nhóm câu hỏi': set, 'số câu': qs.length, 'hit@1': `${h1}/${qs.length}`, 'hit@3': `${h3}/${qs.length}`, MRR: (mrr / qs.length).toFixed(2), 'không đứng đầu': misses.join(' | ') })
  }
  const total = rows.reduce((a, r) => { const [h1, n] = r['hit@1'].split('/').map(Number); const [h3] = r['hit@3'].split('/').map(Number); return { h1: a.h1 + h1, h3: a.h3 + h3, n: a.n + n } }, { h1: 0, h3: 0, n: 0 })
  rows.push({ 'nhóm câu hỏi': 'TỔNG', 'số câu': total.n, 'hit@1': `${total.h1}/${total.n}`, 'hit@3': `${total.h3}/${total.n}`, MRR: '', 'không đứng đầu': '' })
  console.table(rows)
  const qs = Object.values(SETS).flat().map(([q]) => q)
  const seq = []
  for (const q of qs) seq.push((await ask(q)).ms)
  const jobs = [...qs, ...qs, ...qs]
  const conc = []
  const t1 = performance.now()
  await Promise.all(Array.from({ length: 8 }, async () => { while (jobs.length) conc.push((await ask(jobs.pop())).ms) }))
  console.table([{ 'chế độ': 'tuần tự', p50: pct(seq, 0.5).toFixed(0), p95: pct(seq, 0.95).toFixed(0), 'câu/giây': '' }, { 'chế độ': '8 đồng thời', p50: pct(conc, 0.5).toFixed(0), p95: pct(conc, 0.95).toFixed(0), 'câu/giây': (conc.length / ((performance.now() - t1) / 1000)).toFixed(1) }])
  globalThis.fetch = realFetch
}

/** Ngưỡng điểm ngữ nghĩa: so cosine của tài liệu đúng với cosine cao nhất của câu không có câu trả lời (chỉ cần EMBED_URL). */
async function threshold() {
  const { embed, docText } = await import('../services/workflow-bridge/vector.js')
  const docs = [...DOCS, ...noiseDocs(NOISE)].flatMap((d) => chunks(d.text).map((text) => ({ ...d, parent: d.id, text })))
  const dv = await embed(docs.map(docText), process.env.EMBED_DOC_PREFIX)
  const ask = async (q) => { const [v] = await embed([q], process.env.EMBED_QUERY_PREFIX); return dv.map((d, i) => [d.reduce((a, x, j) => a + x * v[j], 0), docs[i].parent]).sort((a, b) => b[0] - a[0]) }
  const right = []
  for (const [q, want] of Object.values(SETS).flat()) right.push([(await ask(q)).find(([, p]) => p === want)[0], q])
  const codes = Array.from({ length: 5 }, (_, i) => `quyetdinh${(i * 7919).toString(16)}a3f9c`).concat(['HOPDONGQTXVMK', 'BANQUETRSPWYN'])
  const none = []
  for (const q of [...OFF_TOPIC, ...codes]) none.push([(await ask(q))[0][0], q])
  right.sort((a, b) => a[0] - b[0]); none.sort((a, b) => b[0] - a[0])
  console.log('Điểm thấp nhất của tài liệu đúng:'); console.table(right.slice(0, 10).map(([s, q]) => ({ q, 'điểm': s.toFixed(3) })))
  console.log('Điểm cao nhất của câu không có câu trả lời:'); console.table(none.map(([s, q]) => ({ q, 'điểm': s.toFixed(3) })))
  for (const t of [0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5]) console.log(`ngưỡng ${t}: giữ ${right.filter(([s]) => s >= t).length}/${right.length} tài liệu đúng, loại ${none.filter(([s]) => s < t).length}/${none.length} câu không có câu trả lời`)
}

if (MODE === 'nguong') await threshold()
else if (MODE === 'bao-mat') await security()
else if (MODE === 'qua-bridge') await viaBridge()
else if (MODE === 'khoi-dong') await coldStart(ARG)
else await evaluate(MODE)
