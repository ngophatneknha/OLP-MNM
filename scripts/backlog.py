#!/usr/bin/env python3
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
"""Công cụ làm việc với docs/BACKLOG.md.

  python scripts/backlog.py progress [--write]   # thống kê tiến độ (và ghi vào BACKLOG.md)
  python scripts/backlog.py issues [--apply]     # tạo labels/milestones/Issues bằng gh CLI

Mặc định `issues` chỉ chạy thử (in ra việc sẽ làm). Cần `gh auth login` trước khi --apply.
"""
import argparse
import collections
import json
import pathlib
import re
import subprocess
import sys

BACKLOG = pathlib.Path(__file__).resolve().parent.parent / "docs" / "BACKLOG.md"

ITEM_RE = re.compile(
    r"^- \[(?P<done>[ xX])\] \*\*(?P<id>[A-Z]+-\d+)\*\* (?P<title>.+?) — "
    r"`(?P<owner>[A-Z]+)` · Tuần (?P<week>\d+) · (?P<prio>MVP|Stretch)\s*$"
)
HEADING_RE = re.compile(r"^## (?P<key>[A-Z]+) — (?P<name>.+)$")

# Hạn (cuối tuần) của từng milestone, định dạng ISO.
WEEK_DUE = {
    0: "2026-10-18", 1: "2026-10-25", 2: "2026-11-01", 3: "2026-11-08",
    4: "2026-11-15", 5: "2026-11-22", 6: "2026-11-29", 7: "2026-12-06", 8: "2026-12-10",
}
OWNER_NAMES = {"A": "Platform & Security", "B": "Data & Workflow", "C": "Product, Frontend & Docs", "ALL": "Cả đội"}


def parse():
    items, epics, epic, current = [], {}, None, None
    for raw in BACKLOG.read_text(encoding="utf-8").splitlines():
        h = HEADING_RE.match(raw)
        if h:
            epic = h["key"]
            epics[epic] = h["name"]
            current = None
            continue
        m = ITEM_RE.match(raw)
        if m and epic:
            current = {
                "id": m["id"], "title": m["title"], "owner": m["owner"], "week": int(m["week"]),
                "prio": m["prio"], "done": m["done"].lower() == "x", "epic": epic, "notes": [],
            }
            items.append(current)
        elif current and raw.startswith("  - "):
            current["notes"].append(raw.strip()[2:])
        elif raw.strip() and not raw.startswith("  "):
            current = None
    return items, epics


def bar(done, total, width=10):
    filled = round(width * done / total) if total else 0
    return "█" * filled + "░" * (width - filled)


def progress_table(items, epics):
    by_epic = collections.OrderedDict((k, [0, 0, 0, 0]) for k in epics)  # done, total, mvp_done, mvp_total
    for it in items:
        row = by_epic[it["epic"]]
        row[1] += 1
        row[0] += it["done"]
        if it["prio"] == "MVP":
            row[3] += 1
            row[2] += it["done"]
    lines = ["| Nhóm | Hoàn thành | MVP | Tiến độ |", "|---|---|---|---|"]
    td = tt = md = mt = 0
    for k, (d, t, mvd, mvt) in by_epic.items():
        lines.append(f"| {k} — {epics[k]} | {d}/{t} | {mvd}/{mvt} | {bar(d, t)} {100 * d // t if t else 0}% |")
        td, tt, md, mt = td + d, tt + t, md + mvd, mt + mvt
    lines.append(f"| **Tổng** | **{td}/{tt}** | **{md}/{mt}** | {bar(td, tt)} {100 * td // tt if tt else 0}% |")
    return "\n".join(lines)


def cmd_progress(args):
    items, epics = parse()
    table = progress_table(items, epics)
    print(table)
    if args.write:
        text = BACKLOG.read_text(encoding="utf-8")
        new = re.sub(
            r"<!-- progress:start -->.*?<!-- progress:end -->",
            lambda _: f"<!-- progress:start -->\n{table}\n<!-- progress:end -->",
            text, flags=re.S,
        )
        BACKLOG.write_text(new, encoding="utf-8", newline="\n")
        print("\nĐã cập nhật bảng tiến độ trong", BACKLOG.name)


def gh(*cmd, apply):
    shown = "gh " + " ".join(cmd)
    if not apply:
        print("[dry-run]", shown[:200])
        return ""
    res = subprocess.run(["gh", *cmd], capture_output=True, text=True, encoding="utf-8")
    if res.returncode != 0:
        print("LỖI:", shown[:120], "\n", res.stderr.strip(), file=sys.stderr)
    return res.stdout


def cmd_issues(args):
    items, epics = parse()
    apply = args.apply
    existing = set()
    if apply:
        out = gh("issue", "list", "--state", "all", "--limit", "500", "--json", "title", apply=True)
        existing = {i["title"] for i in json.loads(out or "[]")}

    labels = {f"epic:{k}": "1d76db" for k in epics}
    labels.update({"MVP": "b60205", "Stretch": "fbca04"})
    labels.update({f"owner:{o}": "0e8a16" for o in OWNER_NAMES})
    labels.update({"pof": "5319e7", "good first issue": "7057ff"})
    for name, color in labels.items():
        gh("label", "create", name, "--color", color, "--force", apply=apply)

    for week, due in WEEK_DUE.items():
        gh("api", "repos/{owner}/{repo}/milestones", "-f", f"title=Tuần {week}",
           "-f", f"due_on={due}T23:59:59Z", apply=apply)

    for it in items:
        title = f"[{it['id']}] {it['title']}"
        if title in existing:
            continue
        notes = "\n".join(f"- {n}" for n in it["notes"]) or "_Chưa có ghi chú._"
        body = (
            f"**Nhóm:** {it['epic']} — {epics[it['epic']]}\n"
            f"**Phụ trách:** {it['owner']} ({OWNER_NAMES.get(it['owner'], '')})\n"
            f"**Tuần:** {it['week']} · **Ưu tiên:** {it['prio']}\n\n"
            f"{notes}\n\n"
            "Nguồn: `docs/BACKLOG.md`. Thỏa *Definition of Done* chung trước khi đóng."
        )
        cmd = ["issue", "create", "--title", title, "--body", body,
               "--label", f"epic:{it['epic']}", "--label", it["prio"],
               "--label", f"owner:{it['owner']}", "--milestone", f"Tuần {it['week']}"]
        if it["epic"] == "POF":
            cmd += ["--label", "pof"]
        gh(*cmd, apply=apply)
    print(f"\n{'Đã tạo' if apply else 'Sẽ tạo'} tối đa {len(items)} issue (bỏ qua issue trùng tiêu đề).")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)
    sp = sub.add_parser("progress")
    sp.add_argument("--write", action="store_true")
    sp.set_defaults(fn=cmd_progress)
    si = sub.add_parser("issues")
    si.add_argument("--apply", action="store_true")
    si.set_defaults(fn=cmd_issues)
    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
