#!/usr/bin/env python3
"""
AI Hub 「교과 단계별 교과 데이터」 → 모르미 커리큘럼 지식베이스 변환기.

성취기준 코드 하나를 뽑아 세 갈래로 정리한다:
  concepts   — 개념 서술 문장   → 교안 카드(수업 준비 단계) 재료
  dictionary — 질문·답 쌍       → 궁금해 사전(정답의 최종 보루)
  visuals    — 그림·수식 이미지 → 시각적 반증 자료

오개념(misconception)은 이 데이터에 없으므로 비워 둔다 — 직접 작성해 병합한다.

사용:
  python3 scripts/build_curriculum.py "[4수01-11]"
  python3 scripts/build_curriculum.py "[4수01-11]" --out mormi-web/content/curriculum
"""

import argparse
import json
import re
import unicodedata
from collections import Counter
from pathlib import Path

DATA_ROOT = Path(
    "data/28.교과단계별 교과 데이터/3.개방데이터/1.데이터/Training"
)
LABEL_DIR = DATA_ROOT / "02.라벨링데이터"
SOURCE_DIR = DATA_ROOT / "01.원천데이터"

# 개념 서술로 볼 만한 일반화 표현 (특정 문제 풀이가 아니라 규칙을 말하는 문장)
CONCEPT_MARKERS = [
    "클수록", "작을수록", "커집니다", "작아집니다", "커져", "작아져",
    "같으면", "같으므로", "같을 때", "비교할 때", "비교하는 방법",
    "비교합니다", "나타내어", "쪽이 더", "기억하세요", "라고 합니다",
    "알 수 있습니다", "구합니다",
]

# ---------- 정제 ----------

LATEX_FRAC = re.compile(r"\\d?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}")
LATEX_TEXT = re.compile(r"\\(?:text|mathrm|mbox)\s*\{([^{}]*)\}")
LATEX_ENV = re.compile(r"\\(?:begin|end)\{[^{}]*\}")
LATEX_CMD = re.compile(r"\\[a-zA-Z]+\s*")

# 긴 명령을 먼저 치환한다 (\cdots 가 \cdot 으로 잘려 "·s" 가 남는 것을 방지)
SYMBOLS = {
    r"\cdots": "…", r"\ldots": "…", r"\dots": "…",
    r"\square": "□", r"\Rightarrow": "→", r"\Leftarrow": "←",
    r"\times": "×", r"\div": "÷", r"\cdot": "·", r"\neq": "≠",
    r"\geq": "≥", r"\leq": "≤", r"\gg": ">", r"\ll": "<",
    r"\quad": " ", r"\;": " ", r"\,": " ", r"\!": "", r"\\": " ",
}

# 시각적 반증에 쓸 만한 그림인지 — 분수 표현·크기 비교를 담은 것만
VISUAL_MARKERS = [
    "분수", "등분", "칠", "색칠", "나눈", "나누어", "비교", "크기",
    "막대", "원", "직사각형", "전체를 1", "/",
]


