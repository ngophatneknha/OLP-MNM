// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Luồng riêng cho extractPdfTextIsolated (pdftext.js): nhận byte của tệp, trả kết quả, rồi bị dừng.

import { parentPort, workerData } from 'node:worker_threads'
import { extractPdfText } from './pdftext.js'

const { data, limits } = workerData
parentPort.postMessage(extractPdfText(Buffer.from(data.buffer, data.byteOffset, data.byteLength), limits))
