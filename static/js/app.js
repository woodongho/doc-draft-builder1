document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("draftForm");
  const docTypeInput = document.getElementById("docType");
  const titleInput = document.getElementById("title");
  const recipientInput = document.getElementById("recipient");
  const toneInput = document.getElementById("tone");

  const factDateTime = document.getElementById("factDateTime");
  const factLocation = document.getElementById("factLocation");
  const factTarget = document.getElementById("factTarget");
  const factHowToApply = document.getElementById("factHowToApply");
  const factContact = document.getElementById("factContact");

  const errorMessage = document.getElementById("errorMessage");
  const loadingBox = document.getElementById("loadingBox");
  const generateBtn = document.getElementById("generateBtn");
  const draftOutput = document.getElementById("draftOutput");
  const draftPreview = document.getElementById("draftPreview");
  const previewTabBtn = document.getElementById("previewTabBtn");
  const editTabBtn = document.getElementById("editTabBtn");
  const fillSampleBtn = document.getElementById("fillSampleBtn");
  const copyBtn = document.getElementById("copyBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const copyFeedback = document.getElementById("copyFeedback");

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function formatInline(text) {
    return escapeHtml(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }

  function renderMarkdown(markdownText) {
    const trimmed = (markdownText || "").trim();
    if (!trimmed) {
      return '<p class="preview-placeholder">왼쪽에서 정보를 입력하고 [초안 생성] 버튼을 누르면 여기에 보기 좋게 정리된 초안이 표시됩니다.</p>';
    }

    const lines = trimmed.split(/\r?\n/);
    const html = [];
    let inUl = false;
    let inOl = false;
    let inTable = false;

    const closeLists = () => {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
    };

    const closeTable = () => {
      if (inTable) {
        html.push("</tbody></table>");
        inTable = false;
      }
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();

      if (!line) {
        closeLists();
        closeTable();
        continue;
      }

      if (/^---+$/.test(line)) {
        closeLists();
        closeTable();
        html.push("<hr>");
        continue;
      }

      if (line.startsWith("|") && line.endsWith("|")) {
        closeLists();
        const cells = line
          .slice(1, -1)
          .split("|")
          .map((cell) => cell.trim());

        const nextLine = (lines[i + 1] || "").trim();
        const isSeparator = /^\|?[\s:-]+\|/.test(nextLine) && !/[a-zA-Z0-9가-힣]/.test(nextLine.replace(/[\|\s:-]/g, ""));

        if (!inTable && isSeparator) {
          html.push("<table><thead><tr>");
          cells.forEach((cell) => html.push(`<th>${formatInline(cell)}</th>`));
          html.push("</tr></thead><tbody>");
          inTable = true;
          i += 1;
          continue;
        }

        if (inTable) {
          html.push("<tr>");
          cells.forEach((cell) => html.push(`<td>${formatInline(cell)}</td>`));
          html.push("</tr>");
          continue;
        }
      } else {
        closeTable();
      }

      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        closeLists();
        const level = headingMatch[1].length;
        html.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
        continue;
      }

      if (line.startsWith(">")) {
        closeLists();
        html.push(`<blockquote>${formatInline(line.replace(/^>\s?/, ""))}</blockquote>`);
        continue;
      }

      const ulMatch = line.match(/^[-*]\s+(.+)$/);
      if (ulMatch) {
        if (inOl) {
          html.push("</ol>");
          inOl = false;
        }
        if (!inUl) {
          html.push("<ul>");
          inUl = true;
        }
        html.push(`<li>${formatInline(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = line.match(/^\d+\.\s+(.+)$/);
      if (olMatch) {
        if (inUl) {
          html.push("</ul>");
          inUl = false;
        }
        if (!inOl) {
          html.push("<ol>");
          inOl = true;
        }
        html.push(`<li>${formatInline(olMatch[1])}</li>`);
        continue;
      }

      closeLists();
      html.push(`<p>${formatInline(line)}</p>`);
    }

    closeLists();
    closeTable();
    return html.join("\n");
  }

  function updateActionButtons() {
    const hasDraft = Boolean(draftOutput.value.trim());
    copyBtn.disabled = !hasDraft;
    downloadBtn.disabled = !hasDraft;
  }

  function switchView(mode) {
    const isPreview = mode === "preview";
    if (isPreview) {
      draftPreview.innerHTML = renderMarkdown(draftOutput.value);
    }
    draftPreview.hidden = !isPreview;
    draftOutput.hidden = isPreview;
    previewTabBtn.classList.toggle("active", isPreview);
    editTabBtn.classList.toggle("active", !isPreview);
    previewTabBtn.setAttribute("aria-selected", String(isPreview));
    editTabBtn.setAttribute("aria-selected", String(!isPreview));
    if (!isPreview) {
      draftOutput.focus();
    }
  }

  previewTabBtn.addEventListener("click", () => switchView("preview"));
  editTabBtn.addEventListener("click", () => switchView("edit"));
  draftOutput.addEventListener("input", updateActionButtons);

  fillSampleBtn.addEventListener("click", () => {
    clearError();
    docTypeInput.value = "안내문";
    toneInput.value = "공식적";
    titleInput.value = "2026학년도 2학기 교내 장학금 신청 안내";
    recipientInput.value = "학부 재학생 전체";
    factDateTime.value = "2026. 11. 25.(수) ~ 12. 4.(금) 18:00";
    factLocation.value = "학생회관 2층 학생지원팀 (온라인 신청 병행)";
    factTarget.value = "2026학년도 2학기 학부 재학생 (휴학생 제외)";
    factHowToApply.value = "대학 포털 시스템 로그인 > 장학 > 장학금 신청 메뉴";
    factContact.value = "학생지원팀 장학 담당자 (02-1234-5678)";
  });

  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  }

  function clearError() {
    errorMessage.textContent = "";
    errorMessage.hidden = true;
  }

  function setLoading(isLoading) {
    loadingBox.hidden = !isLoading;
    generateBtn.disabled = isLoading;
    if (isLoading) {
      copyBtn.disabled = true;
      downloadBtn.disabled = true;
      copyFeedback.textContent = "";
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();

    const docType = docTypeInput.value.trim();
    const title = titleInput.value.trim();

    if (!docType || !title) {
      showError("문서 종류와 제목은 필수 입력 항목입니다. 입력 후 다시 시도해 주세요.");
      if (!docType) {
        docTypeInput.focus();
      } else {
        titleInput.focus();
      }
      return;
    }

    const selectedPrompt = document.querySelector('input[name="prompt_type"]:checked');
    const promptType = selectedPrompt ? selectedPrompt.value : "A";

    const payload = {
      doc_type: docType,
      title: title,
      recipient: recipientInput.value.trim(),
      tone: toneInput.value,
      prompt_type: promptType,
      facts: {
        date_time: factDateTime.value.trim(),
        location: factLocation.value.trim(),
        target: factTarget.value.trim(),
        how_to_apply: factHowToApply.value.trim(),
        contact: factContact.value.trim(),
      },
    };

    setLoading(true);
    draftOutput.value = "";
    draftPreview.innerHTML = renderMarkdown("");

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        showError(data.error || "초안 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }

      draftOutput.value = data.draft || "";
      switchView("preview");
      updateActionButtons();
    } catch (error) {
      showError("서버와 통신할 수 없습니다. 서버가 실행 중인지 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  });

  copyBtn.addEventListener("click", async () => {
    const rawMarkdown = draftOutput.value;
    if (!rawMarkdown.trim()) return;

    const isPreviewMode = !draftPreview.hidden;

    if (!isPreviewMode) {
      try {
        await navigator.clipboard.writeText(rawMarkdown);
        copyFeedback.textContent = "마크다운 원본이 클립보드에 복사되었습니다.";
      } catch (error) {
        draftOutput.select();
        document.execCommand("copy");
        copyFeedback.textContent = "마크다운 원본이 클립보드에 복사되었습니다.";
      }
      return;
    }

    const plainText = draftPreview.innerText.trim();
    const htmlContent = draftPreview.innerHTML;

    try {
      if (window.ClipboardItem && navigator.clipboard.write) {
        const item = new ClipboardItem({
          "text/html": new Blob([htmlContent], { type: "text/html" }),
          "text/plain": new Blob([plainText], { type: "text/plain" }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }
      copyFeedback.textContent = "보기 좋은 서식(미리보기)으로 복사되었습니다.";
    } catch (error) {
      try {
        await navigator.clipboard.writeText(plainText);
        copyFeedback.textContent = "보기 좋은 서식(미리보기)으로 복사되었습니다.";
      } catch (fallbackError) {
        const range = document.createRange();
        range.selectNodeContents(draftPreview);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand("copy");
        selection.removeAllRanges();
        copyFeedback.textContent = "보기 좋은 서식(미리보기)으로 복사되었습니다.";
      }
    }
  });

  downloadBtn.addEventListener("click", () => {
    const text = draftOutput.value;
    if (!text) return;

    const rawTitle = titleInput.value.trim() || "문서초안";
    const safeTitle = rawTitle.replace(/[\\/:*?"<>|]/g, "_");
    const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });
});
