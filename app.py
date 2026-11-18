import hashlib
import hmac
import logging
import os
from datetime import timedelta

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory, session
from google import genai

# .env 파일에 저장된 환경변수(GEMINI_API_KEY, APP_PASSWORD 등)를 불러옵니다.
load_dotenv()

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_secret_key() -> str:
    """세션 쿠키 서명에 사용할 비밀 키를 반환합니다."""
    explicit = os.getenv("FLASK_SECRET_KEY", "").strip()
    if explicit:
        return explicit
    seed = f"{os.getenv('APP_PASSWORD', '')}:{os.getenv('GEMINI_API_KEY', '')}:doc-draft-builder"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


app.secret_key = get_secret_key()
app.permanent_session_lifetime = timedelta(days=7)
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

MODEL_NAME = "gemini-3.5-flash-lite"

ALLOWED_DOC_TYPES = {"보도자료", "안내문", "기안문", "결과 보고", "업무 메일"}


def format_input_summary(data: dict) -> str:
    """사용자가 입력한 문서 정보를 AI에게 전달할 텍스트로 정리합니다."""
    doc_type = (data.get("doc_type") or "").strip()
    title = (data.get("title") or "").strip()
    recipient = (data.get("recipient") or "").strip() or "(입력 없음)"
    tone = (data.get("tone") or "공식적").strip()

    facts = data.get("facts") or {}
    fact_lines = [
        f"- 일시: {(facts.get('date_time') or '').strip() or '(입력 없음)'}",
        f"- 장소: {(facts.get('location') or '').strip() or '(입력 없음)'}",
        f"- 대상: {(facts.get('target') or '').strip() or '(입력 없음)'}",
        f"- 신청 방법: {(facts.get('how_to_apply') or '').strip() or '(입력 없음)'}",
        f"- 문의처: {(facts.get('contact') or '').strip() or '(입력 없음)'}",
    ]

    return (
        f"[문서 기본 정보]\n"
        f"- 문서 종류: {doc_type}\n"
        f"- 제목: {title}\n"
        f"- 받는 사람: {recipient}\n"
        f"- 어조: {tone}\n\n"
        f"[핵심 사실]\n"
        + "\n".join(fact_lines)
    )


def build_prompt(data: dict) -> str:
    """선택한 Prompt 방식(A 또는 B)에 따라 AI에게 보낼 요청문을 만듭니다."""
    doc_type = (data.get("doc_type") or "").strip()
    tone = (data.get("tone") or "공식적").strip()
    prompt_type = (data.get("prompt_type") or "A").strip().upper()
    summary = format_input_summary(data)

    if prompt_type == "B":
        return (
            f"당신은 대학 행정 업무 문서 작성 전문가입니다.\n"
            f"아래 입력 정보를 바탕으로 '{doc_type}' 초안을 마크다운(Markdown) 형식으로 작성해 주세요.\n\n"
            f"[필수 작성 규칙]\n"
            f"1. 대학 행정 문서 체크리스트를 적용하세요:\n"
            f"   - 6하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)이 빠짐없이 드러나도록 점검하세요.\n"
            f"   - 요청된 어조('{tone}')를 반영하되, 정중한 공식 문체와 행정 문서의 품격을 유지하세요.\n"
            f"   - 문의처 정보를 반드시 포함하세요.\n"
            f"2. 입력에 없는 내용은 절대 지어내지 말고 반드시 [확인 필요]로 표시하세요.\n"
            f"   (예: 일시, 장소, 대상, 신청 방법, 문의처, 받는 사람 등 '(입력 없음)'으로 되어 있거나 구체적 내용이 없으면 추측하지 말고 [확인 필요]라고 적으세요.)\n\n"
            f"{summary}"
        )

    return (
        f"아래 입력 정보를 바탕으로 '{doc_type}' 문서 초안을 작성해 주세요.\n\n"
        f"{summary}"
    )


@app.route("/")
def index():
    """메인 웹페이지를 보여줍니다."""
    return render_template(
        "index.html",
        is_authenticated=bool(session.get("authenticated")),
    )


@app.route("/manifest.webmanifest")
def manifest():
    """PWA 매니페스트 파일을 제공합니다."""
    return send_from_directory(
        app.static_folder,
        "manifest.webmanifest",
        mimetype="application/manifest+json",
    )


@app.route("/sw.js")
def service_worker():
    """루트 스코프에서 동작하도록 서비스 워커 파일을 제공합니다."""
    return send_from_directory(
        os.path.join(app.static_folder, "js"),
        "sw.js",
        mimetype="application/javascript",
    )


@app.route("/api/auth/login", methods=["POST"])
def login():
    """환경변수 APP_PASSWORD와 비교해 로그인 세션을 발급합니다."""
    configured_pw = os.getenv("APP_PASSWORD", "").strip()
    if len(configured_pw) < 8:
        logger.error("APP_PASSWORD가 설정되지 않았거나 8자리 미만입니다.")
        return (
            jsonify(
                {
                    "error": "서버에 8자리 이상의 APP_PASSWORD가 설정되지 않았습니다. .env 또는 Vercel 환경변수를 확인해 주세요."
                }
            ),
            500,
        )

    data = request.get_json(silent=True) or {}
    submitted_pw = (data.get("password") or "").strip()

    if len(submitted_pw) < 8:
        return jsonify({"error": "비밀번호는 8자리 이상 입력해 주세요."}), 400

    if not hmac.compare_digest(submitted_pw, configured_pw):
        return jsonify({"error": "비밀번호가 올바르지 않습니다."}), 401

    session.permanent = True
    session["authenticated"] = True
    return jsonify({"ok": True})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    """현재 로그인 세션을 종료합니다."""
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/generate", methods=["POST"])
def generate_draft():
    """사용자 입력을 검증한 뒤 Gemini API로 문서 초안을 생성합니다."""
    if not session.get("authenticated"):
        return (
            jsonify({"error": "비밀번호 인증이 필요합니다. 먼저 로그인해 주세요."}),
            401,
        )

    data = request.get_json(silent=True) or {}

    doc_type = (data.get("doc_type") or "").strip()
    title = (data.get("title") or "").strip()

    if not doc_type or not title:
        return jsonify({"error": "문서 종류와 제목은 필수 입력 항목입니다."}), 400

    if doc_type not in ALLOWED_DOC_TYPES:
        return jsonify({"error": "올바른 문서 종류를 선택해 주세요."}), 400

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.error("GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.")
        return (
            jsonify(
                {
                    "error": "서버에 API 키가 설정되지 않았습니다. .env 파일의 GEMINI_API_KEY를 확인해 주세요."
                }
            ),
            500,
        )

    prompt_text = build_prompt(data)

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt_text,
        )
        draft = (response.text or "").strip()
        if not draft:
            logger.error("Gemini API가 빈 응답을 반환했습니다.")
            return (
                jsonify(
                    {
                        "error": "AI가 초안을 생성하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요."
                    }
                ),
                502,
            )

        return jsonify({"draft": draft})
    except Exception:
        logger.exception("Gemini API 호출 중 오류가 발생했습니다.")
        return (
            jsonify(
                {
                    "error": "문서 초안을 생성하는 중 일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
                }
            ),
            500,
        )


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