def clean(text: str) -> str:
    """LaTeX·HTML 잔재를 걷어내고 아이가 읽을 수 있는 문장으로 정리."""
    if not text:
        return ""
    t = unicodedata.normalize("NFC", text)

    if "<table" in t or "<div" in t:  # HTML 표는 본문으로 쓰지 않는다
        return ""

    t = LATEX_FRAC.sub(lambda m: f"{m.group(1).strip()}/{m.group(2).strip()}", t)
    t = LATEX_TEXT.sub(lambda m: m.group(1), t)
    t = LATEX_ENV.sub(" ", t)
    for k, v in SYMBOLS.items():
        t = t.replace(k, v)
    t = LATEX_CMD.sub(" ", t)
    t = t.replace("$", "").replace("&", " ").replace("\\hline", " ")
    t = re.sub(r"[{}\[\]]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def is_english(text: str) -> bool:
    """영어 어노테이션 혼입분 제외 (한국어 교재인데 영어 QA가 섞여 있음)."""
    letters = sum(c.isascii() and c.isalpha() for c in text)
    hangul = sum("가" <= c <= "힣" for c in text)
    return letters > 10 and letters > hangul


def is_concept(text: str) -> bool:
    """특정 계산이 아니라 규칙을 말하는 문장인지."""
    if len(text) < 15:
        return False
    if not any(m in text for m in CONCEPT_MARKERS):
        return False
    digits = sum(c.isdigit() for c in text)
    return digits / len(text) < 0.25  # 숫자투성이면 문제 풀이로 본다


# ---------- 변환 ----------

def build(code: str, out_dir: Path) -> dict:
    concepts, dictionary, visuals = [], [], []
    seen_concept, seen_qa = set(), set()
    standard_text = ""
    grade = subject = ""
    class_counter = Counter()

    for path in sorted(LABEL_DIR.glob("*/*.json")):
        try:
            d = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue

        std = d.get("source_data_info", {}).get("2022_achievement_standard") or [""]
        std_text = (std[0] or "").strip()
        if not std_text.startswith(code):
            continue

        standard_text = standard_text or std_text
        raw = d.get("raw_data_info", {})
        grade = grade or raw.get("grade", "")
        subject = subject or raw.get("subject", "")

        info = d.get("learning_data_info", {})
        class_name = info.get("class_name", "")
        class_counter[class_name] += 1
        name = info.get("learning_data_name", path.stem)

        desc = clean(info.get("text_description", ""))
        qa = clean(info.get("text_qa", ""))
        an = clean(info.get("text_an", ""))

        # 개념 문장 (한글만 남긴 키로 중복 제거 — 예시 숫자만 다른 문장을 하나로)
        if class_name == "텍스트" and desc and not is_english(desc) and is_concept(desc):
            key = re.sub(r"[^가-힣]", "", desc)
            if key not in seen_concept:
                seen_concept.add(key)
                concepts.append({"text": desc, "source": name})

        # 사전 QA
        if qa and an and not is_english(qa) and not is_english(an):
            key = re.sub(r"\s|[?.,]", "", qa)
            if key not in seen_qa:
                seen_qa.add(key)
                dictionary.append({"q": qa, "a": an, "source": name})

        # 시각 자료 — 분수 표현·비교를 담은 그림만 (무관한 삽화 제외)
        if (
            class_name.startswith("이미지")
            and desc
            and not is_english(desc)
            and any(m in desc for m in VISUAL_MARKERS)
        ):
            folder = "02.이미지" if "_IMG_" in name else "01.텍스트"
            png = SOURCE_DIR / f"TS_01.초등학교 3학년_03.수학_{folder}" / f"{name}.png"
            visuals.append({
                "caption": desc,
                "kind": class_name,
                "image": str(png) if png.exists() else None,
                "source": name,
            })

    result = {
        "standard": code,
        "standard_text": standard_text,
        "grade": grade,
        "subject": subject,
        "counts": {
            "total_labeled": sum(class_counter.values()),
            "concepts": len(concepts),
            "dictionary": len(dictionary),
            "visuals": len(visuals),
            "by_class": dict(class_counter),
        },
        # 아래 두 필드는 이 데이터에 없다 — 오개념 라이브러리는 직접 작성해 병합한다.
        "misconceptions": [],
        "prep_card": "",
        "concepts": concepts,
        "dictionary": dictionary,
        "visuals": visuals,
    }

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{code.strip('[]')}.json"
    out_path.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return result, out_path


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("code", help="성취기준 코드, 예: [4수01-11]")
    ap.add_argument("--out", default="mormi-web/content/curriculum")
    args = ap.parse_args()

    result, out_path = build(args.code, Path(args.out))
    c = result["counts"]
    print(f"{result['standard']} {result['standard_text']}")
    print(f"  라벨 {c['total_labeled']}건 → 개념 {c['concepts']} / "
          f"사전 {c['dictionary']} / 시각 {c['visuals']}")
    print(f"  저장: {out_path}")


if __name__ == "__main__":
    main()
